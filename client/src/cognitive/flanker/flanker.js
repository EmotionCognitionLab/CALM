import preload from "@jspsych/plugin-preload";
import htmlKeyboardResponse from '@jspsych/plugin-html-keyboard-response';
import "jspsych/css/jspsych.css";
import "../css/common.css";
import "./style.css";
import arrow_img from "./arrow.png"
const instruction1_html = (await import("./frag/instruction-1.html?raw")).default.replaceAll("/src/cognitive/flanker/arrow.png", arrow_img);
const instruction2_html = (await import("./frag/instruction-2.html?raw")).default.replaceAll("/src/cognitive/flanker/arrow.png", arrow_img);
const instruction3_html = (await import("./frag/instruction-3.html?raw")).default.replaceAll("/src/cognitive/flanker/arrow.png", arrow_img);
const instruction4_html = (await import("./frag/instruction-4.html?raw")).default.replaceAll("/src/cognitive/flanker/arrow.png", arrow_img);
const instruction5_html = (await import("./frag/instruction-5.html?raw")).default.replaceAll("/src/cognitive/flanker/arrow.png", arrow_img);
const instruction6_html = (await import("./frag/instruction-6.html?raw")).default.replaceAll("/src/cognitive/flanker/arrow.png", arrow_img);
const comprehension1_html = (await import("./frag/comprehension-1.html?raw")).default.replaceAll("/src/cognitive/flanker/arrow.png", arrow_img);
const comprehension2_html = (await import("./frag/comprehension-2.html?raw")).default.replaceAll("/src/cognitive/flanker/arrow.png", arrow_img);
const comprehension3_html = (await import("./frag/comprehension-3.html?raw")).default.replaceAll("/src/cognitive/flanker/arrow.png", arrow_img);
const instruction1alt_html = (await import("./frag/instruction-1-alt.html?raw")).default.replaceAll("/src/cognitive/flanker/arrow.png", arrow_img);



export class Flanker {
    constructor(jsPsych, setNum) {
        this.jsPsych = jsPsych;
        this.setNum = setNum;
        this.currentResponseTimeLimitMs = this.constructor.defaultResponseTimeLimitMs;
    }

    getTimeline() {
        if (this.setNum === 3 || this.setNum === 9) {
            return [
                this.constructor.preload,
                this.constructor.instruction1,
                this.constructor.instruction2,
                this.constructor.instruction3,
                this.constructor.instruction4,
                this.constructor.instruction5,
                this.trainingLoop(),
                this.constructor.instruction6,
                this.mainTrials(),
            ];
        } else {
            return [
                this.constructor.preload,
                this.constructor.instruction1alt,
                this.mainTrials(),
            ];
        }
        
    }

    responseTimeLimitMs() {
        const trialsPerBlock = this.constructor.mainStimuli.length;
        const allResults = this.jsPsych.data.get().filterCustom(data => data.arrows && !data.isTraining).values();
        if (allResults.length === 0 || allResults.length % trialsPerBlock !== 0) {
            // we're in the middle of a block (or at the start of the experiment)
            // changes to the response time limit are only made at the end of a block
            return this.currentResponseTimeLimitMs;
        }

        // ok, now see how we need to change the response time based on performance in the block
        let reductionMs;
        let increaseMs;
        const blockNum = allResults.length / trialsPerBlock;
        if (blockNum <= 6) {
            reductionMs = 90;
            increaseMs = 270;
        } else {
            reductionMs = 30;
            increaseMs = 90;
        }

        const blockResults = allResults.slice(allResults.length - trialsPerBlock);
        const correctResultsCount = blockResults.filter(r => r.correct).length;
        if (correctResultsCount >= 13) {
            this.currentResponseTimeLimitMs -= reductionMs;
        } else {
            this.currentResponseTimeLimitMs += increaseMs;
        }
        return this.currentResponseTimeLimitMs;
    }

    get taskName() {
        return this.constructor.taskName;
    }

    trial(isTraining) {
        const result = {
            type: htmlKeyboardResponse,
            stimulus: this.jsPsych.timelineVariable("stimulus"),
            choices: ["ArrowLeft", "ArrowRight"],
            data: { 
                correct_response: this.jsPsych.timelineVariable("correct_response"),
                arrows: this.jsPsych.timelineVariable("arrows"),
                set: this.setNum,
                congruent: this.jsPsych.timelineVariable("congruent"),
            },
            on_finish: (data) => {
                data.correct = this.jsPsych.pluginAPI.compareKeys(data.response, data.correct_response);
            },
            save_trial_parameters: {trial_duration: true},
            trial_duration: this.responseTimeLimitMs.bind(this),
        };

        if (isTraining) {
            result.data.isTraining = true;
        } else {
            result.data.isRelevant = true;
        }

        return result;
    }

    trainingTrials() {
        return {
            timeline: [this.constructor.fixation, this.trial(true), this.trainingFeedback],
            timeline_variables: this.constructor.timelineVarsForStimuli(this.constructor.trainingStimuli),
            randomize_order: true
        };
    }

    mainTrials() {
        return {
            timeline: [this.constructor.fixation, this.trial(false), this.mainFeedbackNode],
            timeline_variables: this.constructor.timelineVarsForStimuli(this.constructor.mainStimuli),
            repetitions: this.constructor.numMainBlocks,
            randomize_order: true
        };
    }
    
    trainingLoop() {
        return {
            timeline: [this.trainingTrials(), this.comprehensionNode],
            loop_function: function(data) {
                return data.filter({isTraining: true, correct: true}).values().length < 3;
            }
        };
    }

    comprehensionNode = {
        timeline: [Flanker.comprehension1, Flanker.comprehension2, Flanker.comprehension3],
        conditional_function: () => {
            return this.jsPsych.data.getLastTimelineData().filter({isTraining: true, correct: true}).values().length < 3;
        }
    }

    mainFeedbackNode = {
        timeline: [Flanker.mainFeedback],
        conditional_function: () => {
            const data = this.jsPsych.data.getLastTimelineData();
            const values = data.last(1).values()[0];
            return values.response === null;
        }
    }

    trainingFeedback = {
        type: htmlKeyboardResponse,
        stimulus: () => {
            const data = this.jsPsych.data.getLastTimelineData();
            const values = data.last(1).values()[0];
            if (values.response === null) {
                Flanker.toggleMissedBackgroundOn();
                return "";
            }
            if (values.correct) {
                return "Correct";
            }
            return "Incorrect";
        },
        choices: "NO_KEYS",
        trial_duration: 800,
        on_finish: Flanker.toggleMissedBackgroundOff,
    }
}

Flanker.taskName = "flanker";

Flanker.preload = {
    type: preload,
    images: [arrow_img]
};

Flanker.instruction1 = {
    type: htmlKeyboardResponse,
    stimulus: instruction1_html,
    choices: [" "]
};

Flanker.instruction2 = {
    type: htmlKeyboardResponse,
    stimulus: instruction2_html,
    choices: ["ArrowLeft"]
};

Flanker.instruction3 = {
    type: htmlKeyboardResponse,
    stimulus: instruction3_html,
    choices: ["ArrowRight"]
};

Flanker.instruction4 = {
    type: htmlKeyboardResponse,
    stimulus: instruction4_html,
    choices: ["ArrowRight"]
};

Flanker.instruction5 = {
    type: htmlKeyboardResponse,
    stimulus: instruction5_html,
    choices: [" "]
};

Flanker.instruction6 = {
    type: htmlKeyboardResponse,
    stimulus: instruction6_html,
    choices: [" "]
};

Flanker.instruction1alt = {
    type: htmlKeyboardResponse,
    stimulus: instruction1alt_html,
    choices: [" "]
};

Flanker.fixation = {
    type: htmlKeyboardResponse,
    stimulus: '<div style="font-size: 60px;">+</div>',
    trial_duration: function() {
        return Math.floor((Math.random() * 300) + 400);
    },
    choices: "NO_KEYS"
};

Flanker.stimulus = arrows => {
    const head = "<div class=\"arrows\">";
    const body = arrows.map(
        is_right => `<img class=${is_right ? "flanker-right" : "flanker-left"} src=${arrow_img}>`
    ).join("");
    const tail = "</div><div>Press the left arrow key or the right arrow key.</em></div>";
    return head + body + tail;
};

// changing the order of these stimuli will break the 
// "it does not show the comprehension screens if you get three or more of the training trials right" test
Flanker.trainingStimuli = [ [1, 1, 1, 1, 1], [1, 1, 0, 1, 1], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0] ];

Flanker.mainStimuli = [ [1, 1, 1, 1, 1], [1, 1, 0, 1, 1], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0],
                        [1, 1, 1, 1, 1], [1, 1, 0, 1, 1], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0],
                        [1, 1, 1, 1, 1], [1, 1, 0, 1, 1], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0],
                        [1, 1, 1, 1, 1], [1, 1, 0, 1, 1], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0] ];

Flanker.timelineVarsForStimuli = (stimuli) => {
    return stimuli.map(arrows => ( { 
        stimulus: Flanker.stimulus(arrows), 
        arrows: arrows, 
        correct_response: arrows[2] === 1 ? "arrowright": "arrowleft",
        congruent: arrows[2] === arrows[1]
    }));
};

Flanker.toggleMissedBackgroundOn = () => {
    document.body.classList.add("flanker-miss");
};

Flanker.toggleMissedBackgroundOff = () => {
    document.body.classList.remove("flanker-miss");
};

Flanker.mainFeedback = {
    type: htmlKeyboardResponse,
    stimulus: "",
    choices: "NO_KEYS",
    trial_duration: 800,
    on_start: Flanker.toggleMissedBackgroundOn,
    on_finish: Flanker.toggleMissedBackgroundOff,
};

Flanker.comprehension1 = {
    type: htmlKeyboardResponse,
    stimulus: comprehension1_html,
    choices: ["ArrowRight", "ArrowLeft"],
    data: { isComprehension: true }
};

Flanker.comprehension2 = {
    type: htmlKeyboardResponse,
    stimulus: comprehension2_html,
    choices: ["ArrowRight", "ArrowLeft"],
    data: { isComprehension: true }
};

Flanker.comprehension3 = {
    type: htmlKeyboardResponse,
    stimulus: comprehension3_html,
    choices: [" "],
    data: { isComprehension: true }
};

Flanker.numMainBlocks = 9;
Flanker.defaultResponseTimeLimitMs = 1050;
