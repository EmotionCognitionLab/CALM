<template>
    <div>

        <div id="waiting" v-show="!waitOver">
            <TimerComponent @timerFinished="waitDone" :endAtTime=endWaitAt :endAtKey="endAtKey" :showButtons=false :countBy="'seconds'" ref="timer">
                <template #text>
                    {{ waitMessage }}
                </template>
            </TimerComponent>
        </div>

        <div id="breathing" v-show="waitOver && !sessionDone">
            <div class="instruction" :class="{hidden: instructionsRead}">
                <div class="header">
                    <h2>Get ready for your mindfulness practice!</h2>
                </div>
                <div class="container">
                    <div class="left-col">
                        <h3>
                            <ul>
                                <li>Sit on a chair with your feet flat on the floor.</li>
                                <li>Attach the ear sensor to your ear.</li>
                                <li>Rest your hands in your lap.</li>
                                <li v-if="condition=='A'">Following the ball pacer, breathe in as the ball goes up and breathe out as it goes down.</li>
                                <li v-if="condition=='A'">Breathe in through your nose and breathe out through your nose or mouth.</li>
                            </ul>
                        </h3>
                    </div>
                    <div class="right-col">
                        <img :src="seatedIcon"/>
                    </div>
                </div>
                <button @click="beginSession()">Continue</button>
            </div>
            <div v-if="instructionsRead">
                <div>
                    <TrainingComponent 
                        :regimes="[{durationMs: sessionDurationMs, breathsPerMinute: pace, randomize: false}]"
                        :factors="{showHeartRate: true, showPacer: condition=='A', showScore: true}"
                        @pacerFinished="pacerFinished"
                        @sessionRestart="saveEmWaveSessionData(stage)">
                    </TrainingComponent>
                </div>
            </div>
        </div>

        <div v-if="sessionDone">
            <UploadComponent @uploadComplete="showEndOfSessionText">
                <template #preUploadText>
                    <div class="instruction">Terrific! Please wait while we upload your data...</div>
                </template>
                <template #postUploadText>
                        <div class="instructions">
                            <div :class="{hidden: showFirstSessionPostUploadText || showSubsequentSessionPostUploadText}">
                                Crunching the numbers...
                                <i class="fa fa-spinner fa-spin" style="font-size: 48px;"></i>
                            </div>
                            <div :class="{hidden: !showFirstSessionPostUploadText, instruction: true}">
                                <p>
                                    You have just completed your first 18-minute mindfulness practice of the day. 
                                    Come back later today to complete the second practice. 
                                    After your second practice, you will be eligible to earn bonuses when your heart rate score is one of your best scores. Click 'Quit' for now but come back anytime later today for your second practice.
                                </p>
                            </div>
                            <div id="subsequentSession" :class="{hidden: !showSubsequentSessionPostUploadText}">
                                <p>Congratulations! You are all done for today. 
                                    See you tomorrow! Click 'Quit' to close the application.
                                </p>
                            </div>
                        </div>
                    <br/>
                    <button class="button" @click="quit">Quit</button>
                </template>
            </UploadComponent>
        </div>
    </div>
</template>
<script setup>
    import { ref, onBeforeMount, onMounted, provide } from '@vue/runtime-core'
    import TimerComponent from './TimerComponent.vue'
    import TrainingComponent from './TrainingComponent.vue'
    import UploadComponent from './UploadComponent.vue'
    import { defaultBreathsPerMinute, quit, saveEmWaveSessionData } from '../utils'
    import { SessionStore } from '../session-store.js'
    import ApiClient from '../../../common/api/client';
    import { maxSessionMinutes } from '../../../common/types/types.js'

    import seatedIcon from '../assets/seated-person.png'

    const { mustWait = true } = defineProps({mustWait: Boolean})
    let endWaitAt = ref(futureMinutes(10))
    let endAtKey = 'stage3Wait1'
    const timer = ref(null)
    const waitOver = ref(!mustWait)
    let waitMessage = 'Please wait at least 10 minutes before your next task, which is to rest for 2 minutes while measuring your resting heart rate.'
    const heartMeasurementCount = ref(0)
    const instructionsRead = ref(false)
    const sessionDurationMs = ref(maxSessionMinutes*60*1000)
    const doneForToday = ref(false)
    const sessionDone = ref(false)
    const pace = ref(defaultBreathsPerMinute)

    const stage = 3
    const condition = ref(null)
    let stage3Sessions
    const showFirstSessionPostUploadText = ref(false)
    const showSubsequentSessionPostUploadText = ref(false)

    const invertIbi = ref(false)
    const playAudioPacer = ref(false)
    provide('invertIbi', invertIbi)
    provide('playAudioPacer', playAudioPacer)

    onBeforeMount(async() => {
        const session = await SessionStore.getRendererSession()
        const apiClient = new ApiClient(session)
        const self = await apiClient.getSelf()
        if (!self.condition?.assigned) {
            // they haven't been assigned to condition yet; do it
            const resp = await apiClient.assignConditionToSelf()
            condition.value = resp.condition
        } else {
            condition.value = self.condition.assigned
        }

        if (condition.value == 'A') {
            pace.value = self.pace
            invertIbi.value = false
            playAudioPacer.value = true
        } else {
            invertIbi.value = true
        }

        const minutesDoneToday = await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), stage)
        const remainingMinutes = (2 * maxSessionMinutes) - minutesDoneToday
        if (remainingMinutes < 1) {
            doneForToday.value = true
            return
        }
        
        sessionDurationMs.value = Math.min(maxSessionMinutes, remainingMinutes) * 60 * 1000
    })

    onMounted(async() => {
        if (mustWait) timer.value.running = true
    })

    async function waitDone() {
        waitOver.value = true
    }

    function futureMinutes(min) {
        return Date.now() + (min * 60 * 1000)
    }
    
    function resetWait() {
        if (heartMeasurementCount.value != 0) return

        waitMessage = "Your first resting heart rate measurement is complete. As before, please wait at least 10 minutes before completing another 2 minutes of heart rate measurement."
        endAtKey = 'stage3Wait2'
        endWaitAt.value = futureMinutes(10)

        // ugh - if we just set running = true immediately the watcher
        // in TimerComponent doesn't trigger
        setTimeout(() => {
            timer.value.running = true
        }, 100)
        heartMeasurementCount.value = 1 // reset the RestComponent
        waitOver.value=false
    }

    async function beginSession() {
        // prevent them from jumping to look at earnings from here on out
        await window.mainAPI.disableMenus()
        instructionsRead.value = true
    }

    async function pacerFinished() {
        // get all of our stage 3 sessions - we'll need them in showEndOfSessionText
        // and once sessionDone is set to true the database is closed and
        // we can't get them any more
        // use setTimeout to give emWave a moment to write the data
        const p = new Promise(resolve => setTimeout(async () => {
            stage3Sessions = await window.mainAPI.getEmWaveSessionsForStage(3)
            resolve()
        }, 500))
        await p
        await saveEmWaveSessionData(stage)
        doneForToday.value = (await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), 3)) >= 36 // two 18-minute sessions/day
        sessionDone.value = true
    }

    async function showEndOfSessionText() {
        const completeSessionCount = stage3Sessions.filter(s => s.durationSeconds >= maxSessionMinutes * 60).length
        if (completeSessionCount < 1) {
            // then show the end-of-first-session text and we're done
            showFirstSessionPostUploadText.value = true;
            return
        }

        showSubsequentSessionPostUploadText.value = true
    }

</script>
<style scoped>
.hidden {
    display: none;
}
.container {
    display: flex;
    flex-wrap: wrap;
}
.left-col, .right-col {
    width: 50%;
    padding: 20px;
    box-sizing: border-box;
    text-align: left !important;
}
.left-col {
    padding-left: 60px;
}
.left-col li {
    padding-top: 15px;
}
.right-col {
    max-height: 72vh;
}
.right-col img {
    max-width: 100%;
}
.img-instructions {
    width: 100vw;
    margin-left: -62%;
}
.instruction {
    max-width: 50em;
}
</style>
