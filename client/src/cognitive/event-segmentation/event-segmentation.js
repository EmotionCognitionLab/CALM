import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response";
import videoKeyboardResponse from "../js/jspsych-video-keyboard";
import surveyLikert from "@jspsych/plugin-survey-likert";
import "jspsych/css/jspsych.css";
import "../css/common.css";
import buildingBlocksMov from "./BuildingBlocks.mp4";

const instruction1_html = (await import("./frag/instruction1.html?raw")).default;
const instruction2_html = (await import("./frag/instruction2.html?raw")).default;
const instruction3_html = (await import("./frag/instruction3.html?raw")).default;
const instruction1_post_html = (await import("./frag/instruction1-post.html?raw")).default;


export class EventSegmentation {
    constructor(jsPsych, setNum) {
        this.jsPsych = jsPsych;
        this.setNum = setNum;
    }

    getTimeline() {
        if (this.setNum == 1) {
            // return pre-intervention timeline
            return [
                EventSegmentation.instruction(instruction1_html),
                EventSegmentation.instruction(instruction2_html),
                EventSegmentation.instruction(instruction3_html),
                EventSegmentation.videoTrial,
                EventSegmentation.difficultySurvey,
                EventSegmentation.familiaritySurvey
            ];

        } else {
            // return post-intervention timeline
            return [
                EventSegmentation.instruction(instruction1_post_html),
                EventSegmentation.instruction(instruction2_html),
                EventSegmentation.instruction(instruction3_html),
                EventSegmentation.videoTrial,
                EventSegmentation.memorySurvey,
                EventSegmentation.difficultySurvey,
                EventSegmentation.familiaritySurvey
            ]
        }
    }
}

EventSegmentation.taskName = "event-segmentation";

EventSegmentation.instruction = (stimulus) => {
    return {
        type: htmlKeyboardResponse,
        stimulus: stimulus,
        choices: [" "]
    }
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