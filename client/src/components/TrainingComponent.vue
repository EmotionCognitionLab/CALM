<template>
    <div>
        <div id="main">
            <div id="pacer-animation" v-show="true">
                <PacerComponent 
                    :regimes="remainingRegimes"
                    :playAudio=factors.playAudioPacer
                    :offset-proportion-x="0.4"
                    :offset-proportion-y="0.9"
                    scale-h="320"
                    scale-t="0.05"
                    @pacerFinished="pacerFinished"
                    @pacerRegimeChanged="updateRegimeStatus"
                    ref="pacer" />
            </div>
        </div>
        <br clear="all"/>
        <div id="feedback-area">
            <div id="feedback" :class="feedbackColor">Score: {{ score }}</div>
            <div id="timer"><TimerComponent :secondsDuration=secondsDuration :showButtons=false :countBy="'minutes'" ref="timer" /></div>
        </div>
        <div v-if="factors.playAudioPacer && !hasSetSound" class="instruction">
            Sounds are provided to help guide your breathing. If you want to use the sound cues, set your volume so you can hear them. If it helps increase your coherence scores you may close your eyes and use the sound to guide your breathing.<br/>
            <button @click="hasSetSound=true">OK</button>
        </div>
        <div v-else-if="!factors.playAudioPacer && !hasReadEyesClosedText">
            If you find it helps you increase your calmness scores, you may close your eyes during the sessions.<br/>
            <button @click="hasReadEyesClosedText=true">OK</button>
        </div>
        <div v-else>
            <EmWaveListener :showIbi=false @pulseData="savePulseData" @pulseSensorCalibrated="startDisplay" @pulseSensorStopped="stopDisplay" @pulseSensorSignalLost="stopDisplay" @pulseSensorSignalRestored="resumeDisplay" @pulseSensorSessionEnded="resetDisplay" ref="emwaveListener"/> 
        </div>
    </div>
</template>
<script setup>
import { ref, computed, inject } from '@vue/runtime-core'
import { isProxy, toRaw } from 'vue'
import { pullAt } from 'lodash'
import CBuffer from 'CBuffer';
import EmWaveListener from './EmWaveListener.vue'
import PacerComponent from './PacerComponent.vue'
import TimerComponent from './TimerComponent.vue'
import { epToCoherence } from '../coherence.js'

const props = defineProps(['regimes', 'factors'])
const emit = defineEmits(['pacer-started', 'pacer-stopped', 'pacer-finished', 'session-restart'])

const ibiData = new CBuffer(2).fill(1000) // we want the chart to show a HR of 60 when the app first loads, and 60000 ms/minute / 1000 ms/beat = 60 beats/minute
const pacer = ref(null)
const emwaveListener = ref(null)
const timer = ref(null)
const remainingRegimes = ref(props.regimes)
let inProgressRegime
const finishedRegimes = []
let ep = ref(0)
let hasSetSound = ref(false)
let hasReadEyesClosedText = ref(false)
const invertIbi = inject('invertIbi', ref(false))
const secondsDuration = computed(() => {
    return (remainingRegimes.value.reduce((prev, cur) => prev + cur.durationMs, 0)) / 1000
})


const score = computed(() => {
    if (ep.value <= 0) return 0

    if (invertIbi.value) {
        return ((epToCoherence(ep.value).toPrecision(2)) * -1) + 10
    }

    return epToCoherence(ep.value).toPrecision(2)
})

const feedbackColor = computed(() => {
    if (score.value < 0.5) return 'red'
    if (score.value >= 0.5 && score.value < 1.0) return 'blue'
    return 'green'
})

function savePulseData(hrData) {
    if (!hrData.artifact) {
        ibiData.push(Number.parseInt(hrData.ibi))
        ep.value = hrData.ep
    }
}

async function startDisplay() {
    if (pacer) pacer.value.start = true
    if (timer) timer.value.running = true
    emit('pacer-started')
    await window.mainAPI.disableMenus()
}

function stopDisplay() {
    pacer.value.pause = true
    timer.value.running = false
    emit('pacer-stopped')
}

function resumeDisplay() {
    pacer.value.resume = true
    timer.value.running = true
}

function resetDisplay() {
    pacer.value.pause = true
    timer.value.running = false
    inProgressRegime = null
    const toPull = finishedRegimes.map(r => remainingRegimes.value.findIndex(elem => elem.id === r.id)).filter(idx => idx !== -1)
    if (toPull.length > 0) pullAt(remainingRegimes.value, toPull)
    timer.value.reset()
    emit('session-restart')
}

async function pacerFinished() {
    emwaveListener.value.stopSensor = true
    timer.value.running = false
    emit('pacer-finished')
}

async function updateRegimeStatus(startTime, regime) {
    if (inProgressRegime) finishedRegimes.push(inProgressRegime)
    inProgressRegime = regime
    // if we don't do this we'll fail to emit regime-changed
    // events b/c Object.clone (used by electron's ipc event system)
    // doesn't work on vue proxies
    const rawRegime = isProxy(regime) ? toRaw(regime) : regime
    await window.mainAPI.pacerRegimeChanged(startTime, rawRegime)
}

</script>
<style scoped>
    #feedback {
        width: 150px;
        margin-bottom: 30px;
    }
    #feedback-area {
        display: flex;
        height: 150px;
        flex-direction: column;
        align-items: center;
    }
    #main {
        display: flex;
        height: 500px;
        justify-content: center;
        gap: 20px;
    }
    #pacer-animation {
        width: 1300px;
    }
    #timer {
       width: 150px;
    }
    .red {
        background-color: rgb(243, 103, 103);
    }
    .blue {
        background-color: rgb(130, 165, 242);
    }
    .green {
        background-color: rgb(124, 231, 124);
    }
</style>