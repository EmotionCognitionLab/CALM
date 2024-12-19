import htmlButtonResponse from "@jspsych/plugin-html-button-response"
import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response"
import imageKeyboardResponse from "@jspsych/plugin-image-keyboard-response"
import awsSettings from "../../../../common/aws-settings.json";

const learningInstructions = (await import("./frag/instruction_learning.html?raw")).default
const ratingPrompt = `
<div>
    Please rate how positive, neutral, or negative you found the preceding picture. <br/>
    (1 = very negative to 9 = very positive, with 5 = neutral)
</div>
<div>
    <img src="${awsSettings.ImagesUrl}/assets/emotional-memory/scale.png"/>
</div>
`
const ratingNagPrompt = (await import("./frag/rating_nag_prompt.html?raw")).default
const recallInstructions = (await import("./frag/instruction_recall.html?raw")).default
const recognitionInstructions = (await import("./frag/instruction_recognition.html?raw")).default
const recognitionPrompt = (await import("./frag/recognition_prompt.html?raw")).default

import memoryField from "../js/jspsych-memory-field.js";
import "jspsych/css/jspsych.css";
import "../css/common.css";

export class EmotionalMemory {
    constructor(jsPsych, setNum) {
        this.jsPsych = jsPsych
        if (Number.isInteger(setNum) && (setNum == 0 || setNum == 1)) {
            this.setNum = setNum
        } else {
            throw new Error("setNum must be either 0 or 1.")
        }
    }

    getTimeline() {
        if (this.setNum == 0) return this.getLearningTimeline()
        return this.getMemoryTestsTimeline()
    }

    getLearningTimeline() {
        const amuseImages = this.jsPsych.randomization
            .sampleWithoutReplacement(EmotionalMemory.images.pre.amuse, 4)
            .map(i => ({imgType: 'AmC', stimulus: `${awsSettings.ImagesUrl}/assets/emotional-memory/${i}`}))
        const fearImages = this.jsPsych.randomization
            .sampleWithoutReplacement(EmotionalMemory.images.pre.fear, 4)
            .map(i => ({imgType: 'F', stimulus: `${awsSettings.ImagesUrl}/assets/emotional-memory/${i}`}))
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
        const preOrPost = this.setNum == 0 ? 'pre' : 'post'
        const amuseImages = [...EmotionalMemory.images[preOrPost].amuse].map(i => ({imgType: 'AmC', stimulus: `${awsSettings.ImagesUrl}/assets/emotional-memory/${i}`}))
        const fearImages = [...EmotionalMemory.images[preOrPost].fear].map(i => ({imgType: 'F', stimulus: `${awsSettings.ImagesUrl}/assets/emotional-memory/${i}`}))
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
            "5780.jpg",
            "Animals_219_h.jpg",
            "1463.jpg",
            "Landscapes_121_h.jpg",
            "2304.jpg",
            "1999.jpg",
            "Animals_095_h.jpg",
            "2216.jpg",
            "2360.jpg"
        ],
        fear: [
            "People_017_h.jpg",
            "1022.jpg",
            "2811.jpg",
            "People_139_h.jpg",
            "6560.JPG",
            "9429.jpg",
            "People_020_h.jpg",
            "1525.jpg",
            "6520.jpg"
        ]
    },
    post: {
        amuse: [
            "1441.jpg",
            "2311.jpg",
            "Landscapes_154_h.jpg",
            "5830.jpg",
            "Landscapes_054_h.jpg",
            "Animals_166_v.jpg",
            "8497.jpg",
            "4700.jpg",
            "7502.jpg"
        ],
        fear: [
            "1321.jpg",
            "1932.jpg",
            "6313.jpg",
            "8475.jpg",
            "People_023_h.jpg",
            "8485.jpg",
            "Animals_007_h.jpg",
            "9921.jpg",
            "Faces_272_h.jpg"
        ]
    }
}
