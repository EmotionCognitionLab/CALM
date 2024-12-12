'use strict';
const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
const th = require('../../common-test/test-helper.js');
const fs = require('fs/promises');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
const lambdaLocal = require("lambda-local");
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
const s3Client = new S3Client({endpoint: process.env.S3_ENDPOINT, apiVersion: '2006-03-01', forcePathStyle: true, region: process.env.REGION});
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
const dynClient = new DynamoDBClient({region: process.env.REGION, endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: "2012-08-10"});
const docClient = DynamoDBDocumentClient.from(dynClient);
import Db from '../../../../common/db/db.js';
import { statusTypes } from '../../../../common/types/types.js';

const originPrefix = 'emails';
const emailKey = `${originPrefix}/7pweiur83jfjeif`;
const reportKey = `${originPrefix}/2022-09-10-09-00-58-324.game_result_report.csv`;
const engagementKey = `${originPrefix}/2022-09-13-09-00-30-347.daily_engagement_report.csv`;
const usersTable = process.env.USERS_TABLE;
const lumosAcctTable = process.env.LUMOS_ACCT_TABLE;
const lumosPlaysTable = process.env.LUMOS_PLAYS_TABLE;
const toLATime = (dtStr) => dayjs(dtStr).tz('America/Los_Angeles').format('YYYY-MM-DD HH:mm:ss');

afterEach(async () => {
    await th.s3.removeBucket(process.env.DEST_BUCKET);
});

describe("Saving the email attachment to S3", () => {
    describe('A valid attachment', () => {
        beforeAll(async () => {
            await th.s3.removeBucket(process.env.DEST_BUCKET);
            const emailText = await fs.readFile(path.join(__dirname, 'email-with-attachment.mime.txt'));
            await th.s3.addFile(process.env.DEST_BUCKET, emailKey, emailText);
        });
    
        test("should be saved to s3", async() => {
            const result = await runAttachmentLambda();
            expect(result.status).toBe('success');

            const files = await s3Client.send(new ListObjectsV2Command({
                Bucket: process.env.DEST_BUCKET,
                Prefix: process.env.DEST_PREFIX
            }));
            expect(files.Contents.length).toBe(1);
        });
    });
    
    describe('A missing attachment', () => {
        beforeAll(async () => {
            const emailText = await fs.readFile(path.join(__dirname, 'email-without-attachment.mime.txt'));
            await th.s3.addFile(process.env.DEST_BUCKET, emailKey, emailText);
        });
    
        test("should succeed", async() => {
            const result = await runAttachmentLambda();
            expect(result.status).toBe('success');
        });
    });
});

const user = {
    userId: 'abc123',
    email: 'someone@example.com',
    name: 'Kim',
    phone_number: '012-345-6789',
    sub: 'abc123',
    createdAt: '2022-03-19T08:17:37.381Z'
};

const lumosAcct = {
    email: 'heartbeam1@example.com',
    owner: user.userId
};

describe("Processing reports from S3", () => {
    beforeEach(async () => {
        await th.dynamo.createTable(usersTable, 
            [{AttributeName: 'userId', KeyType: 'HASH'}], 
            [{AttributeName: 'userId', AttributeType: 'S'}]
        );
        const params = {
            TableName: usersTable,
            Item: user
        };
        await docClient.send(new PutCommand(params));

        await th.dynamo.createTable(lumosAcctTable,
            [{AttributeName: 'email', KeyType: 'HASH'}],
            [{AttributeName: 'email', AttributeType: 'S'}]
        );

        await docClient.send(new PutCommand({TableName: lumosAcctTable, Item: lumosAcct}));

        await th.dynamo.createTable(lumosPlaysTable,
            [{AttributeName: 'userId', KeyType: 'HASH'}, {AttributeName: 'dateTime', KeyType: 'RANGE'}],
            [{AttributeName: 'userId', AttributeType: 'S'}, {AttributeName: 'dateTime', AttributeType: 'S'}]
        );
    });

    afterEach(async () => {
        await th.dynamo.deleteTable(usersTable);
        await th.dynamo.deleteTable(lumosAcctTable);
        await th.dynamo.deleteTable(lumosPlaysTable);
    });

    const randMaxNoZero = (max) => Math.floor((Math.random() * (max - 1)) + 1).toString().padStart(2, '0');
    const randCreatedAt = () => `2022-${randMaxNoZero(12)}-${randMaxNoZero(28)} ${randMaxNoZero(23)}:${randMaxNoZero(59)}:${randMaxNoZero(59)}.000`;
    const allGames = [
        'Memory Serves Web',
        'Color Match 2 Web',
        'Raindrops Web',
        'Brain Shift Web',
        'Familiar Faces Web',
        'Ebb and Flow Web',
        'Lost in Migration Web',
    ];

    describe('A valid game result report', () => {
        beforeAll(async () => {
            await th.s3.removeBucket(process.env.DEST_BUCKET);
        });

        test("should write new game play data to dynamodb", async () => {
            const playsData = [
                { email_address: lumosAcct.email, game_name: 'Color Match 2 Web', created_at_utc: '2022-05-07 12:09:34', game_lpi: 590 },
                { email_address: lumosAcct.email, game_name: 'Raindrops Web', created_at_utc: '2022-05-07 12:14:17', game_lpi: 400 },
                { email_address: lumosAcct.email, game_name: 'Color Match 2 Web', created_at_utc: '2022-05-08 08:56:02', game_lpi: 390 },
                { email_address: lumosAcct.email, game_name: 'Word Bubbles Web', created_at_utc: '2022-05-07 09:06:33', game_lpi: 472 },
            ];
            await processGameReport(playsData);
            const expectedPlays = playsData.map(pd => {
                return { game: pd.game_name, dateTime: toLATime(pd.created_at_utc), userId: lumosAcct.owner, multiPlay: false, lpi: pd.game_lpi }
            });
            await confirmPlaysWritten(expectedPlays);
        });

        test("should not write game play data that is already in dynamodb", async () => {
            const playsData = [
                { email_address: lumosAcct.email, game_name: 'Color Match 2 Web', created_at_utc: '2022-05-07 12:09:34', game_lpi: 590 },
                { email_address: lumosAcct.email, game_name: 'Color Match 2 Web', created_at_utc: '2022-05-08 08:56:02', game_lpi: 390 },
            ];

            const params = {
                TableName: lumosPlaysTable,
                Item: {
                    userId: lumosAcct.owner,
                    dateTime: playsData[0].created_at_utc,
                    lpi: playsData[0].game_lpi + 100,
                    multiPlay: false,
                    game: playsData[0].game_name
                }
            };
            await docClient.send(new PutCommand(params));

            await processGameReport(playsData);
            const expectedPlays = [
                { userId: params.Item.userId, game: params.Item.game, dateTime: params.Item.dateTime, lpi: params.Item.lpi, multiPlay: params.Item.multiPlay },
                { userId: lumosAcct.owner, game: playsData[1].game_name, dateTime: toLATime(playsData[1].created_at_utc), lpi: playsData[1].game_lpi, multiPlay: false }
            ];
            await confirmPlaysWritten(expectedPlays);
        });

        test("should only write the first game play record and set multiPlay to true if a user plays any given game more than once in a day", async () => {
            const playsData = [
                { email_address: lumosAcct.email, game_name: 'Color Match 2 Web', created_at_utc: '2022-05-07 12:09:34', game_lpi: 590 },
                { email_address: lumosAcct.email, game_name: 'Raindrops Web', created_at_utc: '2022-05-07 12:14:17', game_lpi: 400 },
                { email_address: lumosAcct.email, game_name: 'Color Match 2 Web', created_at_utc: '2022-05-07 18:56:02', game_lpi: 390 },
            ];
            await processGameReport(playsData);
            const expectedPlays = [
                { game: playsData[0].game_name, dateTime: toLATime(playsData[0].created_at_utc), userId: lumosAcct.owner, multiPlay: true, lpi: playsData[0].game_lpi },
                { game: playsData[1].game_name, dateTime: toLATime(playsData[1].created_at_utc), userId: lumosAcct.owner, multiPlay: false, lpi: playsData[1].game_lpi }
            ];
            await confirmPlaysWritten(expectedPlays);
        });

        test("should update the stage2Completed status for a user who has played each game twice and started at least six days ago", async () => {
            // for stage2Completed to be true every game in allGames must be played at least twice
            const playsData = [0,1].map( () => {
                return allGames.map(g => {
                    return { email_address: lumosAcct.email, game_name: g, created_at_utc: randCreatedAt(), game_lpi: 492 };
                });
            }).flatMap(a => a);
            await processGameReport(playsData);
           
            await confirmStage2Complete(lumosAcct.owner);
        });

        test("should not update the stage2Completed status if a user has played each game twice but started less than six days ago", async () => {
            const newUserStartDate = dayjs().subtract(3, 'days').toISOString();
            const newUser = {
                userId: 'def456',
                email: 'someone_else@example.com',
                name: 'Pat',
                phone_number: '010-098-2315',
                sub: 'def456',
                createdAt: newUserStartDate,
                progress: {
                    foo: 19
                }
            };
            
            const newLumosAcct = {
                email: 'heartbeam2@example.com',
                owner: newUser.userId
            };
            
            await docClient.send(new PutCommand({TableName: usersTable, Item: newUser}));
            await docClient.send(new PutCommand({TableName: lumosAcctTable, Item: newLumosAcct}));

            const playsData = [0,1].map( () => {
                return allGames.map(g => {
                    return { email_address: newLumosAcct.email, game_name: g, created_at_utc: randCreatedAt(), game_lpi: 492 };
                });
            }).flatMap(a => a);
            await processGameReport(playsData);

            const params = {
                TableName: usersTable,
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: { ':userId': newUser.userId }
            };
            const res = await docClient.send(new QueryCommand(params));
            const user = res.Items[0];
            expect(user?.progress?.status).not.toBeDefined();
        });

        test("should not undo a user's stage2Status", async () => {
            const progress = {};
            progress.status = statusTypes.STAGE_2_COMPLETE;
            progress[statusTypes.STAGE_2_COMPLETED_ON] = dayjs(new Date()).tz('America/Los_Angeles').format('YYYYMMDD');
            const params = {
                TableName: usersTable,
                Key: { userId: lumosAcct.owner },
                UpdateExpression: 'set progress = :progress',
                ExpressionAttributeValues: {':progress': progress }
            };
            await docClient.send(new UpdateCommand(params));

            confirmStage2Complete(lumosAcct.owner);

            const playsData = [
                { email_address: lumosAcct.email, game_name: 'Color Match 2 Web', created_at_utc: '2022-05-07 12:09:34.000', game_lpi: 590 },
                { email_address: lumosAcct.email, game_name: 'Raindrops Web', created_at_utc: '2022-05-07 12:14:17.000', game_lpi: 400 }
            ];
            await processGameReport(playsData);

            await confirmStage2Complete(lumosAcct.owner);
        });
    });

    describe('A user engagement report', () => {
        beforeAll(async () => {
            await th.s3.removeBucket(process.env.DEST_BUCKET);
            const reportText = await fs.readFile(path.join(__dirname, 'engagement-report.csv'));
            await th.s3.addFile(process.env.DEST_BUCKET, engagementKey, reportText);
        });

        test('should be skipped', async () => {
            const result = await runReportsLambda(engagementKey);
            expect(result.status).toBe('ignored');
        });
    });

    describe('A game result report with users whose account we cannot find', () => {
        beforeAll(async () => {
            await th.s3.removeBucket(process.env.DEST_BUCKET);
            const reportText = await fs.readFile(path.join(__dirname, 'game-result-report-2-users.csv'));
            await th.s3.addFile(process.env.DEST_BUCKET, reportKey, reportText);
        });

        test("should not stop us from writing the data for users we do have accounts for", async () => {
            const playsData = [
                { email_address: lumosAcct.email, game_name: 'Color Match 2 Web', created_at_utc: '2022-05-07 12:09:34', game_lpi: 590 },
                { email_address: 'heartbeam2@example.com', game_name: 'Raindrops Web', created_at_utc: '2022-05-07 12:14:17', game_lpi: 400 },
            ];
            const reportCSV = generateGameReport(playsData);
            await th.s3.addFile(process.env.DEST_BUCKET, reportKey, reportCSV);
            const result = await runReportsLambda(reportKey);
            expect(result.status).toBe('success');
            
            const expectedPlays = [{game: playsData[0].game_name, userId: lumosAcct.owner, dateTime: toLATime(playsData[0].created_at_utc), lpi: playsData[0].game_lpi, multiPlay: false}];
            await confirmPlaysWritten(expectedPlays);
        });

        test("should not try to update the stage2Completed status for the unknown user", async () => {
            const dbSpy = jest.spyOn(Db.prototype, 'updateUser');
            
            
            // for stage2Completed to be true every game in allGames must be played at least twice,
            const playsData = [0,1].map( () => {
                return allGames.flatMap(g => {
                    return [
                        { email_address: lumosAcct.email, game_name: g, created_at_utc: randCreatedAt(), game_lpi: 492 },
                        { email_address: 'heartbeam79@example.com', game_name: g, created_at_utc: randCreatedAt(), game_lpi: 328}
                    ];
                });
            }).flatMap(a => a);
            await processGameReport(playsData);
           
            await confirmStage2Complete(lumosAcct.owner);
            expect(dbSpy).toHaveBeenCalledTimes(1);
            expect(dbSpy.mock.calls[0][0]).toEqual(lumosAcct.owner);
        });
    });
});

/**
 * Given data, returns a CSV string that mimics a Lumosity game report. Any data that is not included
 * in the individual data.games objects will be simulated. The game_name and created_at_utc keys are required.
 * @param {Array} data Array of objects with form: {email_address: 'email-addr', game_name: 'some name', created_at_utc: 'YYYY-MM-DD HH:mm:ss'}
 */
function generateGameReport(data) {
    if (!(data.every(i => isValidReportData(i)))) throw new Error('invalid game report data');

    const userKeys = ['user','email_address','username','activation_code'];
    const gameKeys = ['game','game_name','score','created_at_utc','user_level','session_level','nth_play','game_lpi'];
    
    const csvLines = data.map(r => {
        let csvString = '';
        const user = r.user ? r.user : 10000;
        const email = r.email_address;
        const username = r.username ? r.username : '';
        const activation_code = r.activation_code ? r.activation_code : 'RGV7O-LATP3';
        csvString += `${user},${email},${username},${activation_code},`;
        gameKeys.forEach(k => {
            const value = r[k] ? r[k] : Math.floor(Math.random() * 100); // only game_name and created_at_utc are non-numeric, and they are guaranteed to be set
            csvString += `${value},`;
        });
        return csvString.substring(0, csvString.length - 1); // drop trailing comma
    });

    return userKeys.join(",") + "," + gameKeys.join(",") + "\n" + csvLines.join("\n");
}

function isValidReportData(reportItem) {
    return reportItem.hasOwnProperty('email_address') && 
    reportItem.hasOwnProperty('game_name') && reportItem.hasOwnProperty('created_at_utc');
}

async function confirmPlaysWritten(expectedPlays) {
    const playsScan = await docClient.send(new ScanCommand({
        TableName: lumosPlaysTable
    }));
    expect(playsScan.Items.length).toBe(expectedPlays.length);
    expectedPlays.forEach(ep => expect(playsScan.Items).toContainEqual(ep));
}

async function confirmStage2Complete(userId) {
    const qParams = {
        TableName: usersTable,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId }
    };
    const res = await docClient.send(new QueryCommand(qParams));
    expect(res.Items[0]['progress']['status']).toBe(statusTypes.STAGE_2_COMPLETE);
    const today = dayjs(new Date()).tz('America/Los_Angeles').format('YYYYMMDD');
    expect(res.Items[0]['progress'][statusTypes.STAGE_2_COMPLETED_ON]).toBe(today);
}

async function runAttachmentLambda() {
    const putEventJson = await fs.readFile(path.join(__dirname, 's3-put-event.json'));
    const putEvent = JSON.parse(putEventJson);
    putEvent.Records[0].s3.bucket.name = process.env.DEST_BUCKET;
    putEvent.Records[0].s3.object.key = emailKey;
    const result = await lambdaLocal.execute({
        event: putEvent,
        lambdaPath: path.join(__dirname, '../process-lumosity-emails.js'),
        lambdaHandler: 'saveattachments',
        verboseLevel: 0
    });
    return result;
}

async function processGameReport(reportData) {
    const reportCSV = generateGameReport(reportData);
    await th.s3.addFile(process.env.DEST_BUCKET, reportKey, reportCSV);
    const result = await runReportsLambda(reportKey);
    expect(result.status).toBe('success');
}

async function runReportsLambda(fileKey) {
    const putEventJson = await fs.readFile(path.join(__dirname, 's3-put-event.json'));
    const putEvent = JSON.parse(putEventJson);
    putEvent.Records[0].s3.bucket.name = process.env.DEST_BUCKET;
    putEvent.Records[0].s3.object.key = fileKey;
    const result = await lambdaLocal.execute({
        event: putEvent,
        lambdaPath: path.join(__dirname, '../process-lumosity-emails.js'),
        lambdaHandler: 'processreports',
        verboseLevel: 0
    });
    return result;
}




