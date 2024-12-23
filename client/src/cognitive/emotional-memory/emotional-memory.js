import htmlButtonResponse from "@jspsych/plugin-html-button-response"
import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response"
import imageKeyboardResponse from "@jspsych/plugin-image-keyboard-response"

import img_scale from "./assets/scale.png"
const learningInstructions = (await import("./frag/instruction_learning.html?raw")).default
const ratingPrompt = `
<div>
    Please rate how positive, neutral, or negative you found the preceding picture. <br/>
    (1 = very negative to 9 = very positive, with 5 = neutral)
</div>
<div>
    <img class="emomem-scale" src="${img_scale}"/>
</div>
`
const ratingNagPrompt = `
<div>
    Please provide a rating (1 = very negative to 9 = very positive, with 5 = neutral).
</div>
<div>
    <img class="emomem-scale" src="${img_scale}"/>
</div>
`
const recallInstructions = (await import("./frag/instruction_recall.html?raw")).default
const recognitionInstructions = (await import("./frag/instruction_recognition.html?raw")).default
const recognitionPrompt = (await import("./frag/recognition_prompt.html?raw")).default

import memoryField from "../js/jspsych-memory-field.js";
import "jspsych/css/jspsych.css";
import "../css/common.css";
import "./style.css";

import img_5780 from "./assets/5780.jpg";
import img_Animals_219_h from "./assets/Animals_219_h.jpg";
import img_1463 from "./assets/1463.jpg";
import img_Landscapes_121_h from "./assets/Landscapes_121_h.jpg";
import img_2304 from "./assets/2304.jpg";
import img_1999 from "./assets/1999.jpg";
import img_Animals_095_h from "./assets/Animals_095_h.jpg";
import img_2216 from "./assets/2216.jpg";
import img_2360 from "./assets/2360.jpg"
import img_People_017_h from "./assets/People_017_h.jpg";
import img_1022 from "./assets/1022.jpg";
import img_2811 from "./assets/2811.jpg";
import img_People_139_h from "./assets/People_139_h.jpg";
import img_6560 from "./assets/6560.jpg";
import img_9429 from "./assets/9429.jpg";
import img_People_020_h from "./assets/People_020_h.jpg";
import img_1525 from "./assets/1525.jpg";
import img_6520 from "./assets/6520.jpg"
import img_1441 from "./assets/1441.jpg";
import img_2311 from "./assets/2311.jpg";
import img_Landscapes_154_h from "./assets/Landscapes_154_h.jpg";
import img_5830 from "./assets/5830.jpg";
import img_Landscapes_054_h from "./assets/Landscapes_054_h.jpg";
import img_Animals_166_v from "./assets/Animals_166_v.jpg";
import img_8497 from "./assets/8497.jpg";
import img_4700 from "./assets/4700.jpg";
import img_7502 from "./assets/7502.jpg"
import img_1321 from "./assets/1321.jpg";
import img_1932 from "./assets/1932.jpg";
import img_5973 from "./assets/5973.jpg";
import img_8475 from "./assets/8475.jpg";
import img_People_023_h from "./assets/People_023_h.jpg";
import img_8485 from "./assets/8485.jpg";
import img_Animals_007_h from "./assets/Animals_007_h.jpg";
import img_9921 from "./assets/9921.jpg";
import img_Faces_272_h from "./assets/Faces_272_h.jpg"

export class EmotionalMemory {
    constructor(jsPsych, setNum) {
        this.jsPsych = jsPsych
        if (Number.isInteger(setNum) && setNum >= 0 && setNum <= 3) {
            this.setNum = setNum
        } else {
            throw new Error("setNum must be  0, 1, 2 or 3.")
        }
    }

    getTimeline() {
        if (this.setNum == 0 || this.setNum == 2) return this.getLearningTimeline()
        return this.getMemoryTestsTimeline()
    }

    getLearningTimeline() {
        const preOrPost = (this.setNum == 0 || this.setNum == 1) ? 'pre' : 'post' // shouldn't be called with setNum == 1, but if we are it's pre
        const amuseImages = this.jsPsych.randomization
            .sampleWithoutReplacement(EmotionalMemory.images[preOrPost].amuse, 4)
            .map(i => ({imgType: 'AmC', stimulus: i}))
        const fearImages = this.jsPsych.randomization
            .sampleWithoutReplacement(EmotionalMemory.images[preOrPost].fear, 4)
            .map(i => ({imgType: 'F', stimulus: i}))
        const images = [...amuseImages, ...fearImages]
        return [
            {
                type: htmlKeyboardResponse,
                stimulus: learningInstructions,
                choices: [" "]
            },
            {
                timeline: [
                    {
                        type: imageKeyboardResponse,
                        stimulus: this.jsPsych.timelineVariable("stimulus"),
                        stimulus_height: 500,
                        choices: "NO_KEYS",
                        trial_duration: 3000,
                        data: {
                            imgType: this.jsPsych.timelineVariable("imgType")
                        }
                    },
                    {
                        type: htmlKeyboardResponse,
                        stimulus: ratingPrompt,
                        choices: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
                        trial_duration: 5000,
                        on_finish: (data) => {
                            if (data.response) {
                                const tlData = this.jsPsych.data.getLastTimelineData();
                                data.isRelevant = true
                                data.img = tlData.last(2).trials[0].stimulus
                                data.imgType = tlData.last(2).trials[0].imgType
                                
                            }
                        }
                    },
                    this.responseNagNode
                ],
                timeline_variables: images,
                randomize_order: true
            }
        ]
    }

    responseNagNode = {
        timeline: [
            {
                type: htmlKeyboardResponse,
                stimulus: ratingNagPrompt,
                choices: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
                on_start: async function() {
                    await window.mainAPI.beep()
                },
                on_finish: (data) => {
                    if (data.response) {
                        const expData = this.jsPsych.data.get()
                        const stimData = expData.trials.filter(ed => ed.trial_type == 'image-keyboard-response')
                        data.isRelevant = true
                        data.img = stimData[stimData.length - 1].stimulus
                        data.imgType = stimData[stimData.length - 1].imgType
                    }
                }
            }
        ],
        conditional_function: () => {
            const data = this.jsPsych.data.getLastTimelineData();
            const values = data.last(1).values()[0];
            return values.response === null;
        }
    }

    getMemoryTestsTimeline() {
        return [
            {
                type: memoryField,
                stimulus: recallInstructions,
                button_label: "I can't remember any more pictures",
                data: { isRelevant: true },
                trial_duration: 3 * 60 * 1000
            },
            this.recognitionNode()
        ]
    }

    get taskName() {
        const name = "emotional-memory"
        if (this.setNum === 0) {
            return name + "-learning";
        }
        return name + "-test";
    }

    recognitionNode() {
        const preOrPost = (this.setNum == 0 || this.setNum == 1) ? 'pre' : 'post' // shouldn't be called with setNum = 0, but if we are it's pre
        const amuseImages = [...EmotionalMemory.images[preOrPost].amuse].map(i => ({imgType: 'AmC', stimulus: i}))
        const fearImages = [...EmotionalMemory.images[preOrPost].fear].map(i => ({imgType: 'F', stimulus: i}))
        const images = [...amuseImages, ...fearImages]
        return {
            timeline: [
                {
                    type: htmlKeyboardResponse,
                    stimulus: recognitionInstructions,
                    choices: [" "]
                },
                {
                    timeline: [
                        {
                            type: imageKeyboardResponse,
                            stimulus: this.jsPsych.timelineVariable("stimulus"),
                            stimulus_height: 500,
                            choices: "NO_KEYS",
                            trial_duration: 3000,
                            data: {
                                imgType: this.jsPsych.timelineVariable("imgType")
                            }
                        },
                        {
                            type: htmlButtonResponse,
                            stimulus: recognitionPrompt,
                            choices: ["Remember", "Know", "New"],
                            on_finish: (data) => {
                                const tlData = this.jsPsych.data.getLastTimelineData();
                                data.isRelevant = true
                                data.img = tlData.last(2).trials[0].stimulus
                                data.imgType = tlData.last(2).trials[0].imgType
                                const answer = data.response == 0 ? 'remember' : data.response == 1 ? 'know' : 'new'
                                data.answer = answer
                            }
                        }
                    ],
                    timeline_variables: images,
                    randomize_order: true
                },
                
            ]
        }
    }

}

EmotionalMemory.images = {
    pre: {
        amuse: [
            img_5780,
            img_Animals_219_h,
            img_1463,
            img_Landscapes_121_h,
            img_2304,
            img_1999,
            img_Animals_095_h,
            img_2216,
            img_2360
        ],
        fear: [
            img_People_017_h,
            img_1022,
            img_2811,
            img_People_139_h,
            img_6560,
            img_9429,
            img_People_020_h,
            img_1525,
            img_6520
        ]
    },
    post: {
        amuse: [
            img_1441,
            img_2311,
            img_Landscapes_154_h,
            img_5830,
            img_Landscapes_054_h,
            img_Animals_166_v,
            img_8497,
            img_4700,
            img_7502
        ],
        fear: [
            img_1321,
            img_1932,
            img_5973,
            img_8475,
            img_People_023_h,
            img_8485,
            img_Animals_007_h,
            img_9921,
            img_Faces_272_h
        ]
    }
}
