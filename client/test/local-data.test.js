import * as ld from "../src/local-data.js";
import { maxSessionMinutes } from '../../common/types/types.js';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn(() => {})
}));

jest.mock('electron', () => {
    return { ipcMain: { on: jest.fn(), handle: jest.fn() }}
});


let db;
const tableNames = ['key_value_store', 'emwave_sessions'];

function cleanDb() {
    tableNames.forEach(t => db.exec(`DELETE from ${t}`));
}

function rowCount(tableName) {
    const stmt = db.prepare(`select count(*) from ${tableName}`);
    return stmt.get()["count(*)"];
}

describe("Breathing data functions", () => {
    
    beforeAll(async () => {
        jest.spyOn(ld, "dbPath").mockImplementation(() => ":memory:");
        jest.spyOn(ld, "dbDir").mockImplementation(() => "/dev/null");
        const downloadSpy = jest.spyOn(ld.forTesting, "downloadDatabase");
        downloadSpy.mockImplementation(() => {});
        db = await ld.forTesting.initDb({
            tokenScopes: {

            },
            idToken: {
                jwtToken: ""
            },
            accessToken: {
                jwtToken: ""
            },
            refreshToken: {
                jwtToken: ""
            },
        });
        expect(downloadSpy).toHaveBeenCalled();
    });

    afterAll(() => {
        ld.closeDb();
    });

    beforeEach(() => {
        cleanDb();
        tableNames.forEach(t => {
            expect(rowCount(t)).toBe(0);
        });
    });

    it("should use an in-memory database in test", () => {
        const path = ld.dbPath();
        expect(path).toBe(":memory:");
    });

    it("should calculate and save weighted avg coherence when saving emwave data", () => {
        const avgCoh = 4.0;
        const durationMin = 9;
        const durationSec = durationMin * 60;
        const stage = 2
        ld.saveEmWaveSessionData('b1', avgCoh, Date.now(), 1, durationSec, stage);

        const wac = ld.getEmWaveWeightedAvgCoherencesForStage(stage);
        expect(wac.length).toBe(1);
        const expectedWeightedCoherence = (durationMin / maxSessionMinutes) * avgCoh;
        expect(wac[0].weightedAvgCoherence).toBe(expectedWeightedCoherence);
    });

    describe("getEmWaveSessionMinutesForDayAndStage", () => {

        it("should use only data for the given stage", () => {
            const stage1Sess1Date = new Date(2024, 5, 19, 22, 11, 44);
            const stage2Sess1Date = new Date(2024, 5, 19, 22, 29, 44);
            const testData = [
                {sessId: 'a1', avgCoh: 4.2, pulseStart: stage1Sess1Date, valid: 1, durationSec: 60 * 15, stage: 1},
                {sessId: 'b1', avgCoh: 3.6, pulseStart: stage2Sess1Date, valid: 1, durationSec: 60 * 18, stage: 2},
            ];
            testData.forEach(d => ld.saveEmWaveSessionData(d.sessId, d.avgCoh, Math.floor(d.pulseStart.getTime() / 1000), d.valid, d.durationSec, d.stage));

            testGetEmWaveSessionMinutes(2, stage2Sess1Date, testData);
        });
    
        it("should use only data for the given day", () => {
            const stage2Sess1Date = new Date(2024, 5, 19, 22, 29, 44);
            const stage2Sess2Date = new Date(2024, 5, 23, 15, 2, 17);
            const testData = [
                {sessId: 'b1', avgCoh: 3.6, pulseStart: stage2Sess1Date, valid: 1, durationSec: 60 * 18, stage: 2},
                {sessId: 'b2', avgCoh: 3.6, pulseStart: stage2Sess2Date, valid: 1, durationSec: 60 * 20, stage: 2},
            ];
            testData.forEach(d => ld.saveEmWaveSessionData(d.sessId, d.avgCoh, Math.floor(d.pulseStart.getTime() / 1000), d.valid, d.durationSec, d.stage));
            
            testGetEmWaveSessionMinutes(2, stage2Sess2Date, testData);
        });

        it("should return 0 if there are no results", () => {
            const res = ld.getEmWaveSessionMinutesForDayAndStage(new Date(1990, 0, 1), 2);
            expect(res).toBe(0);
        });
    });
});

function dateToSecondsRange(someDate) {
    const date = new Date(someDate);
    const res = [];
    date.setHours(0); date.setMinutes(0); date.setSeconds(0); date.setMilliseconds(0);
    res.push(Math.floor(date.getTime() / 1000));
    date.setHours(23); date.setMinutes(59); date.setSeconds(59); date.setMilliseconds(999);
    res.push(Math.floor(date.getTime() / 1000));

    return res;
}

const date2Sec = (date) => Math.floor(date.getTime() / 1000)

function testGetEmWaveSessionMinutes(targetStage, targetDate, testData) {
    const dateRange = dateToSecondsRange(targetDate);
    const expectedRes = testData.filter(d => d.stage == targetStage && dateRange[0] <= date2Sec(d.pulseStart) && dateRange[1] >= date2Sec(d.pulseStart));
    expect(expectedRes.length).toBe(1);
    const expectedSessionMinutes = Math.round(expectedRes[0].durationSec / 60);
    const res = ld.getEmWaveSessionMinutesForDayAndStage(targetDate, 2);
    expect(res).toBe(expectedSessionMinutes);
}