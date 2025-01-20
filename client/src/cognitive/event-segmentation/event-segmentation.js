import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response";
import videoKeyboardResponse from "../js/jspsych-video-keyboard";
import surveyLikert from "@jspsych/plugin-survey-likert";
import "jspsych/css/jspsych.css";
import "../css/common.css";
import buildingBlocksMov from "./BuildingBlocks.mp4";

const welcome_html = (await import("./frag/welcome.html?raw")).default;
const visit2_html = (await import("./frag/visit2.html?raw")).default;


export class EventSegmentation {
    constructor(jsPsych, setNum) {
        this.jsPsych = jsPsych;
        this.setNum = setNum;
    }

    getTimeline() {
        if (this.setNum == 1) {
            // return pre-intervention timeline
            return [
                EventSegmentation.welcomeInstruction,
                EventSegmentation.videoTrial,
                EventSegmentation.difficultySurvey,
                EventSegmentation.familiaritySurvey
            ];

        } else {
            // return post-intervention timeline
            return [
                EventSegmentation.welcomeInstruction,
                EventSegmentation.visit2Instruction,
                EventSegmentation.videoTrial,
                EventSegmentation.memorySurvey,
                EventSegmentation.difficultySurvey,
                EventSegmentation.familiaritySurvey
            ]
        }
    }
}

EventSegmentation.taskName = "event-segmentation";

EventSegmentation.welcomeInstruction = {
    type: htmlKeyboardResponse,
    stimulus: welcome_html,
    choices: [" "]
};

EventSegmentation.visit2Instruction = {
    type: htmlKeyboardResponse,
    stimulus: visit2_html,
    choices: [" "]
}

EventSegmentation.videoTrial = {
    type: videoKeyboardResponse,
    stimulus: [buildingBlocksMov],
    autoplay: true,
    choices: [" "],
    trial_ends_after_video: true,
    response_ends_trial: false,
    data: { isRelevant: true }
}

EventSegmentation.difficultySurvey = {
    type: surveyLikert,
    questions: [
        {
            prompt: "How difficult was it for you to decide when to press the space bar?",
            labels: [
                "Very Easy",
                "1", "2", "3", "4", "5",
                "Very Difficult"
            ]
        }
    ],
    data: { isRelevant: true }
}

EventSegmentation.familiaritySurvey = {
    type: surveyLikert,
    questions: [
        {
            prompt: "How familiar are you with the activity in the previous video? ",
            labels: [
                "Not at all",
                "1", "2", "3", "4", "5",
                "Very Familiar"
            ]
        }
    ],
    data: { isRelevant: true }
}

EventSegmentation.memorySurvey = {
    type: surveyLikert,
    questions: [
        {
            prompt: "How well do you remember this video from campus visit 1? ",
            labels: [
                "Not at all",
                "1", "2", "3", "4", "5",
                "Very Well"
            ]
        }
    ],
    data: { isRelevant: true }
}