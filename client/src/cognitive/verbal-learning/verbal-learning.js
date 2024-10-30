import callFunction from "@jspsych/plugin-call-function";
import preload from "@jspsych/plugin-preload";
import htmlButtonResponse from "@jspsych/plugin-html-button-response";
import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response";
import audioKeyboardResponse from "@jspsych/plugin-audio-keyboard-response";
import memoryField from "../js/jspsych-memory-field.js";
import countdown from "../js/jspsych-countdown.js";
import "jspsych/css/jspsych.css";
import "../css/jspsych-memory-field.css";
import "../css/common.css";
import "./style.css";
// audio stimuli
const pre_a_audio = "/src/cognitive/verbal-learning/pre-a.mp3";
const pre_b_audio = "/src/cognitive/verbal-learning/pre-b.mp3";
const post_a_audio = "/src/cognitive/verbal-learning/post-a.mp3";
const post_b_audio = "/src/cognitive/verbal-learning/post-b.mp3";
const check_audio = "/src/cognitive/verbal-learning/check.mp3";
// instruction fragments
const instruction_check_start_html = (await import("./frag/instruction_check_start.html?raw")).default;
const instruction_check_loop_html = (await import("./frag/instruction_check_loop.html?raw")).default;
const instruction_a_immediate_html = (await import("./frag/instruction_a_immediate.html?raw")).default;
const instruction_a_immediate_rep_html = (await import("./frag/instruction_a_immediate_rep.html?raw")).default;
const instruction_b_immediate_html = (await import("./frag/instruction_b_immediate.html?raw")).default;
const instruction_a_short_html = (await import("./frag/instruction_a_short.html?raw")).default;
const instruction_a_long_html = (await import("./frag/instruction_a_long.html?raw")).default;
// presentation fragments
const presentation_cue_html = (await import("./frag/presentation_cue.html?raw")).default;
const presentation_prompt_html = (await import("./frag/presentation_prompt.html?raw")).default;
// recall fragments
const remember_a_immediate_html = (await import("./frag/remember_a_immediate.html?raw")).default;
const remember_a_immediate_rep_html = (await import("./frag/remember_a_immediate_rep.html?raw")).default;
const remember_b_immediate_html = (await import("./frag/remember_b_immediate.html?raw")).default;
const remember_a_short_html = (await import("./frag/remember_a_short.html?raw")).default;
const remember_a_long_html = (await import("./frag/remember_a_long.html?raw")).default;
// pre-intervention cued recall fragments
const remember_a_cue_furniture_html = (await import("./frag/remember_a_cue_furniture.html?raw")).default;
const remember_a_cue_vegetable_html = (await import("./frag/remember_a_cue_vegetable.html?raw")).default;
const remember_a_cue_traveling_html = (await import("./frag/remember_a_cue_traveling.html?raw")).default;
const remember_a_cue_animal_html = (await import("./frag/remember_a_cue_animal.html?raw")).default;
// post-intervention cued recall fragments
const remember_a_cue_tool_html = (await import("./frag/remember_a_cue_tool.html?raw")).default;
const remember_a_cue_fruit_html = (await import("./frag/remember_a_cue_fruit.html?raw")).default;
const remember_a_cue_insect_html = (await import("./frag/remember_a_cue_insect.html?raw")).default;
const remember_a_cue_clothing_html = (await import("./frag/remember_a_cue_clothing.html?raw")).default;

export class VerbalLearning {
    constructor(jsPsych, setNum, segmentNum, getLastSegmentEndTime = null) {
        this.jsPsych = jsPsych;
        // validate setNum
        if (Number.isInteger(setNum) && 1 <= setNum && setNum < 13) {
            this.setNum = setNum;
        } else {
            throw new Error("setNum must be an integer in [1, 13)");
        }
        // validate segmentNum and compute startTime
        if (!Number.isInteger(segmentNum) || segmentNum < 1 || segmentNum > 2) {
            throw new Error("segmentNum must be an integer in 1..2");
        } else if (segmentNum === 1 && getLastSegmentEndTime !== null) {
            throw new Error("getLastSegmentEndTime must be null if segmentNum is 1");
        } else if (segmentNum === 2 && getLastSegmentEndTime === null) {
            throw new Error("getLastSegmentEndTime must not be null if segmentNum is 2");
        }
        this.segmentNum = segmentNum;
        this.getLastSegmentEndTime = getLastSegmentEndTime !== null ? getLastSegmentEndTime : () => 0;
    }

    getTimeline() {
        const glset = this.getLastSegmentEndTime.bind(this);
        const duration = () => {
            const data = this.jsPsych.data.get().last(1).values()[0];
            return data.value.duration;
        };
        const conditional = () => {
            const data = this.jsPsych.data.get().last(1).values()[0];
            return data.value.duration > 0;
        };
        const segmentCountdownNode = {
            timeline: [{
                type: callFunction,
                async: true,
                func: async function(done) {
                    const lastSegEndTime = await glset();
                    const dur = (lastSegEndTime + (20 * 60 * 1000))  - Date.now();  // 20 minutes
                    done({duration: dur});
                }
            },
            {
                timeline: [{
                    type: countdown,
                    duration: duration.bind(this)
                }],
                conditional_function: conditional.bind(this)
            }]
        };
        const pre = this.setNum < 7;
        const a_audio = pre ? pre_a_audio : post_a_audio;
        const b_audio = pre ? pre_b_audio : post_b_audio;
        const remember_a_cue_w_html = pre ? remember_a_cue_furniture_html : remember_a_cue_tool_html;
        const remember_a_cue_x_html = pre ? remember_a_cue_vegetable_html : remember_a_cue_fruit_html;
        const remember_a_cue_y_html = pre ? remember_a_cue_traveling_html : remember_a_cue_insect_html;
        const remember_a_cue_z_html = pre ? remember_a_cue_animal_html : remember_a_cue_clothing_html;
        if (this.segmentNum === 1) {
            return [
                this.constructor.preload,
                this.constructor.instruction(instruction_check_start_html),
                this.constructor.audio_check_loop,
                this.constructor.instruction(instruction_a_immediate_html),  // 1
                ...this.constructor.cue_and_presentation(a_audio),
                this.constructor.remember(remember_a_immediate_html),
                this.constructor.instruction(instruction_a_immediate_rep_html),  // 2
                ...this.constructor.cue_and_presentation(a_audio),
                this.constructor.remember(remember_a_immediate_rep_html),
                this.constructor.instruction(instruction_a_immediate_rep_html),  // 3
                ...this.constructor.cue_and_presentation(a_audio),
                this.constructor.remember(remember_a_immediate_rep_html),
                this.constructor.instruction(instruction_a_immediate_rep_html),  // 4
                ...this.constructor.cue_and_presentation(a_audio),
                this.constructor.remember(remember_a_immediate_rep_html),
                this.constructor.instruction(instruction_a_immediate_rep_html),  // 5
                ...this.constructor.cue_and_presentation(a_audio),
                this.constructor.remember(remember_a_immediate_rep_html),
                this.constructor.instruction(instruction_b_immediate_html),
                ...this.constructor.cue_and_presentation(b_audio),
                this.constructor.remember(remember_b_immediate_html),
                this.constructor.instruction(instruction_a_short_html),
                this.constructor.remember(remember_a_short_html),
                this.constructor.remember(remember_a_cue_w_html),
                this.constructor.remember(remember_a_cue_x_html),
                this.constructor.remember(remember_a_cue_y_html),
                this.constructor.remember(remember_a_cue_z_html),
            ];
        } else if (this.segmentNum === 2) {
            return [
                segmentCountdownNode,
                this.constructor.instruction(instruction_a_long_html),
                this.constructor.remember(remember_a_long_html),
                this.constructor.remember(remember_a_cue_w_html),
                this.constructor.remember(remember_a_cue_x_html),
                this.constructor.remember(remember_a_cue_y_html),
                this.constructor.remember(remember_a_cue_z_html),
            ];
        } else {
            throw new Error("segmentNum must be in 1..2");
        }
    }

    get taskName() {
        if (this.segmentNum === 1) {
            return this.constructor.taskName + "-learning";
        }
        return this.constructor.taskName + "-recall";
    }
}

VerbalLearning.taskName = "verbal-learning";

VerbalLearning.preload = {
    type: preload,
    audio: [
        pre_a_audio,
        pre_b_audio,
        post_a_audio,
        post_b_audio,
        check_audio,
    ],
};

VerbalLearning.instruction = stimulus => ({
    type: htmlKeyboardResponse,
    stimulus: stimulus,
    choices: [" "],
});

VerbalLearning.cue = duration => ({
    type: htmlKeyboardResponse,
    stimulus: presentation_cue_html,
    choices: "NO_KEYS",
    trial_duration: duration,
});
VerbalLearning.presentation = audio_stimulus => ({
    type: audioKeyboardResponse,
    stimulus: audio_stimulus,
    prompt: presentation_prompt_html,
    choices: "NO_KEYS",
    trial_ends_after_audio: true,
});
VerbalLearning.cue_and_presentation = (audio_stimulus, duration = 2000) => [
    VerbalLearning.cue(duration),
    VerbalLearning.presentation(audio_stimulus),
];

VerbalLearning.audio_check_loop = {
    timeline: [
        ...VerbalLearning.cue_and_presentation(check_audio, 500),
        {
            type: htmlButtonResponse,
            stimulus: instruction_check_loop_html,
            choices: ["Try Again", "Sound Worked Fine"],
        },
    ],
    loop_function: data => {
        const [buttonData] = data.filter({trial_type: "html-button-response"}).values().slice(-1);
        return buttonData.response === 0;
    }
};

VerbalLearning.remember = stimulus => ({
    type: memoryField,
    stimulus: stimulus,
    button_label: "Stop",
    confirm_text: "Click OK if you've thought of all the words you can. Click cancel if you can remember more.",
    data: { isRelevant: true },
});

