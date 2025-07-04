import { minSessionSeconds } from "../../common/types/types";

export function quit() {
    window.mainAPI.quit()
}

export function yyyymmddNumber(date) {
    return Number.parseInt(yyyymmddString(date));
}

export function yyyymmddString(date) {
    return `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2,0)}${date.getDate().toString().padStart(2, 0)}`;
}

export async function getCondition(apiClient) {
    const data = await apiClient.getSelf()
    return data.condition
}

export const defaultBreathsPerMinute = 5.4

/**
 * Calculates a personalized breathing pace for a participant.
 * First checks to see if a given frequency showed peak power more than others. If so, 
 * use it. If not, return the frequency with the highest Y value. If all four peak values are 'n/a'
 * then return the standard slow (or slower) breathing pace instead of a personalized one.
 * @param {[object]} peakFreqs the frequencies that showed peak power during setup breathing exercises. Must be an array with four entries. Each entry should be an object with 'slowX', 'slowY', 'slowerX', and 'slowerY' keys. All values should be floats or 'n/a'.
 * @returns {number} breathing frequency in breaths per minute 
*/
export function calculatePersonalizedPace(peakFreqs) {
    if (peakFreqs.length != 4) {
        throw new Error(`Expected four frequencies but received ${peakFreqs.length}`);
    }

    const validFreqs = peakFreqs.filter(p => p.slowX !== 'n/a')
    .map(p => {
        return {x: +(Math.round(p.slowX + "e+3") + "e-3"), y: p.slowY} // round x values to three decimal places
    });
    
    if (validFreqs.length == 0) {
        return defaultBreathsPerMinute;
    }

    if (validFreqs.length == 1) {
        return hzToBreathsPerMinute(validFreqs[0].x);
    }

    // check for a frequency that appears most often
    const freqCounts = {}
    validFreqs.forEach(({x, _y}) => {
        const count = freqCounts[x] || 0;
        freqCounts[x] = count + 1;
    });
    let maxCount = 1;
    let modalFreq = null;
    Object.entries(freqCounts).forEach(([freq, count]) => {
        if (count > maxCount) {
            maxCount = count;
            modalFreq = freq;
        }
    });
    if (maxCount > 1) {
        return hzToBreathsPerMinute(modalFreq);
    }

    // no frequency appeared more than once; just return the 
    // one with the highest Y value
    let maxY = -Infinity
    let targetX = null
    validFreqs.forEach(({x, y}) => {
        if (y > maxY) {
            maxY = y;
            targetX = x;
        }
    });
    if (!targetX) throw new Error(`No peak with a highest Y value found.`);
    return hzToBreathsPerMinute(targetX);
}

// convert Hz to breaths per minute and round to 1 decimal place
// exported for testing
export function hzToBreathsPerMinute(hz) {
    return Math.round(((hz * 60) * 10) * (1 + Number.EPSILON)) / 10;
}

/**
 * Saves the data from the most recent emWave session to the app database.
 * @param {Number} stage The stage the data should be associated with
 * @returns Promise
 */
export function saveEmWaveSessionData(stage, audio) {
    return new Promise(resolve => setTimeout(async () => { // use setTimeout to give emWave a moment to save the session
        // if the session ended w/o emwave writing any data
        // (e.g., sensor wasn't attached at session start)
        // this may fetch a session that we have already stored,
        // generating unique constraint violation when we try to save
        // it again
        const s = (await window.mainAPI.extractEmWaveSessionData(-1, false))[0]
        if (s.durationSec > minSessionSeconds) {
            await window.mainAPI.saveEmWaveSessionData(s.sessionUuid, s.avgCoherence, s.pulseStartTime, s.validStatus, s.durationSec, stage, audio)
        }
        resolve()
    }, 1000) );
}

export function notifyOnDayChange(callbackFn) {
    const startDay = yyyymmddString(new Date());
    let dateCheckInterval;
    dateCheckInterval = setInterval(() => {
        const today = yyyymmddString(new Date());
        if (today != startDay) {
            // they've crossed into a new day
            // call the callback function
            callbackFn();
            clearInterval(dateCheckInterval);
        }
    }, 60000);
}