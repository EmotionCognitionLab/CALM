import { dynamoDocClient as docClient } from "../common/aws-clients.js";
const dayjs = require('dayjs')
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
dayjs.extend(timezone);
import Db from 'db/db.js';

import { earningsTypes } from '../../../common/types/types.js';
import { trainingBonusRewards  as calculateBonusRewards } from "../../../common/earnings/index.js";

const db = new Db();
db.docClient = docClient;

/**
 * Calculates time-based rewards.
 * @param {Object} sqliteDb Handle to open sqlite db
 * @param {Object} latestTimeEarnings most recent time-based earnings record for this participant
 * @returns Array of objects with date, minutes, earnings fields. Date is ISO8601 date for the earnings, minutes is the number of minutes for that day, earnings is the earnings type.
 */
export const trainingTimeRewards = (sqliteDb, latestTimeEarnings) => {
    let startDay;
    if (!latestTimeEarnings) {
        startDay = dayjs('1970-01-01 00:00').tz('America/Los_Angeles');
    } else {
        startDay = dayjs(latestTimeEarnings.date).tz('America/Los_Angeles');
    }
    const stmt = sqliteDb.prepare('select pulse_start_time, duration_seconds from emwave_sessions where stage = 3 and pulse_start_time > ?');
    const results = stmt.all(startDay.unix());
    const newEarnings = []
    for (const r of results) {
        newEarnings.push({
            date: dayjs.unix(r.pulse_start_time).tz('America/Los_Angeles').format(),
            minutes: (r.duration_seconds / 60),
            earnings: earningsTypes.PER_HOUR
        });
    }

    return newEarnings;
}

export const trainingBonusRewards = (sqliteDb, latestBonusEarnings, condition) => {
    return calculateBonusRewards(sqliteDb, latestBonusEarnings, condition);
}

export const visitRewards = (sqliteDb, visitNum) => {
    if (visitNum != 1 && visitNum != 2) throw new Error(`Invalid visit number. Expected 1 or 2 but got ${visitNum}.`);
    const stage = visitNum == 1 ? 1 : 4;

    const stmt = sqliteDb.prepare('select max(pulse_start_time) as pulse_start_time from emwave_sessions where stage = ?');
    const res = stmt.get(stage);
    if (res.pulse_start_time) {
        const earnType = stage == 1 ? earningsTypes.VISIT_1 : earningsTypes.VISIT_2;
        return [ {date: dayjs.unix(res.pulse_start_time).tz('America/Los_Angeles').format(), earnings: earnType} ];
    }
    return [];
}

