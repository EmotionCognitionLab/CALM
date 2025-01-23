import { app, ipcMain } from 'electron';
import { statSync } from 'fs';
import { mkdir } from 'fs/promises';
import { camelCase, zipObject } from 'lodash'
import Database from 'better-sqlite3';
import s3utils from './s3utils.js'
import { SessionStore } from './session-store.js'
import packageInfo from "../package.json"
import * as path from 'path'
import { maxSessionMinutes } from '../../common/types/types.js';
import lte from 'semver/functions/lte';
import semverSort from 'semver/functions/sort';
import gt from 'semver/functions/gt';
import { yyyymmddString } from './utils.js'
import { trainingBonusRewards } from '../../common/earnings/index.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

let db;
let insertKeyValueStmt, getKeyValueStmt, insertCognitiveResultsStmt;

function dbPath() {
   return path.join(dbDir(), 'calm-study.sqlite');
}

function dbDir() {
    let dbDir;

    const userHome = app.getPath('home');
    if (process.platform === 'darwin') {
        dbDir = userHome +  '/Documents/calm-study/';
    } else if (process.platform === 'win32') {
        dbDir = userHome + '\\Documents\\calm-study';
    } else {
        throw `The '${process.platform}' operating system is not supported. Please use either Macintosh OS X or Windows.`;
    }

    return dbDir;
}

async function downloadDatabase(dest, session) {
    const resp = await s3utils.downloadFile(session, dest);
    if (resp.status === 'Error') {
        console.error('Failed to download breath database from s3.');
        throw new Error(resp.msg);
    }
}

function rowToObject(result) {
    const rowProps = Object.keys(result).map(camelCase);
    const rowVals = Object.values(result);
    return zipObject(rowProps, rowVals);
}

function checkVersion() {
    const curVerStmt = db.prepare('SELECT version from version ORDER BY date_time DESC LIMIT 1');
    const res = curVerStmt.get();
    if (!res || res.version !== packageInfo.version) {
        const curVer = res ? res.version : '0.0.0';
        runDbUpdates(curVer, packageInfo.version);
        const updateVerStmt = db.prepare('INSERT INTO version(version, date_time) VALUES(?, ?)');
        const dateTime = (new Date()).toISOString();
        updateVerStmt.run(packageInfo.version, dateTime);
    }
}

// If there are db changes that need to happen with a particular version
// (e.g., we've got active participants and need to upgrade their db's without
// disturbing their data), add them here. The key should be the app version 
// (as shown in client/package.json) and the value should be an array of DDL
// strings.
const dbUpdates = {
    '1.1.0': [
        'ALTER TABLE emwave_sessions ADD weighted_inverse_coherence FLOAT DEFAULT 0.0',
        'UPDATE emwave_sessions SET weighted_inverse_coherence = (min(round(duration_seconds/60), 18)/18.0) * (10-avg_coherence)'
    ],
    '1.2.1': [
        'ALTER TABLE emwave_sessions ADD audio TEXT'
    ]
}

/**
 * Given the current version of the database (from the most recent row in the version table)
 * and the current version of the app (as shown in package.json), finds all of the
 * keys in dbUpdates that are greater that the current db version and less than or equal
 * to the current app version and runs the associated DDL statements.
 * @param {string} curVersion 
 * @param {string} targetVersion 
 */
function runDbUpdates(curVersion, targetVersion) {
    const versionsWithUpdates = Object.keys(dbUpdates);
    const validVersions = versionsWithUpdates.filter(v => gt(v, curVersion) && lte(v, targetVersion));
    for (const version of semverSort(validVersions)) {
        for (const upd of dbUpdates[version]) {
            const stmt = db.prepare(upd);
            stmt.run();
        }
    }
}

function setKeyValue(key, value) {
    insertKeyValueStmt.run(key, value);
}

function getKeyValue(key) {
    const res = getKeyValueStmt.get(key);
    if (!res) return null;
    return res.value;
}

function deleteKeyValue(key) {
    const stmt = db.prepare('DELETE FROM key_value_store where name = ?');
    stmt.run(key)
}

function saveEmWaveSessionData(emWaveSessionId, avgCoherence, pulseStartTime, validStatus, durationSec, stage, audio) {
    const sessionMinutes = Math.min(Math.round(durationSec / 60), maxSessionMinutes); // participants don't get extra credit for doing sessions longer than max session length
    const weightedAvgCoherence = (sessionMinutes / maxSessionMinutes) * avgCoherence;
    const weightedInverseCoherence = (sessionMinutes / maxSessionMinutes) * (10 - avgCoherence);

    const insertStmt = db.prepare('INSERT INTO emwave_sessions(emwave_session_id, avg_coherence, weighted_avg_coherence, weighted_inverse_coherence, pulse_start_time, valid_status, duration_seconds, stage, audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    insertStmt.run(emWaveSessionId, avgCoherence, weightedAvgCoherence, weightedInverseCoherence, pulseStartTime, validStatus, durationSec, stage, audio);
}

function getEmWaveSessionsForStage(stage) {
    const stmt = db.prepare('SELECT * from emwave_sessions where stage = ? order by pulse_start_time asc');
    const res = stmt.all(stage);
    const resObjs = res.map(rowToObject).map(s => {
        s['emWaveSessionId'] = s['emwaveSessionId'];
        delete s['emwaveSessionId'];
        return s;
    })
    return resObjs;
}

function deleteEmWaveSessions(sessIds) {
    const stmt = db.prepare(`DELETE FROM emwave_sessions WHERE emwave_session_id IN (${sessIds.map(() => '?').join(',')})`);
    stmt.run(sessIds);
}

function getEmWaveSessionMinutesForDayAndStage(date, stage) {
    date.setHours(0); date.setMinutes(0); date.setSeconds(0); date.setMilliseconds(0);
    const startPulseTime = Math.round(date.getTime() / 1000);
    date.setHours(23); date.setMinutes(59); date.setSeconds(59); date.setMilliseconds(999);
    const endPulseTime = Math.round(date.getTime() / 1000);
    const stmt = db.prepare('SELECT sum(duration_seconds) as total_seconds FROM emwave_sessions where stage = ? and pulse_start_time >= ? and pulse_start_time <= ?');
    const result = stmt.all(stage, startPulseTime, endPulseTime)[0].total_seconds;
    return Math.floor(result / 60);
}

function getEmWaveWeightedAvgCoherencesForStage(stage) {
    const stmt = db.prepare('SELECT weighted_avg_coherence FROM emwave_sessions WHERE stage = ?');
    const result = stmt.all(stage);
    return result.map(rowToObject);
}

function earnedStage3Bonus(lastCompletedSessionId, condition) {
    const stmt = db.prepare('SELECT pulse_start_time from emwave_sessions where emwave_session_id = ?');
    const res = stmt.get(lastCompletedSessionId);
    const bonusFilterDate = dayjs.unix(res.pulse_start_time - 1).tz('America/Los_Angeles');
    const bonusEarnings = trainingBonusRewards(db, {date: bonusFilterDate.format()}, condition);
    return bonusEarnings.length > 0;
}

function hasDoneCognitiveExperiment(experiment, stage) {
    const stmt = db.prepare('SELECT COUNT(id) as count from cognitive_results WHERE experiment = ? AND stage = ? AND is_relevant = 1');
    const result = stmt.all(experiment, stage);
    return result[0]['count'] > 0;
}

function latestExperimentResult(experiment, stage) {
    const stmt = db.prepare('SELECT * from cognitive_results WHERE experiment = ? AND stage = ? ORDER BY date_time DESC LIMIT 1');
    const result = stmt.all(experiment, stage);
    return (result.map(rowToObject))[0];
}

function saveCognitiveResults(experiment, isRelevant, stage, results) {
    if (stage != 1 && stage != 4) {
        throw new Error(`Expected stage to be 1 or 4, but got ${stage}`);
    }
    const dateTime = (new Date()).toISOString();
    const relevant = isRelevant ? 1 : 0;
    insertCognitiveResultsStmt.run(experiment, relevant, dateTime, JSON.stringify(results), stage);
}

function getLumosityDoneToday() {
    const today = yyyymmddString(new Date());
    const key = `lumosity-${today}`;
    const value = getKeyValue(key);
    return value == 'true';
}

function setLumosityDoneToday() {
    const today = yyyymmddString(new Date());
    const key = `lumosity-${today}`;
    setKeyValue(key, 'true');
}

// import this module into itself so that we can mock
// certain calls in test
// https://stackoverflow.com/questions/51269431/jest-mock-inner-function
import * as testable from "./local-data.js";
async function initDb(serializedSession) {
    try {
        statSync(testable.dbPath());
    } catch (err) {
        if (err.code !== 'ENOENT') throw(err);
        // create directory (call is ok if dir already exists)
        await mkdir(testable.dbDir(), { recursive: true });

        // we have no local db file; try downloading it
        const session = SessionStore.buildSession(serializedSession);
        await testable.forTesting.downloadDatabase(testable.dbPath(), session);
    }

    try {
        // at this point if we don't have a db
        // then either it's a new user or we've
        // lost all their data :-(
        // either way, we can let sqlite create the database
        // if necessary
        db = new Database(testable.dbPath());

        const createKeyValueTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS key_value_store(name TEXT PRIMARY KEY, value TEXT NOT NULL)');
        createKeyValueTableStmt.run();
        insertKeyValueStmt = db.prepare('REPLACE INTO key_value_store(name, value) VALUES(?, ?)');
        getKeyValueStmt = db.prepare('SELECT value FROM key_value_store where name = ?');

        const createSessionTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS emwave_sessions(emwave_session_id TEXT PRIMARY KEY, avg_coherence FLOAT NOT NULL, weighted_avg_coherence FLOAT NOT NULL DEFAULT 0.0, pulse_start_time INTEGER NOT NULL, valid_status INTEGER NOT NULL, duration_seconds INTEGER NOT NULL, stage INTEGER NOT NULL)');
        createSessionTableStmt.run();

        const createCogDataTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS cognitive_results(id INTEGER NOT NULL PRIMARY KEY, experiment TEXT NOT NULL, is_relevant INTEGER NOT NULL, date_time TEXT NOT NULL, results TEXT NOT NULL, stage INTEGER NOT NULL)')
        createCogDataTableStmt.run();
        insertCognitiveResultsStmt = db.prepare('INSERT INTO cognitive_results(experiment, is_relevant, date_time, results, stage) VALUES(?, ? , ?, ?, ?)')

        const createVersionTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS version(version TEXT PRIMARY KEY, date_time TEXT NOT NULL)');
        createVersionTableStmt.run();
        // checkVersion should be the last thing here that runs any sql statements;
        // it may modify existing tables

        checkVersion();

        return db;
    } catch (err) {
        console.log('Error initializing breath database', err);
        throw(err);
    }
}

ipcMain.handle('login-succeeded', async (_event, session) => {
    if (!db) await initDb(session);
});

function closeDb() {
    if (db) db.close();
}

export {
    closeDb,
    dbDir,
    dbPath,
    getKeyValue,
    setKeyValue,
    deleteKeyValue,
    saveEmWaveSessionData,
    deleteEmWaveSessions,
    getEmWaveSessionsForStage,
    getEmWaveSessionMinutesForDayAndStage,
    getEmWaveWeightedAvgCoherencesForStage,
    earnedStage3Bonus,
    hasDoneCognitiveExperiment,
    latestExperimentResult,
    saveCognitiveResults,
    getLumosityDoneToday,
    setLumosityDoneToday
}
export const forTesting = { initDb, downloadDatabase }
