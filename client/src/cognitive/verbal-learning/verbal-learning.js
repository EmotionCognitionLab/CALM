import preload from "@jspsych/plugin-preload";
import htmlButtonResponse from "@jspsych/plugin-html-button-response";
import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response";
import audioKeyboardResponse from "@jspsych/plugin-audio-keyboard-response";
import memoryField from "../js/jspsych-memory-field.js";
import "jspsych/css/jspsych.css";
import "../css/jspsych-memory-field.css";
import "../css/common.css";
import "./style.css";
import awsSettings from '../../../../common/aws-settings.json';
// audio stimuli
const post_a_audio = `${awsSettings.ImagesUrl}/assets/verbal-learning/post-a.mp3`;
const pre_a_audio =  `${awsSettings.ImagesUrl}/assets/verbal-learning/pre-a.mp3`;
const check_audio =  `${awsSettings.ImagesUrl}/assets/verbal-learning/check.mp3`;
// instruction fragments
const instruction_check_start_html = (await import("./frag/instruction_check_start.html?raw")).default;
const instruction_check_loop_html = (await import("./frag/instruction_check_loop.html?raw")).default;
const instruction_a_immediate_html = (await import("./frag/instruction_a_immediate.html?raw")).default;
const instruction_a_immediate_rep_html = (await import("./frag/instruction_a_immediate_rep.html?raw")).default;
// presentation fragments
const presentation_cue_html = (await import("./frag/presentation_cue.html?raw")).default;
const presentation_prompt_html = (await import("./frag/presentation_prompt.html?raw")).default;
// recall fragments
const remember_a_immediate_html = (await import("./frag/remember_a_immediate.html?raw")).default;
const remember_a_immediate_rep_html = (await import("./frag/remember_a_immediate_rep.html?raw")).default;

export class VerbalLearning {
    constructor(jsPsych, setNum) {
        this.jsPsych = jsPsych;
        // validate setNum
        if (Number.isInteger(setNum) && 1 <= setNum && setNum < 13) {
            this.setNum = setNum;
        } else {
            throw new Error("setNum must be an integer in [1, 13)");
        }
    }

    getTimeline() {
        const pre = this.setNum < 7;
        const a_audio = pre ? pre_a_audio : post_a_audio;
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
        ];
    }

    get taskName() {
        return this.constructor.taskName;
    }
}

VerbalLearning.taskName = "verbal-learning-learning";

VerbalLearning.preload = {
    type: preload,
    audio: [
        pre_a_audio,
        post_a_audio,
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

