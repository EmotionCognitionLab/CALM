<template>
    <UploadComponent v-if="allDone">
        <template #preUploadText>
            <div class="instruction">Terrific! Thank you for completing this orientation. Please wait while we upload your data...</div>
        </template>
        <template #postUploadText>
            <div class="instruction">Upload complete! At home please log in to the app to start your home training.</div>
            <br/>
            <button class="button" @click="quit">Quit</button>
        </template>
    </UploadComponent>
</template>
<script setup>
    import { ref, onMounted } from '@vue/runtime-core'
    import { initJsPsych } from 'jspsych'
    import { EmotionalMemory } from '../cognitive/emotional-memory/emotional-memory'
    import { Flanker } from '../cognitive/flanker/flanker'
    import { SpatialOrientation } from '../cognitive/spatial-orientation/spatial-orientation'
    import { TaskSwitching } from '../cognitive/task-switching/task-switching'
    import { VerbalLearning } from '../cognitive/verbal-learning/verbal-learning'
    import { EventSegmentation } from '../cognitive/event-segmentation/event-segmentation'
    import UploadComponent from './UploadComponent.vue'
    import packageInfo from '../../package.json'

    const props = defineProps(['stageNum'])
    const allDone = ref(false)
    let stage
    let tasksToDo

    onMounted(async () => {
        stage = Number.parseInt(props.stageNum)
        const taskInfo = [
            {name: 'verbal-learning-learning', setNum: stage == 1 ? 1 : 8},
            {name: 'flanker-1', setNum: 3},
            {name: 'emomem-learning', setNum: stage == 1 ? 0 : 2},
            {name: 'spatial-orientation', setNum: stage == 1 ? 0 : 1},
            {name: 'task-switching', setNum: 0},
            {name: 'emomem-recall', setNum: stage == 1 ? 1 : 3},
            {name: 'event-segmentation', setNum: stage}
        ]
        const tasksMap = await Promise.all(taskInfo.map(async (ti) => {
            const done = await hasDoneCognitiveExperiment(ti.name, stage)
            if (!done) return ti
            return null
        }))
        tasksToDo = tasksMap.filter(i => i != null);
        await runExperiments()
    })

    async function runExperiments() {
        const t = tasksToDo.shift()
        if (!t) {
            await window.mainAPI.setKeyValue('setupComplete', 'true')
            allDone.value = true
            return
        }
        const saver = (data) => saveResults(t.name, stage, data)
        const jsPsych = initJsPsych({
            on_data_update: saver, 
            on_finish: async function() {
                saveResults(t.name, stage, [{v: packageInfo.version, taskCompleted: true}])
                // #11 w/o a page reload every initJsPsych call adds a new
                // wrapper to the page, so delete it before proceeding
                const wrappers = document.getElementsByClassName('jspsych-content-wrapper')
                if (wrappers.length > 0) wrappers[0].remove()
                await runExperiments()
            },
            override_safe_mode: true
        })
        const task = buildTask(t, jsPsych)
        const node = {
            timeline: task.getTimeline(),
            taskName: t.name
        }
        node.on_timeline_start = () => {
            saveResults(t.name, stage, [{taskStarted: true}])
        }
        jsPsych.run([node])
    }

    function saveResults(experiment, stage, data) {
        window.mainAPI.saveCognitiveResults(experiment, data.isRelevant ? true : false, stage, data)
    }

    function buildTask(taskInfo, jsPsych) {
        if (taskInfo.name == 'verbal-learning-learning') {
            return new VerbalLearning(jsPsych, taskInfo.setNum)
        }
        if (taskInfo.name == 'flanker-1' || taskInfo.name == 'flanker-2') {
            return new Flanker(jsPsych, taskInfo.setNum)
        }
        if (taskInfo.name == 'spatial-orientation') {
            return new SpatialOrientation(jsPsych, taskInfo.setNum)
        }
        if (taskInfo.name == 'task-switching') {
            return new TaskSwitching(jsPsych)
        }
        if (taskInfo.name == 'emomem-learning' || taskInfo.name == 'emomem-recall') {
            return new EmotionalMemory(jsPsych, taskInfo.setNum)
        }
        if (taskInfo.name == 'event-segmentation') {
            return new EventSegmentation(jsPsych, taskInfo.setNum)
        }
            
        throw new Error(`No class found for task ${taskInfo.name}.`)
    }

    async function hasDoneCognitiveExperiment(experiment, stage) {
        return await window.mainAPI.hasDoneCognitiveExperiment(experiment, stage)
    }

    function quit() {
        window.mainAPI.quit()
    }

</script>