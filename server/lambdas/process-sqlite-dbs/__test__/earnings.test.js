'use strict';

import { trainingBonusRewards, trainingTimeRewards, visitRewards } from "../earnings.js"
import { earningsTypes } from '../../../../common/types/types.js';
import dayjs from 'dayjs';
import { deleteSessions, initSqliteDb, insertEmwaveSessions } from "./sqlite-helper.js";
import { mkdtemp, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const customParseFormat = require('dayjs/plugin/customParseFormat.js');
dayjs.extend(customParseFormat);

const mockEarningsForUser = jest.fn(() => []);
const mockGetAllUsers = jest.fn(() => []);
const mockSaveEarnings = jest.fn(() => {});

const dbMocks = [mockEarningsForUser, mockGetAllUsers, mockSaveEarnings];

let sqliteTestDbPath;

jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            earningsForUser: (userId, earnType) => mockEarningsForUser(userId, earnType),
            getAllUsers: () => mockGetAllUsers(),
            saveEarnings: (userId, earningsType, dateDone) => mockSaveEarnings(userId, earningsType, dateDone),
        };
    });
});

describe("earnings", () => {
    let db;

    beforeAll(async () => {
        const dbDir = await mkdtemp(tmpdir());
        sqliteTestDbPath = join(dbDir, 'TestEarnings.sqlite');
        db = await initSqliteDb(sqliteTestDbPath);
    });

    beforeEach(() => {
        deleteSessions(db);
    });

    afterAll(async () => {
        if (db) {
            db.close();
        }
        await unlink(sqliteTestDbPath);
    });

    describe("for time", () => {
        it("should give rewards for all eligible days if there are no previous earnings", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-10 09:30', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 17*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-11 19:42', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 18*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-12 15:19', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 18*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-12 16:11', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 18*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const res = trainingTimeRewards(db, null);
            expect(res.length).toBe(newSessions.length);
            const expectedResult = newSessions.map(s => ({
                date: dayjs.unix(s.pulse_start_time).tz('America/Los_Angeles').format(),
                minutes: s.duration_seconds / 60,
                earnings: earningsTypes.PER_HOUR
            }));
            expect(res).toEqual(expect.arrayContaining(expectedResult));
        });
    
        it("should not give rewards for sessions that happened before the last time earnings date", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-10 09:30', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 17*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-11 19:42', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 18*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-12 15:19', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 18*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-12 16:11', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 18*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const lastEarnedIdx = 2;
            const res = trainingTimeRewards(db, {date: dayjs.unix(newSessions[lastEarnedIdx].pulse_start_time).tz('America/Los_Angeles').format()});
            const expectedEarningSessions = newSessions.slice(lastEarnedIdx + 1);
            expect(res.length).toBe(expectedEarningSessions.length);
            const expectedResult = expectedEarningSessions.map(s => ({
                date: dayjs.unix(s.pulse_start_time).tz('America/Los_Angeles').format(),
                minutes: s.duration_seconds / 60,
                earnings: earningsTypes.PER_HOUR
            }));
            expect(res).toEqual(expect.arrayContaining(expectedResult));
        });
    
        it("should not give rewards for sessions in stages other than 3", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 1, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 2, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-10 09:30', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 17*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-11 19:42', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 18*60, stage: 4, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const res = trainingTimeRewards(db, null);
            const expectedEarningSessions = newSessions.filter(s => s.stage == 3);
            expect(res.length).toBe(expectedEarningSessions.length);
            const expectedResult = expectedEarningSessions.map(s => ({
                date: dayjs.unix(s.pulse_start_time).tz('America/Los_Angeles').format(),
                minutes: s.duration_seconds / 60,
                earnings: earningsTypes.PER_HOUR
            }));
            expect(res).toEqual(expect.arrayContaining(expectedResult));
        });

    });

    describe.each([
        {visit: 1, stage: 1, eType: earningsTypes.VISIT_1},
        {visit: 2, stage: 4, eType: earningsTypes.VISIT_2},
    ])("for visit $visit", ({visit, stage, eType}) => {
        it(`should use the most recent session for stage ${stage} to set the earnings date for visit ${visit}`, async () => {
            const sessions = [
                { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: stage, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 09:22', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: stage, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 09:30', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 2, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
            ];
            insertEmwaveSessions(db, sessions);
            const res = visitRewards(db, visit);
            const targetDate = sessions.filter(s => s.stage == stage).map(s => s.pulse_start_time).sort().pop();
            const expectedResult = {
                date: dayjs.unix(targetDate).tz('America/Los_Angeles').format(), 
                earnings: eType
            }
            expect(res).toEqual(expect.arrayContaining([expectedResult]));
        });
    });

    describe("bonus rewards", () => {
        it("should use all stage 3 sessions if no latestBonusEarnings parameter is provided", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.1, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const res = trainingBonusRewards(db, null);
            const expectedResult =
                {
                    date: dayjs.unix(newSessions[1].pulse_start_time).tz('America/Los_Angeles').format(), 
                    earnings: earningsTypes.BONUS
                };
            expect(res).toEqual(expect.arrayContaining([expectedResult]));
        });

        it("should use only stage 3 sessions later than the latestBonusEarnings date, when provided", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.1, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-10 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.2, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-10 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.3, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const lastBonusEarning = 
                { 
                    date: dayjs.unix(newSessions[1].pulse_start_time).tz('America/Los_Angeles').format(),
                    earnings: earningsTypes.BONUS
                };
            const res = trainingBonusRewards(db, lastBonusEarning);
            const expectedResult = 
                [
                    {
                        date: dayjs.unix(newSessions[2].pulse_start_time).tz('America/Los_Angeles').format(), 
                        earnings: earningsTypes.BONUS
                    },
                    {
                        date: dayjs.unix(newSessions[3].pulse_start_time).tz('America/Los_Angeles').format(), 
                        earnings: earningsTypes.BONUS
                    }
                ];
            expect(res).toEqual(expect.arrayContaining(expectedResult));
        });

        it("should only give a bonus if a session has a weighted_avg_coherence in the top 25% of previously completed sessions", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 0.7, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const res = trainingBonusRewards(db, null);
            expect(res.length).toEqual(0);
        });

        it("should only give bonuses for sessions that happened on days that included at least 18 minutes of breathing", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.1, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-10 9:17', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 12*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 2.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-10 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 5*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 2.1, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const res = trainingBonusRewards(db, null);
            const expectedResult =
                {
                    date: dayjs.unix(newSessions[1].pulse_start_time).tz('America/Los_Angeles').format(), 
                    earnings: earningsTypes.BONUS
                };
            expect(res).toEqual(expect.arrayContaining([expectedResult]));
        });

        it("should process multiple sessions correctly by adding qualifying earlier sessions to the top 25% when determining the cutoff for later sessions", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.2, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-10 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.4, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-10 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.2, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-11 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.2, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-11 11:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.2, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const lastBonusEarning = 
                { 
                    date: dayjs.unix(newSessions[2].pulse_start_time).tz('America/Los_Angeles').format(),
                    earnings: earningsTypes.BONUS
                };
            const res = trainingBonusRewards(db, lastBonusEarning);
            const expectedResult = 
                {
                    date: dayjs.unix(newSessions[5].pulse_start_time).tz('America/Los_Angeles').format(),
                    earnings: earningsTypes.BONUS
                };
            expect(res).toEqual(expect.arrayContaining([expectedResult]));
        });

        it("should not give a bonus for the very first stage 3 session", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.1, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const res = trainingBonusRewards(db, null);
            expect(res.length).toEqual(0);
        });

        it("should include sessions from the same day that were already processed for bonuses when considering whether a new session belongs to a qualifying day", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 13*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.2, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 11:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 15*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.4, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const lastBonusEarning = 
                { 
                    date: dayjs.unix(newSessions[0].pulse_start_time).tz('America/Los_Angeles').format(),
                    earnings: earningsTypes.BONUS
                };
            const res = trainingBonusRewards(db, lastBonusEarning);
            const expectedResults = newSessions.slice(1).map(s => ({
                date: dayjs.unix(s.pulse_start_time).tz('America/Los_Angeles').format(),
                earnings: earningsTypes.BONUS
            }));
            expect(res).toEqual(expect.arrayContaining(expectedResults));
        });

        it("should pay a bonus for a qualifying session that is shorter than 18 minutes as long as the day had at least 18 minutes", () => {
            const newSessions = [
                { pulse_start_time: dayjs('2024-03-06 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.0, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 13*60, stage: 3, avg_coherence: 0.9, weighted_avg_coherence: 1.2, valid_status: 1 },
                { pulse_start_time: dayjs('2024-03-09 11:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60, stage: 3, avg_coherence: 1.0, weighted_avg_coherence: 1.4, valid_status: 1 },
            ];
            insertEmwaveSessions(db, newSessions);
            const res = trainingBonusRewards(db, null);
            const expectedResults = newSessions.slice(1).map(s => ({
                date: dayjs.unix(s.pulse_start_time).tz('America/Los_Angeles').format(),
                earnings: earningsTypes.BONUS
            }));
            expect(res).toEqual(expect.arrayContaining(expectedResults));
        });
    });

});

