"use strict";

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { s3Client as s3 , dynamoDocClient as docClient } from '../common/aws-clients';
import { earningsTypes, earningsAmounts, statusTypes, maxDailyTimeEarnings } from '../../../common/types/types.js';
import { trainingBonusRewards, trainingTimeRewards, visitRewards } from './earnings.js';
import Db from 'db/db.js';
import Database from 'better-sqlite3';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { camelCase, zipObject } from 'lodash'
const path = require('path');
const dayjs = require('dayjs')
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat.js');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter.js');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(isSameOrAfter);

const db = new Db();
db.docClient = docClient;
const sessionsTable = process.env.SESSIONS_TABLE;
const earningsTable = process.env.EARNINGS_TABLE;
const cogResultsTable = process.env.COGNITIVE_TABLE;

export async function handler(event) {
    let sqliteDbPath;
    let sqliteDb;

    try {
        const record = event.Records[0]; // s3 record
        sqliteDbPath = await downloadSqliteDb(record);
        sqliteDb = new Database(sqliteDbPath);
        const userId = decodeURIComponent(event.Records[0].s3.object.key).split('/')[0];

         // upload new cognitive results from sqlite db
         const lastCogResultTime = await lastUploadedCogResultTime(userId);
         const newCogResultsStmt = sqliteDb.prepare('select experiment, is_relevant, date_time, results, stage from cognitive_results where date_time > ?');
         const newCogResults = newCogResultsStmt.all(lastCogResultTime).map(rowToObject);
         if (newCogResults.length > 0) {
            console.log(`About to save ${newCogResults.length} cognitive results for user ${userId}.`);
            await saveCogResults(userId, newCogResults);
            console.log(`Finished saving cognitive results.`);
         }
 
        // get new sessions from sqlite db
        const lastUploadTime = await lastUploadedSessionTime(userId);
        const newSessionsStmt = sqliteDb.prepare('select * from emwave_sessions where pulse_start_time > ?');
        const newSessions = newSessionsStmt.all(lastUploadTime).map(rowToObject);

        // get user and earnings info
        const user = await db.getUser(userId);
        const prevEarnings = await db.earningsForUser(userId);

        // update user status if necessary
        const sessionStages = new Set();
        for (const s of newSessions) {
            sessionStages.add(s.stage);
        }
        if (sessionStages.has(1) && !user?.progress?.status) {
            // stage 1 is in-lab and is complete as soon as data are uploaded
            const progress = Object.assign({}, user.progress);
            progress['status'] = statusTypes.STAGE_1_COMPLETE;
            progress[statusTypes.STAGE_1_COMPLETED_ON] = dayjs().tz('America/Los_Angeles').format('YYYYMMDD');
            await db.updateUser(userId, {progress: progress});
        }
        // TODO this should be impossible and will potentially un-drop or un-complete someone
        // if for some reason their db gets reprocessed after dropping/completing. Remove?
        if (sessionStages.has(3) && user?.progress?.status !== statusTypes.STAGE_2_COMPLETE) {
            const progress = Object.assign({}, user.progress);
            progress['status'] = statusTypes.STAGE_2_COMPLETE;
            progress[statusTypes.STAGE_2_COMPLETED_ON] = dayjs().tz('America/Los_Angeles').format('YYYYMMDD');
            await db.updateUser(userId, {progress: progress});
        }
        if (sessionStages.has(4) && user?.progress?.status !== statusTypes.COMPLETE) {
            // stage 4 is in-lab and means the user has finished the study
            const progress = Object.assign({}, user.progress);
            progress['status'] = statusTypes.COMPLETE;
            await db.updateUser(userId, {progress: progress});
        }

        // get time-based earnings
        const lastTimeEarning = prevEarnings.findLast(e => 
            e.type === earningsTypes.PER_HOUR
        );
        const timeRewards = trainingTimeRewards(sqliteDb, lastTimeEarning);
        // make sure time earnings don't go over the $6/day threshold
        const timeEarningsByDay = prevEarnings
            .filter(e => e.type === earningsTypes.PER_HOUR)
            .reduce((prev, cur) => {
                const day = cur.date.substring(1, 10);
                const earningsForDay = prev[day] || 0;
                prev[day] = earningsForDay + cur.amount;
                return prev;
            }, {});
        for (const r of timeRewards) {
            const day = r.date.substring(1, 10);
            const alreadyEarned = timeEarningsByDay[day] || 0;
            const newEarnings = calculateHourlyEarnings(r.minutes);
            if (alreadyEarned + newEarnings > maxDailyTimeEarnings) {
                const maxRemainingMinutes = ((maxDailyTimeEarnings - alreadyEarned) / earningsAmounts[earningsTypes.PER_HOUR]) * 60;
                r.minutes = maxRemainingMinutes;
            }
            timeEarningsByDay[day] = alreadyEarned + calculateHourlyEarnings(r.minutes);
        }

        // get bonus earnings
        let bonusRewards = []
        if (sessionStages.has(3)) {
            const lastBonusEarnings = prevEarnings.findLast(e => e.type === earningsTypes.BONUS)
            bonusRewards = trainingBonusRewards(sqliteDb, lastBonusEarnings, user.condition.assigned);
        }
        

        // get visit earnings
        let v1Rewards = [];
        if (sessionStages.has(1) && !prevEarnings.some(e => e.type === earningsTypes.VISIT_1)) {
            v1Rewards = visitRewards(sqliteDb, 1);
        }
        let v2Rewards = [];
        if (sessionStages.has(4) && !prevEarnings.some(e => e.type === earningsTypes.VISIT_2)) {
            v2Rewards = visitRewards(sqliteDb, 2);
        }

        //save earnings and sessions
        const allEarnings = [...timeRewards, ...bonusRewards, ...v1Rewards, ...v2Rewards];
        
        const recordNoun = allEarnings.length == 1 ? 'record' : 'records';
        const sessionNoun = newSessions.length == 1 ? 'session' : 'sessions';
        console.log(`About to save ${allEarnings.length} earnings ${recordNoun} and ${newSessions.length} ${sessionNoun} for user ${userId}.`);
        await saveSessionsAndEarnings(userId, newSessions, allEarnings);
        console.log(`Finished saving earnings and sessions.`);
    } catch (err) {
        console.error(err);
        return {status: 'error', message: err.message};
    } finally {
        if (sqliteDb) {
            sqliteDb.close();
        }
        if (sqliteDbPath){
            await rm(sqliteDbPath);
        }
    }
    return {status: 'success'};
}

const downloadSqliteDb = async (record) => {
    // Retrieve the database
    const getObjCmdInput = {
        Bucket: record.s3.bucket.name,
        Key: decodeURIComponent(record.s3.object.key),
    };
   
    // retrieve sqlite file from s3
    const getObjCmd = new GetObjectCommand(getObjCmdInput);
    const tmpDir = await mkdtemp('/tmp/');
    const dbPath = path.join(tmpDir, 'temp.sqlite');
    const data = await s3.send(getObjCmd);
    await writeFile(dbPath, data.Body);
    return dbPath;
}

async function saveCogResults(userId, results) {
    const cogPuts = results.map(r => {
        r.dateTimeExperiment = `${r.dateTime}|${r.experiment}`;
        r.userId = userId;
        delete(r.dateTime);
        delete(r.experiment);
        return {
            PutRequest: {
                Item: r
            }
        };
    });

    while (cogPuts.length > 0) {
        const params = { RequestItems: {} };
        params.RequestItems[cogResultsTable] = cogPuts.splice(0, 25);
        const resp = await docClient.send(new BatchWriteCommand(params));
        if (resp.UnprocessedItems[cogResultsTable] && resp.UnprocessedItems[cogResultsTable].length > 0) {
            await retrySaveWithBackoff(resp.UnprocessedItems);
        }
    }
}

function calculateHourlyEarnings(minutes) {
    return Math.round(earningsAmounts[earningsTypes.PER_HOUR] * (minutes/60) * 100) / 100;
}

async function saveSessionsAndEarnings(userId, sessions, earnings) {
    const sessionPuts = sessions.map(s => {
        s.userId = userId;
        s.startDateTime = s.pulseStartTime;
        delete(s.pulseStartTime);
        return {
            PutRequest: {
                Item: s
            }
        };
    });

    const earningsPuts = earnings.map(e => {
        let amount;
        if (e.earnings === earningsTypes.PER_HOUR) {
            amount = calculateHourlyEarnings(e.minutes);
        } else {
            amount = earningsAmounts[e.earnings];
        }  
        if (amount === undefined) throw new Error(`Unrecognized earnings type ${e.earnings}.`)

        return {
            PutRequest: {
                Item: {
                    userId: userId,
                    dateType: `${e.date}|${e.earnings}`,
                    amount: amount
                }
            }
        }
    });
    
    // slice into arrays of no more than 25 PutRequests due to DynamoDB limits
    while (earningsPuts.length + sessionPuts.length > 0) {
        const params = { RequestItems: {} };
        const earningsChunkSize = Math.min(earningsPuts.length, 25);
        const sessionsChunkSize = Math.min(sessionPuts.length, 25 - earningsChunkSize);
        if (earningsChunkSize > 0) {
            params.RequestItems[earningsTable] = earningsPuts.splice(0, earningsChunkSize);
        }
        if (sessionsChunkSize > 0) {
            params.RequestItems[sessionsTable] = sessionPuts.splice(0, sessionsChunkSize);
        }
        const resp = await docClient.send(new BatchWriteCommand(params));
        if (resp.UnprocessedItems.length > 0) {
            await retrySaveWithBackoff(resp.UnprocessedItems);
        }
    }
}

async function retrySaveWithBackoff(unprocessedItems) {
    let remainingItems = unprocessedItems;
    let curTry = 0;
    const delayMs = 100;
    const maxTries = 7;
    while (curTry < maxTries && remainingItems[cogResultsTable] && remainingItems[cogResultsTable].length > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, curTry)));
        console.log(`Got unprocessed items saving earnings and sessions, re-attempting try #${curTry}...`);
        const resp = await docClient.send(new BatchWriteCommand({ RequestItems: remainingItems }));
        remainingItems = resp.UnprocessedItems;
        curTry += 1;
    }
    if (remainingItems.length > 0) {
        console.error(`Failed to save all earnings and sessions; after ${curTry} attempts there are ${remainingItems.length} unsaved items left.`);
    } else {
        console.log('Successfully saved all earnings and sessions on retry.');
    }
}

async function lastUploadedSessionTime(userId) {
    const dynResults = await lastUploadedTime(userId, sessionsTable);
    if (dynResults.Items.length === 0) return 0;
  
    return dynResults.Items[0].startDateTime;
}

async function lastUploadedCogResultTime(userId) {
    const dynResults = await lastUploadedTime(userId, cogResultsTable);
    if (dynResults.Items.length === 0) return 0;

    const parts = dynResults.Items[0].dateTimeExperiment.split('|')
  
    return parts[0];
}

async function lastUploadedTime(userId, dynTable) {
    const baseParams = new QueryCommand({
        TableName: dynTable,
        KeyConditionExpression: "userId = :userId",
        ScanIndexForward: false,
        Limit: 1,
        ExpressionAttributeValues: { ":userId": userId },
    });
    return await docClient.send(baseParams);
}

const rowToObject = (result) => {
    const rowProps = Object.keys(result).map(camelCase).map(k => k.startsWith('emwave') ? k.replace('emwave', 'emWave') : k);
    const rowVals = Object.values(result);
    return zipObject(rowProps, rowVals);
}
