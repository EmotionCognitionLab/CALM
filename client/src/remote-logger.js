/**
 * 
 * Provides remote logging to CloudWatch via a Lambda function.
 * 
 * There are two ways to use it:
 * override=true (default) and override=false .
 * 
 * In the first, it will override console.log, .info, .warn and
 * .error. All calls to those methods will be cause logging events
 * to be sent to CloudWatch, as well as logged to process.stdout 
 * (for .log, .info and .warn) or process.stderr (for .error).
 * 
 * In the second, console.log, .info, .warn and .error are NOT
 * overridden and no console logging will cause log events to
 * be sent to CloudWatch. 
 * 
 * In you don't override the console methods, use it like this:
 *   const l = new Logger(false);
 *   l.log("This is a log message");
 *   l.error("This is an error message");
 * 
 * Calls to Logger's own .log, .info, .warn and .error
 * methods will always be sent to CloudWatch and logged
 * to process.stdout or stderr.
 * 
 * The log stream name will always be YYYY-MM-DD. The log group name
 * and other aws settings details are found in aws-settings.json.
 * 
 * Logs are written to the cloud every pushFrequency ms (defaults to 10000).
 * 
 */

import awsSettings from '../../common/aws-settings.json';
import { sprintf } from 'sprintf-js';

class Logger {
    /**
     * Creates and initializes Logger instance.
     * @param {*} override true to override console.log, .info, .warn and .error, false to leave them alone.
     */
    constructor(override=true, user="unknown") {
        this.origConsole = {};
        this.override = override;
        this.user = user;
        
        this.logEntries = [];
        this.pushFrequency = 10000; // push new log entries to cloudwatch every 10s
        this.init();
    }

    storeLogMsg(origLogFn, level, ...args) {
        if (args.length === 0) return;
        let msg
        if (typeof args[0] !== "string" && args.length === 1) {
            if (typeof args[0] == "error") {
                msg = sprintf("%s\n%s", args[0].message, args[0].stack)
            } else {
                msg = sprintf("%j", args[0])
            }
        } else {
            msg = sprintf(args[0], ...args.slice(1), "\n");
        }
        
        this.logEntries.push({message: JSON.stringify({message: msg, level: level, user: this.user}), timestamp: Date.now()});

        origLogFn.apply(this, args);
    }

    buildLogFn(origLogFn, level)  {
        this[level] = (...args) => this.storeLogMsg(origLogFn, level, ...args); // creates this.log, this.info, etc.
        return this[level];
    }

    init() {
        const levels = ["log", "info", "warn", "error"];
        levels.forEach(level => {
            const origFn = console[level].bind(console);
            this.origConsole[level] = origFn;
            const newFn = this.buildLogFn(origFn, level); // creates this.log, this.info, etc.
            if (typeof(console) !== "undefined" && this.override) {
                console[level] = newFn;
            }
        });
        // If we've overridden anywhere (this class isn't a singleton), then flag it
        if (this.override) {
            console.overridden = true;
        }
        
        // This timer writes logs to CloudWatch periodically (via Lambda).
        const loggingInterval = setInterval(async () => {
            const unsent = this.logEntries.splice(0);
            
            if (unsent.length) {
                try {
                    const init = {
                        method: "POST",
                        mode: "cors",
                        cache: "no-cache",
                        headers: {
                            "Content-type": "application/json",
                        },
                    };
                    init.body = JSON.stringify(unsent);
                    const url = `${awsSettings.LogApiUrl}`;
                    const response = await fetch(url, init);
                     if (!response.ok) {
                        // just put the unsent logs back and try again on the next invocation
                        this.logEntries = unsent.concat(this.logEntries);
                     }
                } catch (err) {
                    this.logEntries = unsent.concat(this.logEntries); // they weren't sent, put them back
                    this.origConsole.error.call(this, "Error sending logs to remote logger:", err); 
                }
                
            }
        }, this.pushFrequency || 10000);
        // if this is running in a node process we don't want this logging
        // interval to keep the process running forever. Calling unref()
        // will ensure it doesn't.
        // https://nodejs.org/api/timers.html#timers_timeout_unref
        if (loggingInterval.unref) loggingInterval.unref();
    }
}

export default Logger;
