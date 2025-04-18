import { ParameterType } from "jspsych";

class SpatialOrientationPlugin {
    constructor(jsPsych) {
        this.jsPsych = jsPsych;
    }

    buildIcirc = (canvas, options) => {
        const ctx = canvas.getContext("2d");
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const pointerAngleFromMouseEvent = e => {
            // get window coordinates on canvas
            const rect = canvas.getBoundingClientRect();
            const [wX, wY] = [e.clientX - rect.left, e.clientY - rect.top];
            // get vector coordinates relative to origin at center
            const [x, y] = [wX - centerX, centerY - wY];
            // get angle from positive vertical
            return SpatialOrientationPlugin.angleABC([0, options.radius], [0, 0], [x, y]);
        };
        const drawTarget = () => {
            ctx.setLineDash([]);
            ctx.strokeStyle = "rgba(255, 0, 0, 1)";
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + options.radius * Math.cos(options.targetRadians + Math.PI/2),
                centerY - options.radius * Math.sin(options.targetRadians + Math.PI/2)
            );
            ctx.stroke();
        };
        const drawIcirc = (pointerAngle) => {
            window.requestAnimationFrame(() => {
                // clear
                ctx.strokeStyle = "rgba(0, 0, 0, 1)";
                ctx.fillStyle = "rgba(244, 244, 216, 1)";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "rgba(0, 0, 0, 1)";
                ctx.font = "16px sans-serif";
                ctx.textAlign = "center";
                // draw circle
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(centerX, centerY, options.radius, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.fillText(options.centerText, centerX, centerY + 20);
                // draw arrow to top
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(centerX, centerY - options.radius);
                ctx.stroke();
                ctx.fillText(options.topText, centerX, centerY - options.radius - 20);
                // draw target pointer if example
                if (options.mode === "example") {
                    drawTarget();
                    ctx.strokeStyle = "rgba(0, 0, 0, 1)";
                }
                // draw input pointer
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(
                    centerX + options.radius * Math.cos(pointerAngle + Math.PI/2),
                    centerY - options.radius * Math.sin(pointerAngle + Math.PI/2)
                );
                ctx.stroke();
                ctx.fillText(
                    options.pointerText,
                    centerX + (options.radius+40) * Math.cos(pointerAngle + Math.PI/2),
                    centerY - (options.radius+40) * Math.sin(pointerAngle + Math.PI/2)
                );
            });
        };
        let running = true;
        canvas.addEventListener("mousemove", e => {
            if (running) {
                drawIcirc(pointerAngleFromMouseEvent(e));
            }
        });
        canvas.addEventListener("click", e => {
            if (running) {
                running = false;
                // build completionData
                const responseRadians = pointerAngleFromMouseEvent(e);
                const signedRadianDistance = SpatialOrientationPlugin.signedRadianDistance(
                    options.targetRadians,
                    responseRadians,
                );
                const completionData = {
                    completionReason: "responded",
                    responseRadians,
                    signedRadianDistance,
                };
                // draw target pointer if practice
                if (options.mode === "practice") {
                    drawTarget();
                }
                // call onCompletion
                options.onCompletion(completionData);
            }
        });
        if (options.timeLimit !== null) {
            setTimeout(() => {
                if (running) {
                    running = false;
                    // build completionData
                    const completionData = {
                        completionReason: "timedout",
                    };
                    // call onCompletion
                    options.onCompletion(completionData);
                }
            }, options.timeLimit);
        }
        drawIcirc(0);
    };

    trial = (displayElement, trial) => {
        // validate parameters
        if (!["example", "practice", "test"].includes(trial.mode)) {
            throw new Error("invalid mode");
        } else if (trial.endTime !== null && typeof trial.endTime !== "number") {
            throw new Error("endTime must be null or a number representing ms since epoch");
        }
        // compute timeLimit (duration) from trial.endTime (instant)
        const timeLimit = trial.endTime === null ? null : trial.endTime - Date.now();
        // build trial params data
        const paramsData = {
            center: trial.centerText,
            facing: trial.topText,
            target: trial.pointerText,
            mode: trial.mode,
            targetRadians: trial.targetRadians,
            timeLimit: timeLimit,
        };
        // skip trial if timeLimit 
        if (trial.endTime !== null && timeLimit <= 0) {
            const data = {
                ...paramsData,
                completionReason: "skipped",
            };
            this.jsPsych.finishTrial(data);
        } else {
            // build and show display HTML
            {
                let html = "";
                html += `<div id="jspsych-spatial-orientation-instruction">`;
                html +=     trial.instruction;
                html += `</div>`;
                html += `<div id="jspsych-spatial-orientation-wrapper">`;
                html +=     `<div id="jspsych-spatial-orientation-scene">${trial.scene}</div>`;
                html +=     `<canvas id="jspsych-spatial-orientation-icirc" width="500" height="500"></canvas>`;
                html += `</div>`;
                displayElement.innerHTML = html;
            }
            const icirc = document.getElementById("jspsych-spatial-orientation-icirc");
            // check canvas support
            if (!icirc.getContext) { return; }
            const start = performance.now();
            this.buildIcirc(icirc, {
                radius: 150,
                centerText: trial.centerText,
                topText: trial.topText,
                pointerText: trial.pointerText,
                targetRadians: trial.targetRadians,
                mode: trial.mode,
                timeLimit: timeLimit,
                onCompletion: completionData => {
                    // build data
                    const rt = performance.now() - start;
                    const data = {
                        ...completionData,
                        ...paramsData,
                        rt: rt,
                    };
                    // finish trial
                    setTimeout(() => { this.jsPsych.finishTrial(data); }, trial.lingerDuration);
                },
            });
        }
    };
}

const info = {
    name: "spatial-orientation",
    version: "1.0.0",
    description: "responseRadians is the counterclockwise angle from the positive vertical. At the top, the angle starts at 0 and increases counterclockwise (on the left side of the circle) until it reaches +pi at the bottom. From the bottom, the angle wraps around to -pi and increases (on the right side of the circle) so that it reaches 0 again at the top.",
    parameters: {
        scene: {
            type: ParameterType.HTML_STRING,
            default: undefined,
        },
        centerText: {
            type: ParameterType.STRING,
            default: undefined,
        },
        topText: {
            type: ParameterType.STRING,
            default: undefined,
        },
        pointerText: {
            type: ParameterType.STRING,
            default: undefined,
        },
        targetRadians: {
            type: ParameterType.FLOAT,
            default: undefined,
        },
        mode: {
            type: ParameterType.STRING,
            default: undefined,
        },
        instruction: {
            type: ParameterType.HTML_STRING,
            default: "",
        },
        lingerDuration: {
            type: ParameterType.INT,
            default: 1000,
        },
        endTime: {
            type: ParameterType.INT,
            default: null,
        },
    },
    data: {
        rt: {
            type: ParameterType.INT
        },
        center: {
            type: ParameterType.STRING
        },
        facing: {
            type: ParameterType.STRING
        },
        target: {
            type: ParameterType.STRING
        },
        mode: {
            type: ParameterType.STRING
        },
        radians: {
            type: ParameterType.FLOAT
        },
        timeLimit: {
            type: ParameterType.INT
        },
        completionReason: {
            type: ParameterType.STRING
        },
        responseRadians: {
            type: ParameterType.FLOAT
        },
        signedRadianDistance: {
            type: ParameterType.FLOAT
        }
    }
};

SpatialOrientationPlugin.info = info;

const angleABC = ([aX, aY], [bX, bY], [cX, cY]) => {
    // angle from vectors BA to BC
    const [baX, baY] = [aX - bX, aY - bY];
    const [bcX, bcY] = [cX - bX, cY - bY];
    const baNorm = Math.sqrt(baX*baX + baY*baY);
    const dx = (bcX*baX + bcY*baY) / baNorm;  // scalar projection of BC onto BA
    const dy = (bcY*baX - bcX*baY) / baNorm;  // scalar rejection of BC onto BA
    return Math.atan2(dy, dx);
};

SpatialOrientationPlugin.angleABC = angleABC;

const signedRadianDistance = (a, b) => {
    const diff = a - b;
    return Math.atan2(Math.sin(diff), Math.cos(diff));
};

SpatialOrientationPlugin.signedRadianDistance = signedRadianDistance;

export default SpatialOrientationPlugin;
