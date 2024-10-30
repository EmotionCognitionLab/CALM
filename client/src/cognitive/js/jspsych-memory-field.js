import { ParameterType } from "jspsych";

class MemoryFieldPlugin {
    constructor(jsPsych) {
        this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
        
        let html = "";
        html += `<div id="jspsych-memory-field-stimulus">${trial.stimulus}</div>`;
        html += `<input type="text" id="jspsych-memory-field-field" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="send" autocorrect="off">`;
        html += `<div id="jspsych-memory-field-button-wrapper">`;
        html += `<input type="button" id="jspsych-memory-field-button" class="jspsych-btn" value="${trial.button_label}">`;
        html += `</div>`;
        display_element.innerHTML = html;
        
        // find important elements
        const field = display_element.querySelector("#jspsych-memory-field-field");
        const button = display_element.querySelector("#jspsych-memory-field-button");
        // add field listener
        const memory = [];
        field.addEventListener("keyup", event => {
            event.preventDefault();
            if (event.key === "Enter" || event.code === "Enter") {
                // save value and clear field
                memory.push(event.target.value);
                event.target.value = "";
                // flash to confirm submission
                field.classList.add("jspsych-memory-field-flash");
                setTimeout(() => {
                    field.classList.remove("jspsych-memory-field-flash");
                }, 250);
            }
        });
        // add button listener
        button.addEventListener("click", () => {
            const allDone = confirm(trial.confirm_text);
            if (allDone) {
                if (field.value) {
                    memory.push(field.value);
                }
                const data = {
                    stimulus: trial.stimulus,
                    response: memory,
                };
                this.jsPsych.finishTrial(data);
            }
        });
    }
}

const info = {
    name: "memory-field",
    version: "1.0.0",
    parameters: {
        stimulus: {
            type: ParameterType.HTML_STRING,
            default: undefined,
        },
        button_label: {
            type: ParameterType.STRING,
            default: "Stop",
        },
        confirm_text: {
            type: ParameterType.STRING,
            default: "Click OK if you have finished. Click cancel if you can remember more.",
        },
    },
    data: {
        stimulus: {
            type: ParameterType.HTML_STRING
        },
        memory: {
            type: ParameterType.COMPLEX
        }
    }
}

MemoryFieldPlugin.info = info;

export default MemoryFieldPlugin;