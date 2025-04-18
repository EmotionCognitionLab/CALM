<template>
    <div class="wrapper">
        <div class="error" v-if="errorText != null">
            {{ errorText }}
            <div v-if="errorRequiresQuit">
                <button class="button" @click="quit">Quit</button>
            </div>
            <div v-else>
                <button class="button" @click="errorText = null">OK</button>
            </div>
        </div>
        <div v-else>
            <div class="instruction" v-if="step==1">
                Welcome! We're going to do some breathing exercises to familiarize you with the heart rate sensor and software. Please sit comfortably and connect the pulse sensor to your ear.
                <br/>
                <button @click="nextStep">Continue</button>
            </div>
            <div v-else-if="step==2">
                <RestComponent @timerFinished="nextStep" :secondsDuration="300">
                    <template #preText>
                        Now you will be asked to sit quietly for five minutes with a pulse sensor on your ear to measure your heart rate.
                    </template>
                </RestComponent>
            </div>
            <div v-else-if="step==3">
                <p class="instruction">
                    Next you're going to breathe at a specific pace.
                    Breathe in through your nose when the ball is going up and out through your mouth or nose when it is going down.
                </p>
                <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: paces[step-2], randomize: false}]" :factors="{showPacer: true}" @pacerFinished="pacerFinished" @pacerStopped="pacerStopped"/>
            </div>
            <div v-else-if="step==4">
                <p class="instruction">
                    Good work! This will also be paced breathing, but at a different pace.
                    Remember to breathe in through your nose and out through your nose or mouth.
                </p>
                <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: paces[step-2], randomize: false}]" :factors="{showPacer: true}" @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
            </div>
            <div v-else-if="step==5">
                <p class="instruction">
                    Nice! One more to go and we'll be all done with setup. Remember to breathe in through your nose.
                </p>
                <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: paces[step-2], randomize: false}]" :factors="{showPacer: true}" @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
            </div>
            <div v-else-if="step==6">
                <p>One moment while we crunch the data...</p>
            </div>
            <div v-else-if="step==7 && errorText == null">
                <p>Great! You're finished with the breathing exercises. Next up: some cognitive exercises.</p>
                <button @click="goToCognitive">Continue</button>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ref, onBeforeMount, provide } from '@vue/runtime-core'
    import { useRouter } from "vue-router"
    import RestComponent from './RestComponent.vue'
    import TrainingComponent from './TrainingComponent.vue'
    import { calculatePersonalizedPace } from '../utils'
    import { SessionStore } from '../session-store'
    import ApiClient from '../../../common/api/client';

    // step 1: instructions
    // step 2: rest breathing
    // step 3: paced breathing @ 4.5s/breath
    // step 4: paced breathing @ 5s/breath
    // step 5: paced breathing @ 7s/breath
    // step 6: upload
    const step = ref(null)
    const props = defineProps(['stageNum'])
    const paces = ref(['rest', 13.333, 12, 8.571])
    const errorText = ref(null)
    const errorRequiresQuit = ref(false)
    const router = useRouter()
    let pacerHasFinished = false
    let session;
    let apiClient
    let stage
    let stepKey
    provide('playAudioPacer', ref(true))
    
    onBeforeMount(async() => {
        stage = Number.parseInt(props.stageNum)
        stepKey = `stage${stage}Step`
        session = await SessionStore.getRendererSession()
        apiClient = new ApiClient(session)
        window.mainAPI.setStage(stage)
        const curStep = await window.mainAPI.getKeyValue(stepKey)
        if (!curStep) {
            step.value = 1
        } else {
            step.value = Number.parseInt(curStep)
            if (step.value == 6) {
                // something must have gone wrong during HRV analysis
                // call finalizeSetup to trigger it again and move forward
                await finalizeSetup()
            }
        }
    })

    async function saveEmWaveSessionData() {
        const s = (await window.mainAPI.extractEmWaveSessionData(-1, false))[0]
        if (s.validStatus != 1) return false

        await window.mainAPI.saveEmWaveSessionData(s.sessionUuid, s.avgCoherence, s.pulseStartTime, s.validStatus, s.durationSec, stage)
        return true
    }

    async function nextStep() {
        try {
            if (step.value == 1) {
                // They've just read an instruction screen - no need to save emwave data
                step.value += 1
                return
            }

            // give emWave a second to save the session so we don't get the wrong one
            const delayedSaveSession = new Promise((resolve, _) => {
                setTimeout(async () => {
                    const sessionValid = await saveEmWaveSessionData(paces.value[step.value - 2])
                    resolve(sessionValid)
                }, 1000)
            })
            const sessionGood = await delayedSaveSession
            if (!sessionGood) {
                errorText.value = "Unfortunately the data for that session were invalid. Please repeat it."
                return
            }
            
            step.value += 1
            await window.mainAPI.setKeyValue(stepKey, step.value)
            if (step.value > 3 && step.value < 6) {
                // reset the pacer
                pacerHasFinished = false
            }
            if (step.value == 6) {
                await finalizeSetup()
            }
        } catch (err) {
            console.error(err)
        }
        
    }

    function goToCognitive() {
        router.push({path: `/cognitive/${stage}`})
    }

    async function finalizeSetup() {
        if (stage == 1) {
            const paceSet = await setPace()
            if (!paceSet) return
        }
        
        step.value += 1
        await window.mainAPI.setKeyValue(stepKey, step.value)
    }

    async function setPace() {
        const paceData = {}
        const hrvResults = []
        let personalPace
        let sessIds

        try {
            // ensure we have data to calculate personalized pace
            const stage1Sessions = await window.mainAPI.getEmWaveSessionsForStage(stage)
            sessIds = stage1Sessions.map(s => s.emWaveSessionId)
            const sessData = await window.mainAPI.getEmWaveSessionData(sessIds)
            const ibiData = sessData.map(s => s.liveIBI)
            if (ibiData.length !== 4) {
                const verb = ibiData.length == 1 ? 'was' : 'were'
                errorText.value = `An error has occurred. Please ask the experimenter for assistance.
                Experimenter: Four sessions with IBI data were expected, but ${ibiData.length} ${verb} found. Please 
                quit the app, delete the calm-study.sqlite file, and restart the app.
                `
                errorRequiresQuit.value = true
                return
            }
            // find hrv peaks and calculate personalized pace
            for (let i=0; i<4; i++) {
                const ibd = ibiData[i]
                const pace = paces.value[i]
                const hrvPeaks = (await apiClient.getHRVAnalysis(ibd))[0] // for some reason hrv analysis results are wrapped in an array
                hrvResults.push({pace: pace, peaks: hrvPeaks})
            }
            personalPace = calculatePersonalizedPace(hrvResults.map(hrv => hrv.peaks))

            paceData['pace'] = personalPace
            if (hrvResults.length > 0) {
                paceData['stage1HrvPeaks'] = hrvResults
            }
            await apiClient.updateSelf(paceData)
            return true
        } catch (err) {
            // we should figure out which sessions we didn't get hrv peaks for
            // everything from the first missing one forward will have to be redone
            const successfulSessionCount = hrvResults.length
            if (successfulSessionCount == 4) {
                // then we must have failed to save the paces to their record
                errorText.value = `An error has occurred. Please ask the experimenter for assistance.
                Experimenter: Please note this information for manual entry to the database: ${JSON.stringify(paceData)}
                `
                errorRequiresQuit.value = false
                return true
            }

            // delete the session we lack an hrv peak for and all subsequent ones
            const failedSessionIds = sessIds.slice(successfulSessionCount)
            await window.mainAPI.deleteEmWaveSessions(failedSessionIds)

            // reset the stage1Step key so that they're brought back to the right point on restart
            await window.mainAPI.setKeyValue('stage1Step', successfulSessionCount + 2)
            errorText.value = `An error has occurred. Please ask the experimenter for assistance.
            Experimenter: You will need to quit and restart. ${err.message}
            `
            errorRequiresQuit.value = true
            return false
        }
    }

    async function pacerFinished() {
        pacerHasFinished = true
    }

    function pacerStopped() {
        if (pacerHasFinished) {
            // we're all done - the pacer finished and when the sensor
            // stopped this got emitted
            nextStep()
        }
    }

    function quit() {
        window.mainAPI.quit()
    }

</script>
<style scoped>
    .wrapper {
    display: flex;
    margin: auto;
    flex: 1 1 100%;
    width: 100%;
    justify-content: center;
    }
</style>
