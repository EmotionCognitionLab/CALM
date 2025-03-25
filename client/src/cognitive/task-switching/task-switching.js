
import htmlKeyboardResponse from '@jspsych/plugin-html-keyboard-response';
import "jspsych/css/jspsych.css";
import "../css/common.css";
import "./style.css";
const pre_exer_instr = (await import("./frag/pre_exercise_instruction.html?raw")).default;
const pre_mix_instr = (await import("./frag/pre_mixed_instruction.html?raw")).default;

export class TaskSwitching {
    constructor(jsPsych) {
        this.jsPsych = jsPsych;
    }

    getTimeline() {
        const exercises = this.jsPsych.randomization.shuffle(["color", "number", "size", "color", "number", "size", "color", "number", "size"]);
        const exerciseNodes = exercises.map(e => this.node("exercise", e, 1));

        const options = ["color", "number", "size"];
        let mixedNodes = [];
        for (let i = 0; i < 66; i++) {
            mixedNodes.push(this.node("mixed", options[i % 3], 1, i + 1));
        }
        mixedNodes = this.jsPsych.randomization.shuffle(mixedNodes);
        
        // hack to remove the black background we use for this task
        const finalNode = mixedNodes[mixedNodes.length - 1];
        const finalTimeline = finalNode.timeline;
        // use second from last element in timeline b/c final element is conditional that may not run
        // side effect: If the user is too slow on the last item the "Answer faster next time" will
        // use the default background, not the black background
        finalTimeline[finalTimeline.length - 2].on_finish = () => { document.body.classList.remove("blackbg"); }

        const genericIntro = "We are going to start a round of the task. Please respond as quickly as you can but try to avoid mistakes.";
        const colorIntro = genericIntro + this.singleBlockHtml("color");

        const sizeIntro = genericIntro + this.singleBlockHtml("size");

        const numberIntro = genericIntro + this.singleBlockHtml("number");

        const singles = this.jsPsych.randomization.shuffle([
            [this.constructor.instruction(colorIntro), this.node("single", "color", 8)], 
            [this.constructor.instruction(sizeIntro), this.node("single", "size", 8)],
            [this.constructor.instruction(numberIntro), this.node("single", "number", 8)]    
        ]).flat();
        
        const firstInst = this.constructor.instruction(this.instr1Html(2, "small"));
        // hack to set up the black background this task needs
        firstInst.on_load = () => { document.body.classList.add("blackbg"); }

        return [
            firstInst,
            this.instructionNode(this.instr2(2, "small")),
            this.instructionNode(this.instr3(2, "small")),
            this.instructionNode(this.instr4(2, "big")),
            this.constructor.instruction("<p>That's the basic task! Simple, right? Ready to start the real task?</p><em>Please press the space bar to proceed.</em>"),
        ].concat(singles)
        .concat([this.constructor.instruction(pre_exer_instr)])
        .concat(exerciseNodes)
        .concat([this.constructor.instruction(pre_mix_instr)])
        .concat(mixedNodes)
    }
    get taskName() {
        return this.constructor.taskName;
    }
    
    number(num, bigOrSmall=null) {
        if (!num) {
            num = this.jsPsych.randomization.sampleWithReplacement([1,2,3,4,6,7,8,9], 1)[0];
        }
        const color = Math.random() < 0.5 ? "blue" : "ylw";
        let size;
        if (!bigOrSmall || (bigOrSmall !== "big" && bigOrSmall !== "small")) {
            size = Math.random() < 0.5 ? "small" : "big";
        } else {
            size = bigOrSmall;
        }
        
        return {
            number: num,
            color: color,
            size: size
        }
    }

    promptHtml(taskType) {
        switch (taskType) {
            case "color":
                const dotColors = ["blue", "ylw"] ;
                return `<span class="dot ${dotColors[0]}"></span><span class="dot ${dotColors[1]}"></span>`;
            case "size":
                const dotOrder = ["smalldot", "dot white"];
                return `<span class="${dotOrder[0]}"></span><span class="${dotOrder[1]}"></span>`;
            case "number":
                const numberOrder = ["<5", ">5"];
                return `<div class="small"><span class="leftVal">${numberOrder[0]}</span> <span>${numberOrder[1]}</span></div>`;
            default:
                throw new Error(`Can't create a prompt for unknown task type '${taskType}'`);
        }
    }

    correctResponse(taskType, cue) {
        switch(taskType) {
            case "color":
                if (cue.color === "blue") {
                    return "ArrowLeft"
                } else {
                    return "ArrowRight"
                }
            case "size":
                if (cue.size === "big") {
                    return "ArrowRight"
                } else {
                    return "ArrowLeft"
                }
            case "number":
                if (cue.number > 5) {
                    return "ArrowRight"
                } else {
                    return "ArrowLeft"
                }
            default:
                throw new Error(`Can't determine correct response for unknown stimulus type '${taskType}'`);
        }
    }

    prompt(taskType) {
        return {
            type: htmlKeyboardResponse,
            stimulus: this.promptHtml(taskType),
            trial_duration: 500,
            choices: "NO_KEYS"
        }
    }

    trial(blockType, taskType, round=null) {
        const prompt = this.promptHtml(taskType);
        const result = {
            type: htmlKeyboardResponse,
            stimulus: () => {
                let stim = `<div class="${this.jsPsych.evaluateTimelineVariable("size")} ${this.jsPsych.evaluateTimelineVariable("color")}">`;
                stim += "<p>" + this.jsPsych.evaluateTimelineVariable("number") + "</p>";
                stim += "</div>";
                stim += prompt;
                return stim;
            },
            trial_duration: 2500,
            choices: ["ArrowRight", "ArrowLeft"],
            data: {
                isRelevant: true,
                color: this.jsPsych.timelineVariable("color"),
                size: this.jsPsych.timelineVariable("size"),
                number: this.jsPsych.timelineVariable("number"),
                taskType: taskType,
                blockType: blockType
            },
            on_finish: (data) => {
                const correctResponse = this.correctResponse(taskType, {
                    color: data.color,
                    size: data.size,
                    number: data.number
                });
                data.correct = data.response === correctResponse;
            }
        }
        // round is for mixed blocks only and refers to which of the four rounds we're on
        if (round !== null) {
            result.data.round = round;
        }
        return result;
    }

    node(blockType, taskType, repetitions, round=null) {
        const timelineVariables = [];
        for (let i = 0; i < repetitions; i++) {
            timelineVariables.push(this.number());
        }
        return {
            timeline: [this.prompt(taskType), this.trial(blockType, taskType, round), this.constructor.fixation(500), this.feedback(blockType === "exercise")],
            timeline_variables: timelineVariables,
        }
    }

    instr1Html(number, size) {
        let text = "You are about to start a new task. In this task we will ask you to classify numbers using simple rules. You will see one number at a time, like this one:";
        const numberObj = this.number(number, size);
        text += `<div class="${numberObj.size} ${numberObj.color}"><p>${numberObj.number}</p></div>`;
        text += '<p>In addition to numbers, at the bottom of the screen, you will see the rule for that trial. Now let\'s see what the rules are.</p>'
        text += "<em>Press the space bar to continue</em>"
        return text;
    }

    instr2(number, size) {
        const correctResponse = this.correctResponse("number", {number: number});
        const numObj = this.number(number, size);
        let stim = `<div class="${numObj.size} ${numObj.color}">`;
        stim += "<p>" + numObj.number + "</p>";
        stim += "</div>";
        stim += this.promptHtml("number");
        stim += "<p>Is the number presented on the screen less than or greater than 5? Please press the left arrow key if the number is less than 5 and the right arrow key if the number is greater than 5.</p>";
        return {
            type: htmlKeyboardResponse,
            stimulus: stim,
            choices: ["ArrowRight", "ArrowLeft"],
            data: {
                isTraining: true
            },
            on_finish: function(data) {
                data.correct = data.response === correctResponse;
            }
        }
    }

    instr3(number, size) {
        const numObj = this.number(number, size);
        const correctResponse = this.correctResponse("color", {color: numObj.color});
        let stim = `<div class="${numObj.size} ${numObj.color}">`;
        stim += "<p>" + numObj.number + "</p>";
        stim += "</div>";
        stim += this.promptHtml("color");
        stim += "<p>Is the color of the number blue or yellow? Please press the left arrow key if the color is blue and the right arrow key if the color is yellow.</p>";
        return {
            type: htmlKeyboardResponse,
            stimulus: stim,
            choices: ["ArrowRight", "ArrowLeft"],
            data: {
                isTraining: true
            },
            on_finish: function(data) {
                data.correct = data.response === correctResponse;
            }
        }
    }

    instr4(number, size) {
        const numObj = this.number(number, size);
        const correctResponse = this.correctResponse("size", {size: numObj.size});
        let stim = `<div class="${numObj.size} ${numObj.color}">`;
        stim += "<p>" + numObj.number + "</p>";
        stim += "</div>";
        stim += this.promptHtml("size");
        stim += "<p> Is the number displayed in a small or big font? Please press the left arrow key if the font is small and the right arrow key if the font is large.</p>";
        return {
            type: htmlKeyboardResponse,
            stimulus: stim,
            choices: ["ArrowRight", "ArrowLeft"],
            data: {
                isTraining: true
            },
            on_finish: function(data) {
                data.correct = data.response === correctResponse;
            }
        }
    }

    instructionNode(trial) {
        return {
            timeline: [trial, this.trainingFeedback],
            loop_function: function(data) {
                const response = data.last(2).values()[0];
                return !response.correct;
            }
        }
    }

    feedback(showRightWrong) {
        return {
            timeline: [
                {
                    type: htmlKeyboardResponse,
                    stimulus: () => {
                        const data = this.jsPsych.data.getLastTimelineData();
                        const values = data.last(2).values()[0];
                        if (values.response === null) {
                            return "Answer faster next time";
                        }
                        if (values.correct) {
                            return "Correct";
                        }
                        return "Incorrect";
                    },
                    choices: "NO_KEYS",
                    trial_duration: 500,
                    css_classes: ["small"]
                },
                TaskSwitching.fixation(200)
            ],
            conditional_function: () => {
                const data = this.jsPsych.data.getLastTimelineData();
                const values = data.last(2).values()[0];
                return showRightWrong || values.response === null;
            }
        }
    }

    singleBlockHtml(taskType) {
        let taskText;
        switch(taskType) {
            case "color":
                taskText = "whether they are yellow or blue";
                break;
            case "size":
                taskText = "their relative font size";
                break;
            case "number":
                taskText = "whether they are greater or less than 5";
                break;
            default:
                throw new Error(`Cannot define taskText for unknown taskType '${taskType}'`);
        }
        const html = `<p>In this round, you will be categorizing numbers on ${taskText}.</p>`;
        const prompt = this.promptHtml(taskType);
        return html + prompt + '<br/><div style="padding-top: 40px;""><em>Press the space bar when you are ready to begin</em></div>';
    }

    trainingFeedback = {
        type: htmlKeyboardResponse,
        stimulus: () => {
            const data = this.jsPsych.data.getLastTimelineData();
            const response = data.last(1).values()[0];
            if (response.correct) {
                return "<p>Excellent! That is the correct answer.</p><br/><em>Please press the space bar to continue.</em>";
            }
            return "<p>Incorrect. Please try again.</p><br/><em>Please press the space bar to continue.</em>";
        },
        choices: [" "],
        data: {
            isTraining: true
        }
    }
}

TaskSwitching.taskName = "task-switching";

TaskSwitching.fixation = function(durationMs) {
    return {
        type: htmlKeyboardResponse,
        stimulus: '<div class="fix">+</div><br/><span class="dot">',
        trial_duration: durationMs,
        choices: "NO_KEYS"
    }
}

TaskSwitching.instruction = function(text, choices = [" "]) {
    return {
        type: htmlKeyboardResponse,
        stimulus: text,
        choices: choices
    }
}
