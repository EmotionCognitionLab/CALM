'use strict';

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
const th = require('../../common-test/test-helper.js');
import { readFile, mkdtemp, unlink } from 'fs/promises';
const os = require('os');
const dayjs = require('dayjs')
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(timezone);
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
const lambdaLocal = require("lambda-local");
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { maxSessionMinutes, earningsTypes, earningsAmounts, statusTypes, maxDailyTimeEarnings } from '../../../../common/types/types';
import { initSqliteDb, insertEmwaveSessions } from './sqlite-helper.js';
const dynClient = new DynamoDBClient({region: process.env.REGION, endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: "2012-08-10"});
const docClient = DynamoDBDocumentClient.from(dynClient);

const theUserId = 'abc345';
const sqliteKey = `${theUserId}/us-west-2:1234567890abcdef/CALM.sqlite`;
let sqliteTestDbPath;

const sessionsTable = process.env.SESSIONS_TABLE;
const earningsTable = process.env.EARNINGS_TABLE;
const cogResultsTable = process.env.COGNITIVE_TABLE;

const mockGetUser = jest.fn((userId) => ({userId: userId, condition: 2}));
const mockGetUserEarnings = jest.fn((userId) => []);
const mockUpdateUser = jest.fn((userId, updates) => {});

jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            getUser: (userId) => mockGetUser(userId),
            earningsForUser: (userId) => mockGetUserEarnings(userId),
            updateUser: (userId, updates) => mockUpdateUser(userId, updates)
        };
    });
});

beforeEach(async () => {
    await th.dynamo.createTable(process.env.SESSIONS_TABLE, 
        [{AttributeName: 'userId', KeyType: 'HASH'}, {AttributeName: 'startDateTime', KeyType: 'RANGE'}], 
        [{AttributeName: 'userId', AttributeType: 'S'}, {AttributeName: 'startDateTime', AttributeType: 'N'}]
    );
    await th.dynamo.createTable(process.env.EARNINGS_TABLE, 
        [{AttributeName: 'userId', KeyType: 'HASH'}, {AttributeName: 'dateType', KeyType: 'RANGE'}], 
        [{AttributeName: 'userId', AttributeType: 'S'}, {AttributeName: 'dateType', AttributeType: 'S'}]
    );
    await th.dynamo.createTable(process.env.COGNITIVE_TABLE, 
        [{AttributeName: 'userId', KeyType: 'HASH'}, {AttributeName: 'dateTimeExperiment', KeyType: 'RANGE'}], 
        [{AttributeName: 'userId', AttributeType: 'S'}, {AttributeName: 'dateTimeExperiment', AttributeType: 'S'}]
    );
});

afterEach(async () => {
    await th.dynamo.deleteTable(process.env.SESSIONS_TABLE);
    await th.dynamo.deleteTable(process.env.EARNINGS_TABLE);
    await th.dynamo.deleteTable(process.env.COGNITIVE_TABLE);
    mockGetUser.mockClear();
    mockGetUserEarnings.mockClear();
    mockUpdateUser.mockClear();
});

describe("Processing a sqlite file", () => {
    let db;

    beforeEach(async () => {
        db = await initSqlite();
    });

    it("should save sessions from all stages", async () => {
        const sessions = [
            { emwave_session_id: 'cafe450', avg_coherence: 1.2, pulse_start_time: dayjs().subtract(8, 'hours').unix(), valid_status: 1, duration_seconds: 300, stage: 1, weighted_avg_coherence: (5/18)*1.2 },
            { emwave_session_id: 'cafe451', avg_coherence: 2.3, pulse_start_time: dayjs().subtract(6, 'hours').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 2, weighted_avg_coherence: 2.3 },
            { emwave_session_id: 'cafe452', avg_coherence: 1.7, pulse_start_time: dayjs().subtract(4, 'hours').unix(), valid_status: 1, duration_seconds: 300, stage: 3, weighted_avg_coherence: (5/18)*1.7 },
        ];
        await runLambdaTestWithSessions(db, sessions);

        const addedSessions = await getDynamoSessions(theUserId);
        expect(addedSessions.length).toBe(sessions.length);
        const allStages = new Set(sessions.map(s => s.stage));
        for (const stage of allStages.keys()) {
            expect(addedSessions.some(s => s.stage == stage)).toBe(true);
        }
    });

    it("should only save sessions newer than the last uploaded session", async () => {
        const lastSessionTime = dayjs().subtract(1, 'day');
        const dynamoSessions = [{ emWaveSessionId: 'cafe451', avgCoherence: 2.3, startDateTime: lastSessionTime.unix(), validStatus: 1, durationSeconds: maxSessionMinutes*60, stage: 2, weightedAvgCoherence: 2.3 }];
        await insertDynamoItems(theUserId, dynamoSessions);

        const sessions = [
            { emwave_session_id: 'adcd123', avg_coherence: 1.2, pulse_start_time: lastSessionTime.subtract(2, 'hours').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 2, weighted_avg_coherence:1.2 },
            { emwave_session_id: 'abcf789', avg_coherence: 2.3, pulse_start_time: lastSessionTime.add(20, 'hours').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 2, weighted_avg_coherence: 2.3 },
        ];
        await runLambdaTestWithSessions(db, sessions);

        const expectedNewSessions = sessions.filter(s => dayjs.unix(s.pulse_start_time).isAfter(lastSessionTime));
        const addedSessions = (await getDynamoSessions(theUserId)).filter(s => s.startDateTime != dynamoSessions[0].startDateTime);
        expect(addedSessions.length).toBe(expectedNewSessions.length);
    });

    it("should only save time-based earnings for sessions after the last time-based earning", async () => {
        const lastEarningsTime = dayjs().tz('America/Los_Angeles').subtract(2, 'days');
        const prevEarnings = [{userId: theUserId, date: lastEarningsTime.format(), type: earningsTypes.PER_HOUR, amount: 3}];
        mockGetUserEarnings.mockReturnValueOnce(prevEarnings);

        const sessions = [
            { emwave_session_id: 'adcd123', avg_coherence: 1.2, pulse_start_time: lastEarningsTime.subtract(2, 'hours').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 3, weighted_avg_coherence:1.2 },
            { emwave_session_id: 'abcf789', avg_coherence: 2.3, pulse_start_time: lastEarningsTime.add(1, 'hour').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 3, weighted_avg_coherence: 2.3 },
        ];
        await runLambdaTestWithSessions(db, sessions);
        const dynamoEarnings = await getDynamoEarnings(theUserId, earningsTypes.PER_HOUR);
        const expectedEarningsCount = sessions.filter(s => dayjs.unix(s.pulse_start_time).isAfter(lastEarningsTime)).length;
        expect(dynamoEarnings.length).toBe(expectedEarningsCount);
        expect(dynamoEarnings).toEqual(expect.arrayContaining([
            {userId: theUserId, dateType: `${lastEarningsTime.add(1, 'hour').format()}|${earningsTypes.PER_HOUR}`, amount: 3}
        ]));
    });

    it("should not give more than $6 total in time earnings for a day when the upload contains new sessions that combined would exceed that limit", async () => {
        mockGetUserEarnings.mockReturnValueOnce([]);
        const sessions = [
            { emwave_session_id: 'adcd123', avg_coherence: 1.2, pulse_start_time: dayjs().add(20, 'minutes').unix(), valid_status: 1, duration_seconds: 13*60, stage: 3, weighted_avg_coherence:1.2 },
            { emwave_session_id: 'abcf789', avg_coherence: 2.3, pulse_start_time: dayjs().add(50, 'minutes').unix(), valid_status: 1, duration_seconds: 13*60, stage: 3, weighted_avg_coherence: 2.3 },
            { emwave_session_id: 'ged910', avg_coherence: 2.3, pulse_start_time: dayjs().add(80, 'minutes').unix(), valid_status: 1, duration_seconds: 13*60, stage: 3, weighted_avg_coherence: 2.3 },
        ];
        await runLambdaTestWithSessions(db, sessions);
        const dynamoEarnings = await getDynamoEarnings(theUserId, earningsTypes.PER_HOUR);
        expect(dynamoEarnings.length).toBe(sessions.length);
        const expectedEarnings = [];
        let totalEarnings = 0;
        for (let i=0; i<sessions.length; i++) {
            const s = sessions[i];
            let sessMinutes = (s.duration_seconds / 60);
            const earnings = Math.round(earningsAmounts[earningsTypes.PER_HOUR] * (sessMinutes/60) * 100) / 100;
            if (totalEarnings + earnings > maxDailyTimeEarnings) {
                const maxRemainingMinutes = ((maxDailyTimeEarnings - totalEarnings) / earningsAmounts[earningsTypes.PER_HOUR]) * 60;
                sessMinutes = maxRemainingMinutes;
            }
            totalEarnings += Math.round(earningsAmounts[earningsTypes.PER_HOUR] * (sessMinutes/60) * 100) / 100;
            expectedEarnings.push({
                userId: theUserId,
                dateType: `${dayjs.unix(s.pulse_start_time).tz('America/Los_Angeles').format()}|${earningsTypes.PER_HOUR}`,
                amount: Math.round(earningsAmounts[earningsTypes.PER_HOUR] * (sessMinutes/60) * 100) / 100
            });
        }
        expect(dynamoEarnings).toEqual(expect.arrayContaining(expectedEarnings));
    });

    it("should not give more than $6 total in time earnings for a day when previously rewarded sessions plus new sessions would exceed that limit", async () => {
        const sessions = [
            { emwave_session_id: 'adcd123', avg_coherence: 1.2, pulse_start_time: dayjs().add(20, 'minutes').unix(), valid_status: 1, duration_seconds: 13*60, stage: 3, weighted_avg_coherence:1.2 },
            { emwave_session_id: 'abcf789', avg_coherence: 2.3, pulse_start_time: dayjs().add(50, 'minutes').unix(), valid_status: 1, duration_seconds: 13*60, stage: 3, weighted_avg_coherence: 2.3 },
            { emwave_session_id: 'ged910', avg_coherence: 2.3, pulse_start_time: dayjs().add(80, 'minutes').unix(), valid_status: 1, duration_seconds: 13*60, stage: 3, weighted_avg_coherence: 2.3 },
        ];
        const prevEarnings = [{
            userId: theUserId,
            date: dayjs.unix(sessions[0].pulse_start_time).tz('America/Los_Angeles').format(),
            type: earningsTypes.PER_HOUR,
            amount: Math.round(earningsAmounts[earningsTypes.PER_HOUR] * (sessions[0].duration_seconds/3600) * 100) / 100
        }];
        mockGetUserEarnings.mockReturnValueOnce(prevEarnings);

        await runLambdaTestWithSessions(db, sessions);
        const dynamoEarnings = await getDynamoEarnings(theUserId, earningsTypes.PER_HOUR);
        expect(dynamoEarnings.length).toBe(sessions.length - prevEarnings.length);
        const expectedEarnings = [];
        let totalEarnings = prevEarnings[0].amount;
        for (let i=1; i<sessions.length; i++) {
            const s = sessions[i];
            let sessMinutes = (s.duration_seconds / 60);
            const earnings = Math.round(earningsAmounts[earningsTypes.PER_HOUR] * (sessMinutes/60) * 100) / 100;
            if (totalEarnings + earnings > maxDailyTimeEarnings) {
                const maxRemainingMinutes = ((maxDailyTimeEarnings - totalEarnings) / earningsAmounts[earningsTypes.PER_HOUR]) * 60;
                sessMinutes = maxRemainingMinutes;
            }
            totalEarnings += Math.round(earningsAmounts[earningsTypes.PER_HOUR] * (sessMinutes/60) * 100) / 100;
            expectedEarnings.push({
                userId: theUserId,
                dateType: `${dayjs.unix(s.pulse_start_time).tz('America/Los_Angeles').format()}|${earningsTypes.PER_HOUR}`,
                amount: Math.round(earningsAmounts[earningsTypes.PER_HOUR] * (sessMinutes/60) * 100) / 100
            });
        }
        expect(dynamoEarnings).toEqual(expect.arrayContaining(expectedEarnings));
    });

    it.each([{visit: 1, stage: 1}, {visit: 2, stage: 4}])("should save visit $visit rewards when they have not yet been earned and stage $stage sessions exist", async ({visit, stage}) => {
        const sessDate = dayjs().subtract(6, 'hours');
        const sessions = [
            { emwave_session_id: 'cafe451', avg_coherence: 1.6, pulse_start_time: sessDate.unix(), valid_status: 1, duration_seconds: 300, stage: stage, weighted_avg_coherence: 1.6 },
        ];
        await runLambdaTestWithSessions(db, sessions);

        const addedEarnings = await getDynamoEarnings(theUserId);
        expect(addedEarnings.length).toBe(1);
        const earnType = visit == 1 ? earningsTypes.VISIT_1 : earningsTypes.VISIT_2;
        expect(addedEarnings).toStrictEqual([{userId: theUserId, dateType: `${sessDate.tz('America/Los_Angeles').format()}|${earnType}`, amount: earningsAmounts[earnType]}]);
    });

    it.each([{visit: 1, stage: 1}, {visit: 2, stage: 4}])("should not save visit $visit rewards when they have already been earned", async ({visit, stage}) => {
        const earnType = visit == 1 ? earningsTypes.VISIT_1 : earningsTypes.VISIT_2;
        mockGetUserEarnings.mockReturnValueOnce([{type: earnType, date: dayjs().format(), userId: theUserId, amount: earningsAmounts[earnType]}]);

        const sessDate = dayjs().subtract(6, 'hours');
        const sessions = [
            { emwave_session_id: 'cafe451', avg_coherence: 1.6, pulse_start_time: sessDate.unix(), valid_status: 1, duration_seconds: 300, stage: stage, weighted_avg_coherence: 1.6 },
        ];
        await runLambdaTestWithSessions(db, sessions);
        const addedEarnings = await getDynamoEarnings(theUserId);
        expect(addedEarnings.length).toBe(0);
    });

    it("should set the user progress status to stage1Complete when stage 1 sessions are uploaded and progress status is not set", async () => {
        const sessions = [
            { emwave_session_id: 'cafe450', avg_coherence: 1.2, pulse_start_time: dayjs().subtract(8, 'hours').unix(), valid_status: 1, duration_seconds: 300, stage: 1, weighted_avg_coherence: (5/18)*1.2 }
        ];
        await runLambdaTestWithSessions(db, sessions);

        expect(mockUpdateUser).toHaveBeenCalledTimes(1);
        expect(mockUpdateUser.mock.calls[0][0]).toBe(theUserId);
        const progress = {};
        progress['status'] = statusTypes.STAGE_1_COMPLETE;
        progress[statusTypes.STAGE_1_COMPLETED_ON] = dayjs().tz('America/Los_Angeles').format('YYYYMMDD')
        expect(mockUpdateUser.mock.calls[0][1]).toStrictEqual({progress: progress});
    });

    it("should set the user progress status to stage2Complete when stage 3 sessions are uploaded and progress status is not already set to stage_2_complete", async () => {
        const sessions = [
            { emwave_session_id: 'cafe450', avg_coherence: 1.2, pulse_start_time: dayjs().subtract(8, 'hours').unix(), valid_status: 1, duration_seconds: 300, stage: 3, weighted_avg_coherence: (5/18)*1.2 }
        ];
        await runLambdaTestWithSessions(db, sessions);

        expect(mockUpdateUser).toHaveBeenCalledTimes(1);
        expect(mockUpdateUser.mock.calls[0][0]).toBe(theUserId);
        const progress = {};
        progress['status'] = statusTypes.STAGE_2_COMPLETE;
        progress[statusTypes.STAGE_2_COMPLETED_ON] = dayjs().tz('America/Los_Angeles').format('YYYYMMDD')
        expect(mockUpdateUser.mock.calls[0][1]).toStrictEqual({progress: progress}); 
    });

    it("should set the user progress status to complete if stage 4 sessions are uploaded", async () => {
        const sessions = [
            { emwave_session_id: 'cafe450', avg_coherence: 1.2, pulse_start_time: dayjs().subtract(8, 'hours').unix(), valid_status: 1, duration_seconds: 300, stage: 4, weighted_avg_coherence: (5/18)*1.2 }
        ];
        mockGetUser.mockReturnValueOnce({userId: theUserId, condition: 12, progress: {status: statusTypes.STAGE_2_COMPLETE}});
        await runLambdaTestWithSessions(db, sessions);

        expect(mockUpdateUser).toHaveBeenCalledTimes(1);
        expect(mockUpdateUser.mock.calls[0][0]).toBe(theUserId);
        expect(mockUpdateUser.mock.calls[0][1]).toStrictEqual({progress: {status: statusTypes.COMPLETE}});
    });

    it("should only save cognitive results newer than the last uploaded results", async () => {
        const lastUploadedResultTime = dayjs().subtract(1, 'day');
        const dynamoCogResults = [{ dateTimeExperiment: `${lastUploadedResultTime.toISOString()}|flanker`, isRelevant: 1, results: [1,2,3], stage: 1 }];
        await insertDynamoItems(theUserId, dynamoCogResults, cogResultsTable);

        const cogResults = [
            { experiment: 'flanker-2', is_relevant: 0, date_time: lastUploadedResultTime.subtract(2, 'hours').toISOString(), results: '{"correct_response":"arrowright","arrows":[1,1,1,1,1]}', stage: 1 },
            { experiment: 'verbal-learning-learning', is_relevant: 1, date_time: lastUploadedResultTime.add(20, 'hours').toISOString(), results: '{"rt":null,"response":null,"stimulus":"/src/cognitive/verbal-learning/pre-a.mp3"}', stage: 1 },
        ];
        await insertCogResults(db, cogResults);
        await runS3PutLambda();

        const expectedNewCogResults = cogResults.filter(r => dayjs(r.date_time).isAfter(lastUploadedResultTime));
        const addedCogResults = (await getDynamoCogResults(theUserId)).filter(r => r.dateTimeExperiment != dynamoCogResults[0].dateTimeExperiment);
        expect(addedCogResults.length).toBe(expectedNewCogResults.length);
    });

    it("should save all cognitive results if none have been uploaded yet", async () => {
        const cogResults = [
            { experiment: 'flanker-2', is_relevant: 0, date_time: '2024-10-10T11:11:12.000Z', results: '{"correct_response":"arrowright","arrows":[1,1,1,1,1]}', stage: 1 },
            { experiment: 'verbal-learning-learning', is_relevant: 1, date_time: '2024-10-11T09:10:11.120Z', results: '{"rt":null,"response":null,"stimulus":"/src/cognitive/verbal-learning/pre-a.mp3"}', stage: 1 },
        ];
        await insertCogResults(db, cogResults);
        await runS3PutLambda();

        const addedCogResults = (await getDynamoCogResults(theUserId));
        expect(addedCogResults.length).toBe(cogResults.length);
    });

    afterAll(async () => {
        await th.s3.removeBucket(process.env.DATA_BUCKET);

        if (db) {
            db.close();
        }
        unlink(sqliteTestDbPath);
    });

});

async function runLambdaTestWithSessions(db, sessions, expectedStatus='success') {
    await insertSessions(db, sessions);
    const result = await runS3PutLambda();
    expect(result.status).toBe(expectedStatus);
}

async function runS3PutLambda() {
    const putEventJson = await readFile(path.join(__dirname, 's3-put-event.json'));
    const putEvent = JSON.parse(putEventJson);
    putEvent.Records[0].s3.bucket.name = process.env.DATA_BUCKET;
    putEvent.Records[0].s3.object.key = sqliteKey;
    const result = await lambdaLocal.execute({
        event: putEvent,
        lambdaPath: path.join(__dirname, '../process-sqlite-dbs.js'),
        lambdaHandler: 'handler',
        verboseLevel: 0
    });
    return result;
}

async function initSqlite() {
    const dbDir = await mkdtemp(os.tmpdir());
    sqliteTestDbPath = path.join(dbDir, 'TestCALM.sqlite');
    
    return await(initSqliteDb(sqliteTestDbPath))
}

async function insertDynamoItems(userId, items, table=sessionsTable) {
    const puts = items.map(s => {
        s.userId = userId;
        return {
            PutRequest: {
                Item: s
            }
        };
    });
    const params = { RequestItems: {} };
    params.RequestItems[table] = puts;
    await docClient.send(new BatchWriteCommand(params));
}

async function insertSessions(db, sessions) {
    insertEmwaveSessions(db, sessions);
    await th.s3.removeBucket(process.env.DATA_BUCKET);
    const sqliteFile = await readFile(sqliteTestDbPath);
    await th.s3.addFile(process.env.DATA_BUCKET, sqliteKey, sqliteFile);
}

async function insertCogResults(db, results) {
    const stmt = db.prepare('INSERT INTO cognitive_results(experiment, is_relevant, date_time, results, stage) VALUES(?, ? , ?, ?, ?)');
    for (const r of results) {
        stmt.run(r.experiment, r.is_relevant, r.date_time, r.results, r.stage);
    }
    await th.s3.removeBucket(process.env.DATA_BUCKET);
    const sqliteFile = await readFile(sqliteTestDbPath);
    await th.s3.addFile(process.env.DATA_BUCKET, sqliteKey, sqliteFile);
}

async function getDynamoSessions(userId) {
   return await dynamoQueryByUserId(userId, sessionsTable);
}

async function getDynamoEarnings(userId, earningsType) {
    const allEarnings = await dynamoQueryByUserId(userId, earningsTable);
    if (earningsType) {
        return allEarnings.filter(e => e.dateType.endsWith(earningsType));
    }
    return allEarnings;
}

async function getDynamoCogResults(userId) {
    return await dynamoQueryByUserId(userId, cogResultsTable);
}

async function dynamoQueryByUserId(userId, tableName) {
    const userQueryRes = await docClient.send(new QueryCommand({
        TableName: tableName, 
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {":userId": userId},
    }));
    return userQueryRes.Items;
}
