import { sesClient, dynamoDocClient as docClient } from '../common/aws-clients';
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { SendRawEmailCommand } from '@aws-sdk/client-ses';
import { statusTypes } from '../../../common/types/types';
import Db from 'db/db.js';

const db = new Db();
db.docClient = docClient;

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const sessionsTable = process.env.SESSIONS_TABLE;
const staffRcid = process.env.STAFF_LABEL;
const recipientEmails = process.env.RECIPIENT_EMAILS;
const emailSender = process.env.EMAIL_SENDER;


export async function handler (event) {
    const users = await db.getAllUsers();
    const records = await Promise.all(
        users.filter(u => u.rcid != staffRcid)
        .map(async user => {
            const { start, end, status } = await getStage3Dates(user);
            return {
                rcid: user.rcid,
                start: start,
                end: end,
                status: status
            };
        })
    );
    const csv = toCSV(['rcid', 'start', 'end', 'status'], records);
    await sendEmailWithCsv(csv, recipientEmails);
}

function toCSV(fields, data) {
    const headerLine = fields.join(',');
    const csvData = data.map(d => {
        return fields.map(f => d[f]).join(",");
    });
    return headerLine + '\n' + csvData.join('\n');
}

async function sendEmailWithCsv(csvContent, recipientEmailAddrs) {
    const today = dayjs().tz('America/Los_Angeles').format('YYYY-MM-DD');
    let email = `From: ${emailSender}\n`;
    email += `To: ${recipientEmailAddrs}\n`,
    email += "Subject: CALM participant report\n";
    email += "MIME-Version: 1.0\n"
    email += "Content-Type: multipart/mixed; boundary=\"aPart\"\n\n"
    email += "--aPart\n"
    email += "Content-Type: text/plain\n\n"
    email += "The participant report for the CALM study is attached.\n\n"
    email += "--aPart\n"
    email += `Content-Type: application/octect-stream; name=\"${today}-CALM-participant-report.csv\"\n`;
    email += "Content-Transfer-Encoding: base64\n";
    email += "Content-Disposition: attachment\n\n";
    email += Buffer.from(csvContent, 'utf-8').toString("base64").replace(/([^\0]{76})/g, "$1\n") + "\n\n";
    email += "--aPart--";

    const params = {
        RawMessage: {
            Data: email
        },
        Source: emailSender
    };

    try {
        const cmd = new SendRawEmailCommand(params);
        await sesClient.send(cmd);
    } catch (err) {
        console.error('Error sending email:', err);
    }
}

async function getStage3Dates(user) {
    let startDate = 'N/A';
    let endDate = 'N/A';
    let status = 
        user.progress?.status == statusTypes.COMPLETE || user.progress?.status == statusTypes.DROPPED ? user.progress.status : 'enrolled';
    
    if (!user?.progress[statusTypes.STAGE_2_COMPLETED_ON]) {
       return { start: startDate, end: endDate, status: status };
    }

    const params = {
        TableName: sessionsTable,
        KeyConditionExpression: "userId = :userId",
        FilterExpression: '#stage = :three',
        ProjectionExpression: 'startDateTime',
        ExpressionAttributeNames: {
            '#stage': 'stage'
        },
        ExpressionAttributeValues: {
            ':three': 3,
            ':userId': user.userId
        }
    };
    const result = await docClient.send(new QueryCommand(params));
    if (result.Count > 0) {
        const sessions = result.Items;
        startDate = unixEpochToPT(sessions[0].startDateTime);
        if (user.progress?.status == statusTypes.COMPLETE || user.progress?.status == statusTypes.DROPPED) {
            endDate = unixEpochToPT(sessions[sessions.length - 1].startDateTime);
        }
    }

    return { start: startDate, end: endDate, status: status };
}

function unixEpochToPT(unixEpoch) {
    return dayjs.unix(unixEpoch).tz('America/Los_Angeles').format('YYYY-MM-DD');
}