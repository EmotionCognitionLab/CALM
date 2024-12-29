'use strict';

const dayjs = require('dayjs')
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat.js');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

import { earningsTypes, maxSessionMinutes } from '../types/types';

const minutesPerDay = (sqliteDb, startTime) => {
    const stmt = sqliteDb.prepare('select pulse_start_time, duration_seconds from emwave_sessions where stage = 3 and pulse_start_time > ?');
    const results = stmt.all(startTime);
    const minutesByDay = {};
    for (const r of results) {
        const day = dayjs.unix(r.pulse_start_time).tz('America/Los_Angeles').format('YYYY-MM-DD');
        const minutes = minutesByDay[day] || 0;
        minutesByDay[day] = minutes + Math.round(r.duration_seconds / 60);
    }

    return Object.keys(minutesByDay).sort((a, b) => a - b).map(day => ({day: day, minutes: minutesByDay[day]}));
}

export const trainingBonusRewards = (sqliteDb, latestBonusEarnings) => {
    let startDay;
    if (!latestBonusEarnings) {
        startDay = dayjs('1970-01-01 00:00').tz('America/Los_Angeles');
    } else {
        startDay = dayjs(latestBonusEarnings.date).tz('America/Los_Angeles');
    }

    const minutesByDay = minutesPerDay(sqliteDb, startDay.startOf('day').unix());
    const eligibleDays = minutesByDay.filter(mbd => mbd.minutes >= maxSessionMinutes).map(i => i.day);
    if (eligibleDays.length == 0) return [];

    const stmt = sqliteDb.prepare('select weighted_avg_coherence from emwave_sessions where stage = 3 and pulse_start_time <= ? order by weighted_avg_coherence desc');
    const priorCoherenceVals = stmt.all(startDay.unix()).map(r => r.weighted_avg_coherence)

    const newSessionsStmt = sqliteDb.prepare('select weighted_avg_coherence, pulse_start_time from emwave_sessions where pulse_start_time > ? and stage = 3 order by pulse_start_time asc');
    const newSessions = newSessionsStmt.all(startDay.unix());
    const bonusEarnings = []
    for (const sess of newSessions) {
        const sessDay = dayjs.unix(sess.pulse_start_time).tz('America/Los_Angeles').format('YYYY-MM-DD');
        if (!eligibleDays.includes(sessDay)) continue;

        const top25 = Math.ceil(priorCoherenceVals.length * 0.25);
        const top25Cutoff = priorCoherenceVals[top25 - 1];
        if (top25Cutoff && sess.weighted_avg_coherence >= top25Cutoff) {
            bonusEarnings.push({
                date: dayjs.unix(sess.pulse_start_time).tz('America/Los_Angeles').format(), 
                earnings: earningsTypes.BONUS
            });
        }
        priorCoherenceVals.push(sess.weighted_avg_coherence);
        priorCoherenceVals.sort((a,b) => b - a);
    }
    
    return bonusEarnings;
}