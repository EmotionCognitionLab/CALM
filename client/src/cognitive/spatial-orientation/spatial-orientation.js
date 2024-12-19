import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response";
import callFunction from "@jspsych/plugin-call-function";
import preload from "@jspsych/plugin-preload";
import spatialOrientation from "../js/jspsych-spatial-orientation.js";
import "jspsych/css/jspsych.css";
import "../css/jspsych-spatial-orientation.css";
import "../css/common.css";
import "./style.css";
// stimulus
import stimulus from "./stim.json";
// images
import sample_img from "./sample.png";
import scene_img from "./scene.png";
// fragments
const instruction_0_html = (await import("./frag/instruction_0.html?raw")).default;
const instruction_1_html = `
Look at the sample trial below.
<img id="spatial-orientation-sample" src="${sample_img}"/>
Imagine that you are standing at the <strong>bell</strong> facing the <strong>tree</strong>.
Your task is to draw a line on the input circle indicating the direction to the <strong>drum</strong>.
In the sample trial, this line has been drawn for you.
In the actual trials, use your computer mouse to draw this line.
Can you see that if you were at the <strong>bell</strong> facing the <strong>tree</strong> the <strong>drum</strong> would be in the direction shown by the dotted line?
<br> <br>
<em>Press the space bar to continue.</em>
`
const sample_instruction_html = (await import("./frag/sample_instruction.html?raw")).default;
const practice_instruction_html = (await import("./frag/practice_instruction.html?raw")).default;
const test_instruction_html = (await import("./frag/timed_instruction.html?raw")).default;

export class SpatialOrientation {
    constructor(jsPsych, setNum) {
        if (setNum === 5 || setNum === 11) {
            throw new Error("invalid setNum");
        } else if (Number.isInteger(setNum) && setNum > 0) {
            this.setNum = setNum;
        } else {
            throw new Error("setNum must be a strictly positive integer");
        }
        this.jsPsych = jsPsych;
    }

    getTimeline() {
        const i = this.constructor.simpleInstruction;
        const t = this.constructor.trial;
        const stimulus = this.constructor.stimulus;
        // example
        const [exampleTrialStim] = stimulus.example.trials;
        const exampleBlock = [
            t(exampleTrialStim.center, exampleTrialStim.facing, exampleTrialStim.target, "example", sample_instruction_html),
        ];
        // practice
        const practiceSet = stimulus.practice;
        const practiceStim = (
            practiceSet.order === "random" ?
            this.jsPsych.randomization.shuffle(practiceSet.trials) :
            practiceSet.trials
        );
        const practiceBlock = [
            i(practice_instruction_html),
            ...practiceStim.map(s => t(s.center, s.facing, s.target, "practice")),
        ];
        // test
        const testSet = stimulus["test-sets"][String(this.setNum)];
        const testStim = (
            testSet.order === "random" ?
            this.jsPsych.randomization.shuffle(testSet.trials) :
            testSet.trials
        );
        let endTime = undefined;
        const testBlock = [
            i(test_instruction_html),
            {
                type: callFunction,
                func: () => { endTime = Date.now() + 100 * 1000; }  // 100 seconds after instruction shown
            },
            ...testStim.map(s => t(s.center, s.facing, s.target, "test", null, () => endTime)),
        ];
        // timeline
        return [
            i(instruction_0_html),
            i(instruction_1_html),
            ...(this.setNum === 1 || this.setNum === 7 ? exampleBlock : []),
            ...(this.setNum === 1 || this.setNum === 7 ? practiceBlock : []),
            ...testBlock,
        ];
    }

    get taskName() {
        return this.constructor.taskName;
    }
}

SpatialOrientation.taskName = "spatial-orientation";

SpatialOrientation.stimulus = stimulus;
SpatialOrientation.lingerDuration = 1000;

SpatialOrientation.scenePositions = {
    "trash can": [0, 0],
    "traffic light": [105, 85],
    wheel: [232, 130],
    drum: [187, -12],
    bell: [108, -149],
    barrel: [395, 78],
    tree: [342, -129],
};

SpatialOrientation.preload = {
    type: preload,
    images: [sample_img, scene_img]
};

SpatialOrientation.simpleInstruction = stimulus => ({
    type: htmlKeyboardResponse,
    stimulus: stimulus,
    choices: [" "],
});

SpatialOrientation.trial = (center, facing, target, mode, instruction = null, endTime = null) => ({
    type: spatialOrientation,
    scene: `<img src=${scene_img}>`,
    instruction: (
        instruction !== null ?
        instruction :
        `Imagine you are standing at the <strong>${center}</strong> and facing the <strong>${facing}</strong>. Point to the <strong>${target}</strong>.`
    ),
    centerText: center,
    topText: facing,
    pointerText: target,
    targetRadians: spatialOrientation.angleABC(
        SpatialOrientation.scenePositions[facing],
        SpatialOrientation.scenePositions[center],
        SpatialOrientation.scenePositions[target],
    ),
    mode: mode,
    lingerDuration: SpatialOrientation.lingerDuration,
    endTime: endTime,
    data: { isRelevant: mode === "test" },
});
