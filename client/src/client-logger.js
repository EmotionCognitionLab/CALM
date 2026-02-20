/**
 * Provides client-side logging that forwards log messages from the renderer to the main process.
 * 
 * You can either choose to override console.log, .info, .warn and .error (default),
 * so that any calls to those methods are forwarded to the main process for remote logging,
 * or set override=false and use the Logger instance's own methods to log messages.
 * 
 * In either case, calls to Logger's own .log, .info, .warn and .error
 * methods will always be sent to the main process for remote logging.
 */

class Logger {
    /**
     * Creates and initializes Logger instance.
     * @param {*} override true to override console.log, .info, .warn and .error, false to leave them alone.
     */
    constructor(override=true) {
        if (!window || !window.mainAPI || !window.mainAPI.log) {
            throw new Error("Client logger can only be used in renderer process");
        }
        this.origConsole = {};
        this.override = override;
        this.init();      
    }

    logToMain(origLogFn, level, ...args) {
        for (let i=0; i < args.length; i++) {
            if (typeof args[i] !== "string" && (args[i].message || args[i].stack)) {
                args[i] = `${args[i].message} ${args[i].stack}`;
            }
        }
        window.mainAPI.log(level, ...args);
        origLogFn.apply(this, args);
    }

    buildLogFn(origLogFn, level)  {
        this[level] = (...args) => this.logToMain(origLogFn, level, ...args); // creates this.log, this.info, etc.
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
    }
}

export default Logger;
