
'use strict';

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { dynamoDocClient as docClient } from '../common/aws-clients.js';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

import Db from 'db/db.js';
import { maxSessionMinutes, stage2BreathingMinutes, statusTypes } from '../../../common/types/types.js';

const snsEndpoint = process.env.SNS_ENDPOINT;
const region = process.env.REGION;

const homeTrainingMsgs = [
    "This is a friendly reminder from the CALM study team! If you haven't done your mindfulness practice today, why not start now?",
    "Remember to carve out some calm time for yourself today! Log in to get started.",
    "Day flying by? Take some time for yourself and focus on your heart.",
    "Hi there! This is your a reminder to do your daily mindfulness practice. Log in now for a quick 18-minute practice.",
    "Need a break? Take 18 minutes to slow down and relax. Log your practice now.",
    "Are you ready for a pause today? Calmness is just a click away.",
    "Hello! It's time for your daily mindfulness practice. Keep calm and carry on!"
];

const sns = new SNSClient({endpoint: snsEndpoint, apiVersion: '2010-03-31', region: region});
const db = new Db();
db.docClient = docClient;

export async function handler (event) {
    const reminderType = event.reminderType;
    if (reminderType && reminderType =='homeTraining') {
        await sendHomeTraininingReminders(reminderType);
    } else {
        const errMsg = `A reminderType of 'homeTraining' was expected, but '${reminderType}' was received.`;
        console.error(errMsg);
        throw new Error(errMsg);
    }
}

async function sendHomeTraininingReminders(reminderType) {
    let sentCount = 0;
    const usersToRemind = [];
    try {
        const activeUsers = await db.getActiveUsers();
        for (const u of activeUsers) {
            const todayStart = dayjs().tz('America/Los_Angeles').startOf('day').toDate();
            const todayEnd = dayjs().tz('America/Los_Angeles').endOf('day').toDate();
            let curStage;
            if (u?.progress?.status == statusTypes.STAGE_1_COMPLETE) {
                curStage = 2;
            } else if (u?.progress?.status == statusTypes.STAGE_2_COMPLETE) {
                curStage = 3;
            } else {
                console.error(`User ${u.userId} is apparently active but status is ${u?.progress?.status}. Unable to send reminders.`);
                continue;
            }
            const sessions = await db.sessionsForUser(u.userId, todayStart, todayEnd, curStage);
            const minutes = sessions.reduce((prev, cur) => Math.round(cur.durationSeconds / 60) + prev, 0);
            if (curStage == 2 && minutes < 2 * stage2BreathingMinutes) usersToRemind.push(u); // stage 2 users should do 2 2 minute sessions/day
            if (curStage == 3 && minutes < 2 * maxSessionMinutes) usersToRemind.push(u); 
        }
        const randMsgIdx = Math.floor(Math.random() * homeTrainingMsgs.length);
        const msg = homeTrainingMsgs[randMsgIdx];
        if (!msg) {
            const errMsg = `No message details found for message index ${randMsgIdx}.`;
            console.error(errMsg);
            throw new Error(errMsg);
        }
        sentCount = await deliverReminders(usersToRemind, msg);
    } catch (err) {
        console.error(`Error sending reminders for home training (${reminderType}) tasks: ${err.message}`, err);
    }
    console.log(`Done sending ${sentCount} home training reminders.`);
}

async function deliverReminders(recipients, msg) {
    let sentCount = 0;

    const phoneRecipients = recipients.filter(r => r.phone_number_verified);

    const phoneSends = phoneRecipients.map(async u => {
        await sendSMS(u.phone_number, msg);
        sentCount++;
    });

    await Promise.all(phoneSends);

    return sentCount;
}

/**
 * Sends msg to one phone number.
 * @param {string} The e164 formatted phone number we're sending the message to 
 * @param {object} msg An object with an sms field containing the text we're sending
 */
 async function sendSMS(recip, msg) {
    const params = {
        Message: msg,
        PhoneNumber: recip,
        MessageAttributes: {
            'AWS.SNS.SMS.SMSType': {
                DataType: 'String',
                StringValue: 'Transactional'
            }
        }
    }
    try {
        await sns.send(new PublishCommand(params));
    } catch (err) {
        console.error(`Error sending sms to ${recip}. (Message: ${msg.sms})`, err);
    }
}
