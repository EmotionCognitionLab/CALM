import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import Db from 'db/db.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { statusTypes } from '../../../common/types/types';
dayjs.extend(utc);
dayjs.extend(timezone);

const region = process.env.REGION;
const dynamoEndpoint = process.env.DYNAMO_ENDPOINT;
const lumosPlaysTable = process.env.LUMOS_PLAYS_TABLE;

const noAccess = {
    statusCode: 401,
    body: "You do not have permission to access this information"
};

exports.handler = async(event) => {
    const userRole = event.requestContext.authorizer.jwt.claims['cognito:preferred_role'];
    if (!userRole) return noAccess;

    const path = event.requestContext.http.path;
    const method = event.requestContext.http.method;
    const credentials = await credentialsForRole(userRole);
    const db = dbWithCredentials(credentials);

    if (path === "/admin/participants/all") {
        return await db.getAllUsers();
    }

    if (path === "/admin/participants/active") {
        return await db.getActiveUsers();
    }

    if (path.startsWith("/admin/participant/")) {
        const participantId = event.pathParameters.id;
        if (method === "PUT") {
            const properties = JSON.parse(event.body);
            return await db.updateUser(participantId, properties);
        }
        
        if (method === "GET") {
            if (path.startsWith(`/admin/participant/${participantId}/earnings`)) {
                const earningsType = event.pathParameters.earningsType;
                return await db.earningsForUser(participantId, earningsType);
            }

            if (path === `/admin/participant/${participantId}/status`) {
                return await getUserStatus(participantId, db);
            }

            if (path === `/admin/participant/${participantId}`){
                const consistentRead = event.queryStringParameters && event.queryStringParameters.consistentRead === 'true';
                return await db.getUser(participantId, consistentRead);
            }
        }
            
        return errorResponse({statusCode: 400, message: `Unknown operation "${method} ${path}"`});
    }

    return errorResponse({statusCode: 400, message: `Unknown operation "${method} ${path}"`});
}

/**
 * Returns object with fields recentMinutes (total training minutes in last three days),
 * recentLumosityCount (the number of lumosity games played in the last three days),
 * last18MinutesDate (most recent YYYY-MM-DD date string with at least 18 minutes of mindfulness practice),
 * and last3PlaysDate (most recent YYYY-MM-DD date string on which at least 3 Lumosity games were played).
 * @param {string} participantId 
 * @param {*} db 
 * @returns {{recentMinutes: number, recentSessionCount: number, latestCompleteSession: string, recentLumosityCount: number}}
 */
async function getUserStatus(participantId, db) {
    const user = await db.getUser(participantId);
    const status = user?.progress?.status;
    if (!status || 
        (status != statusTypes.STAGE_1_COMPLETE && status != statusTypes.STAGE_2_COMPLETE)) {
        return {
            'recentMinutes': 0,
            'last18MinutesDate': 'N/A',
            'recentLumosityCount': 0,
            'last3PlaysDate': 'N/A'
         };
    }

    const stage = (status == statusTypes.STAGE_2_COMPLETE) ? 3 : 2;
    const sessions = await db.sessionsForUser(participantId, new Date(0), new Date(1000 * 60 * 60 * 24 * 365 * 1000), stage);
    const today = dayjs().tz('America/Los_Angeles');
    // status is based on past three days, starting yesterday
    const statusStart = today.subtract(4, 'days').startOf('day');
    const statusEnd = today.subtract(1, 'days').endOf('day');
    
    // get total minutes in last three days
    const recentSessions = sessions.filter(s => s.startDateTime >= statusStart.unix() && s.startDateTime <= statusEnd.unix())
    let totalMinutes = 0;
    for (const s of recentSessions) {
        totalMinutes += Math.round(s.durationSeconds / 60);
    }

    // get most recent date with at least 18 minutes of breathing
    // sessions should already be sorted in ascending order by startDateTime
    const minutesByDay = sessions.reduce((accum, cur) => {
        const date = dayjs.unix(cur.startDateTime).format('YYYY-MM-DD');
        const minutes = Math.round(cur.durationSeconds / 60);
        const curMin = accum[date] || 0;
        accum[date] = curMin + minutes;
        return accum;
    }, {});
    const datesWith18Minutes = Object.entries(minutesByDay).filter(([_date, minutes]) => minutes >= 18);
    const last18MinutesDate = datesWith18Minutes.length > 0 ? datesWith18Minutes.pop()[0] : 'N/A';

    // get Lumosity plays in last three days
    const lumosPlays = await lumosityPlaysForUser(participantId, db);
    const startStr = statusStart.format('YYYY-MM-DD HH:mm:ss');
    const endStr = statusEnd.format('YYYY-MM-DD HH:mm:ss');
    const recentPlaysCount = lumosPlays.filter(l => l.dateTime >= startStr && l.dateTime <= endStr).length;

    // get most recent date with three lumosity plays
    // plays should already be sorted in ascending order by dateTime
    const playsByDay = lumosPlays.reduce((accum, cur) => {
        const date = cur.dateTime.substring(0, 10);
        const curCount = accum[date] || 0;
        accum[date] = curCount + 1;
        return accum;
    }, {});
    const datesWith3Plays = Object.entries(playsByDay).filter(([_date, plays]) => plays >= 3);
    const last3PlaysDate = datesWith3Plays.length > 0 ? datesWith3Plays.pop()[0] : 'N/A';

    return {
        'recentMinutes': totalMinutes,
        'last18MinutesDate': last18MinutesDate,
        'recentLumosityCount': recentPlaysCount,
        'last3PlaysDate': last3PlaysDate
     };
}

async function lumosityPlaysForUser(userId, db) {
    const baseParams = {
        TableName: lumosPlaysTable,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {":userId": userId}
      };
      const dynResults = await db.docClient.send(new QueryCommand(baseParams));
      return dynResults.Items;
}

async function credentialsForRole(roleArn) {
    const assumeRoleCmd = new AssumeRoleCommand({RoleArn: roleArn, RoleSessionName: "lambdaCognitoUser"});
    const stsClient = new STSClient({ region: region });
    const roleData = await stsClient.send(assumeRoleCmd);
    return {
        accessKeyId: roleData.Credentials.AccessKeyId,
        secretAccessKey: roleData.Credentials.SecretAccessKey,
        sessionToken: roleData.Credentials.SessionToken
    };
}

function dbWithCredentials(credentials) {
    const dynClient = new DynamoDBClient({region: region, endpoint: dynamoEndpoint, apiVersion: "2012-08-10", credentials: credentials});
    const docClient = DynamoDBDocumentClient.from(dynClient);

    const db = new Db();
    db.docClient = docClient;
    db.credentials = credentials;
    return db;
}

function errorResponse(err) {
    const resp = {
        "body": JSON.stringify(err.message)
    } 

    if (err.statusCode) {
        resp["statusCode"] = err.statusCode;
    }

    if (err.code) {
        resp["headers"]["x-amzn-ErrorType"] = err.code;
        resp["body"] = `${err.code}: ${JSON.stringify(err.message)}`;
    }

    return resp;
}