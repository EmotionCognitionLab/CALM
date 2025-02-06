import payboardTempl from "./payboard.handlebars";
import { earningsTypes } from "../types/types.js";

export class Payboard {
    constructor(rootDiv, errorDiv, client, userId, admin = false) {
        this.rootDiv = rootDiv;
        this.errorDiv = errorDiv;
        this.client = client;
        this.userId = userId;
        this.admin = admin;
    }

    async init() {
        await this.refresh();
        // set class of root div
        this.rootDiv.classList.add("pay-info");
    }

    async refresh() {
        try {
            // get data
            let earnings;
            if (this.admin) {
                earnings = await this.client.getEarningsForUser(this.userId);
            } else {
                earnings = await this.client.getEarningsForSelf();
            }
            const data = {};
            let overallTotal = 0;

            for (let i=0; i<earnings.length; i++) {
                const curEarn = earnings[i];
                overallTotal += curEarn.amount;
                const ymdDate = curEarn.date.substring(0, 10);
                const dayData = data[ymdDate] || {};
                const earnType = curEarn.type;
                if (earnType === earningsTypes.VISIT_1 || earnType === earningsTypes.VISIT_2) {
                    dayData['visits'] = (dayData['visits'] || 0) + curEarn.amount;
                } else if (earnType == earningsTypes.LUMOSITY) {
                    dayData['lumosity'] = (dayData['lumosity'] || 0) + curEarn.amount;
                } else if (earnType === earningsTypes.PER_HOUR) {
                    dayData['sessions'] = (dayData['sessions'] || 0) + curEarn.amount;
                } else if (earnType === earningsTypes.BONUS) {
                    dayData['bonuses'] = (dayData['bonuses'] || 0) + curEarn.amount;
                }
                const total = Object.keys(dayData).filter(k => k !== 'total').reduce((sum, key) => sum + dayData[key], 0);
                dayData['total'] = total;
                data[ymdDate] = dayData;
            }
            const templateData = Object.entries(data).map(([k, v]) => {
                const dateParts = k.split('-');
                v['day'] = `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`; // convert YYYY-MM-DD to MM/DD/YYYY
                v['visits'] = Math.round(v['visits'] * 100) / 100;
                v['lumosity'] = Math.round(v['lumosity'] * 100) / 100;
                v['sessions'] = Math.round(v['sessions'] * 100) / 100;
                v['bonuses'] = Math.round(v['bonuses'] * 100) / 100;
                v['total'] = Math.round(v['total'] * 100) / 100;
                return v
            });
            overallTotal = Math.round(overallTotal * 100) / 100;

            this.rootDiv.innerHTML = payboardTempl({'earnings': templateData, 'overallTotal': overallTotal});
        } catch (err) {
            this.handleError(err);
        }
    }

    handleError(err) {
        console.error(`error: ${err}`);
        this.errorDiv.textContent = `error: ${err.message ?? err}`;
    }
}
