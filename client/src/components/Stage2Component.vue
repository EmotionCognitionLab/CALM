<template>
    <div>
        <div id="waiting" v-show="!waitOver">
            <TimerComponent @timerFinished="waitDone" :endAtTime=endWaitAt :endAtKey="endAtKey" :showButtons=false :countBy="'seconds'" ref="timer">
                <template #text>
                    <div class="instruction">{{ waitMessage }}</div>
                </template>
            </TimerComponent>
        </div>
        <div id="breathing" v-show="waitOver && !doUpload">
            <RestComponent :key="heartMeasurementCount" :secondsDuration="120" @timerFinished="resetWait">
                <template #preText>
                    Now you will be asked to sit quietly for two minutes with a pulse sensor on your ear to measure your heart rate.
                </template>
                <template #postText>
                    One moment while we save the data...
                </template>
            </RestComponent>
        </div>
        <div id="upload" v-if="doUpload">
            <UploadComponent>
                <template #postUploadText>
                    <div class="instruction">You're all done for today! For this part of the study, you will repeat what you did today: play brain games and have your heart rate measured twice daily. When we're done with these baseline measurements, you will begin the next part of the study: brain training plus daily mindfulness practice focusing on the breath.</div>
                    <br/>
                    <button class="button" @click="quit">Quit</button>
                </template>
            </UploadComponent>
        </div>
    </div>
</template>
<script setup>
    import { ref, onMounted } from '@vue/runtime-core'
    import TimerComponent from './TimerComponent.vue'
    import RestComponent from './RestComponent.vue';
    import { quit, saveEmWaveSessionData, yyyymmddString } from '../utils'
    import UploadComponent from './UploadComponent.vue';

    let endWaitAt = ref(futureMinutes(10))
    let endAtKey = 'stage2Wait1'
    const timer = ref(null)
    const waitOver = ref(false)
    let waitMessage = 'Please wait at least 10 minutes before your next task, which is to rest for 2 minutes while measuring your resting heart rate.'
    const heartMeasurementCount = ref(0)
    const doUpload = ref(false)

    onMounted(async() => {
        const restMinutesDoneToday = await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), 2)
        let restSessionsDoneToday
        if (restMinutesDoneToday >= 4) {
            restSessionsDoneToday = 2
        } else if (restMinutesDoneToday >= 2) {
            restSessionsDoneToday = 1
        } else {
            restSessionsDoneToday = 0
        }
        if (restSessionsDoneToday == 2) {
            waitOver.value = 2
            doUpload.value = true
            return
        }

        heartMeasurementCount.value = Math.max(0, restSessionsDoneToday - 1)
        const alreadyWaited = await window.mainAPI.getKeyValue(waitDoneKey())
        if (alreadyWaited == 'true') {
            waitOver.value = true
        } else {
            timer.value.running = true
        }
    })

    async function waitDone() {
        await window.mainAPI.setKeyValue(waitDoneKey(), 'true')
        waitOver.value = true
    }

    function waitDoneKey() {
        return `${yyyymmddString(new Date())}-lumos-wait-${heartMeasurementCount.value}-done`;
    }

    function futureMinutes(min) {
        return Date.now() + (min * 60 * 1000)
    }
    
    async function resetWait() {
        await saveEmWaveSessionData(2)

        if (heartMeasurementCount.value == 0) {
            waitMessage = "Your first resting heart rate measurement is complete. As before, please wait at least 10 minutes before completing another 2 minutes of heart rate measurement."
            endAtKey = 'stage2Wait2'
            endWaitAt.value = futureMinutes(10)
            waitOver.value = false
            // ugh - if we just set running = true immediately the watcher
            // in TimerComponent doesn't trigger
            setTimeout(() => {
                timer.value.running = true
            }, 100)
            heartMeasurementCount.value = 1 // reset the RestComponent
        } else {
            doUpload.value = true
        }     
    }

</script>
<style scoped>
.hidden {
    display: none;
}
</style>
