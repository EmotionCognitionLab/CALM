<template>
    <div>

        <div id="waiting" v-show="!waitOver && !reloadNeeded">
            <TimerComponent @timerFinished="waitDone" :endAtTime=endWaitAt :endAtKey="endAtKey" :showButtons=false :countBy="'seconds'" ref="timer">
                <template #text>
                    You're done with today's brain games! Come back in a few minutes to start today's first mindfulness practice.
                </template>
            </TimerComponent>
        </div>

        <div id="first-time-instructions" class="instruction" v-show="waitOver && !firstTimeInstructionsRead && !reloadNeeded">
            <p>
                We are now finished with the part of the study measuring your resting heart rate. Great job! Today you will start your first mindfulness practice.
            </p>
            <p>
                Throughout your practice, you will see a "calmness" score. This score shows whether your body is relaxed, according to your heart rate.  The higher the score the better!
            </p>
            <div v-if="condition == 'A'">
                Some helpful tips:
                <ul>
                    <li>If you start to feel lightheaded or dizzy, try breathing less deeply. </li>
                    <li>If that doesn't help, remove the sensor from your ear and take a break. Try again later when you're feeling better. </li>
                    <li>Try to breathe in a relaxed way without taking in more air than necessary</li>
                </ul>
            </div>
            <button @click="firstTimeInstructionsRead = true">Continue</button>
        </div>

        <div id="audio-selection" class="instruction" v-show="waitOver && firstTimeInstructionsRead && shouldChooseAudio && !sessionDone && !reloadNeeded">
            <fieldset>
                <legend>Please select one of the following audio guides for your practice today. Over time, you should try out the different options and observe which one leads to the best calmness scores for you.</legend>
                <div>
                    <input type="radio" id="belly" v-model="audioGuide" value="CALM_Belly_18min.mp4" />
                    <label for="belly">Belly Focus</label>
                </div>
                <div>
                    <input type="radio" id="lip" v-model="audioGuide" value="CALM_LipNostril_18min.mp4" />
                    <label for="lip">Lip Focus</label>
                </div>
                <div>
                    <input v-if="condition == 'A'" type="radio" id="eyes" v-model="audioGuide" value="CALM_EyesClosed_Osc+_18min.mp4" />
                    <input v-else type="radio" id="eyes" v-model="audioGuide" value="CALM_EyesClosed_Osc-_18min.mp4" />
                    <label for="eyes">Eyes closed</label>
                </div>
                <div v-if="condition == 'A'">
                    <input type="radio" id="pacer-only" v-model="audioGuide" value="" />
                    <label for="pacer-only">No audio guide, just the pacer</label>
                </div>
                <div>
                    <input type="radio" id="no-pacer" v-model="audioGuide" value="no-pacer" checked />
                    <label for="no-pacer">No sound</label>
                </div>
            </fieldset>
            <button @click="setAudioGuide">Continue</button>
        </div>

        <div id="breathing" v-show="waitOver && firstTimeInstructionsRead && !shouldChooseAudio && !sessionDone && !reloadNeeded">
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
                                <li v-if="condition == 'A'">Following the ball pacer, breathe in as the ball goes up and breathe out as it goes down.</li>
                                <li v-if="condition == 'A'">Breathe in through your nose and breathe out through your nose or mouth.</li>
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
                        :factors="{showHeartRate: true, showPacer: condition == 'A', showScore: true, audioGuideUrl: audioGuideUrl}"
                        @pacerFinished="pacerFinished"
                        @sessionRestart="saveEmWaveSessionData(stage)">
                    </TrainingComponent>
                </div>
            </div>
        </div>

        <div v-if="sessionDone && !reloadNeeded">
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
        <div class="instruction" :class="{hidden: !reloadNeeded}">
            It looks like the CALM Study application has been left running overnight. Please quit and restart before resuming your practice.
            <br/>
            <button class="button" @click="quit">Quit</button>
        </div>
    </div>
</template>
<script setup>
    import { ref, onBeforeMount, onMounted, provide } from '@vue/runtime-core'
    import TimerComponent from './TimerComponent.vue'
    import TrainingComponent from './TrainingComponent.vue'
    import UploadComponent from './UploadComponent.vue'
    import { defaultBreathsPerMinute, notifyOnDayChange, quit, saveEmWaveSessionData } from '../utils'
    import { SessionStore } from '../session-store.js'
    import ApiClient from '../../../common/api/client';
    import { maxSessionMinutes } from '../../../common/types/types.js'
    import awsSettings from '../../../common/aws-settings.json'

    import seatedIcon from '../assets/seated-person.png'

    const { mustWait = true } = defineProps({mustWait: Boolean})
    let endWaitAt = ref(futureMinutes(10))
    let endAtKey = 'stage3Wait1'
    const timer = ref(null)
    const waitOver = ref(!mustWait)
    const firstTimeInstructionsRead = ref(false)
    const instructionsRead = ref(false)
    const sessionDurationMs = ref(maxSessionMinutes*60*1000)
    const doneForToday = ref(false)
    const sessionDone = ref(false)
    const pace = ref(defaultBreathsPerMinute)
    const reloadNeeded = ref(false)

    const stage = 3
    const condition = ref(null)
    let stage3Sessions
    const showFirstSessionPostUploadText = ref(false)
    const showSubsequentSessionPostUploadText = ref(false)

    const invertIbi = ref(false)
    const playAudioPacer = ref(false)
    const audioGuideUrl = ref(null)
    const shouldChooseAudio = ref(false)
    const audioGuide = ref('no-pacer')
    provide('invertIbi', invertIbi)
    provide('playAudioPacer', playAudioPacer)

    onBeforeMount(async() => {
        const session = await SessionStore.getRendererSession()
        const apiClient = new ApiClient(session)
        const self = await apiClient.getSelf()

        // check assignment to condition
        if (!self.condition?.assigned) {
            // they haven't been assigned to condition yet; do it
            const resp = await apiClient.assignConditionToSelf()
            condition.value = resp.condition
        } else {
            condition.value = self.condition.assigned
        }

        // set various things that are only to be seen by one condition
        if (condition.value == 'A') {
            pace.value = self.pace
            invertIbi.value = false
            playAudioPacer.value = true
        } else {
            invertIbi.value = true
        }

        // see if this is their first stage 3 session ever
        const stage3Sessions = await window.mainAPI.getEmWaveSessionsForStage(3)
        firstTimeInstructionsRead.value = stage3Sessions.length > 0

        // choose their audio guide
        if (stage3Sessions.length >= 3) {
            shouldChooseAudio.value = true
        } else {
            switch (stage3Sessions.length) {
                case 0:
                    audioGuideUrl.value = `${awsSettings.ImagesUrl}/assets/CALM_Belly_18min.mp4`
                    break;
                case 1:
                    audioGuideUrl.value = `${awsSettings.ImagesUrl}/assets/CALM_LipNostril_18min.mp4`
                    break;
                case 2:
                    if (condition.value == 'A') {
                        audioGuideUrl.value = `${awsSettings.ImagesUrl}/assets/CALM_EyesClosed_Osc+_18min.mp4`
                    } else {
                        audioGuideUrl.value = `${awsSettings.ImagesUrl}/assets/CALM_EyesClosed_Osc-_18min.mp4`
                    }
                    break;
                default:
                    audioGuideUrl.value = null
            }
        }

        // figure out how long this session should be
        const minutesDoneToday = await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), stage)
        const remainingMinutes = (2 * maxSessionMinutes) - minutesDoneToday
        if (remainingMinutes < 1) {
            doneForToday.value = true
            return
        }
        
        sessionDurationMs.value = Math.min(maxSessionMinutes, remainingMinutes) * 60 * 1000

        // make sure they can't continue overnight
        notifyOnDayChange(() => reloadNeeded.value = true)
    })

    onMounted(async() => {
        if (mustWait) timer.value.running = true
    })

    function setAudioGuide() {
        switch (audioGuide.value) {
            case '':
                audioGuideUrl.value = null
                break;
            case 'no-pacer':
                audioGuideUrl.value = null
                playAudioPacer.value = false
                break;
            default:
                audioGuideUrl.value = `${awsSettings.ImagesUrl}/assets/${audioGuide.value}`
                break;
        }
        shouldChooseAudio.value = false
    }

    async function waitDone() {
        waitOver.value = true
    }

    function futureMinutes(min) {
        return Date.now() + (min * 60 * 1000)
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
#audio-selection > fieldset {
    margin-bottom: 30px;
    text-align: left;
}
</style>
