<template>
    <TrainingComponent v-if="regimes.length > 0"
        :regimes=regimes
        :factors="{showHeartRate: true, showPacer: condition == 'A', showScore: true, audioGuideUrl: audioGuideUrl}"
        @pacerFinished="pacerFinished"
        @sessionRestart="sessionRestarted">
    </TrainingComponent>
</template>
<script setup>
    import { ref, onBeforeMount } from '@vue/runtime-core'
    import TrainingComponent from '../TrainingComponent.vue'
    import { saveEmWaveSessionData } from '../../utils'
    import { maxSessionMinutes } from '../../../../common/types/types.js'
    import { useRouter } from "vue-router"

    const router = useRouter()
    const audioGuideUrl = ref(window.sessionStorage.getItem('audioGuideUrl'))
    const condition = window.sessionStorage.getItem('condition')
    const pace = Number.parseFloat(window.sessionStorage.getItem('pace'))
    const stage = 3
    const regimes = ref([])

    onBeforeMount(async() => {
        await setRegimes()
    })

    async function setRegimes() {
         // figure out how long this session should be
         const sessionDurationMs = await getSessionDurationMs()
        if (sessionDurationMs < 1000 * 60) {
            // too short to bother with; just send them to the end
            router.push({name: 'stage3End', params: {doneForToday: true}})
        }
        
        regimes.value[0] = {durationMs: sessionDurationMs, breathsPerMinute: pace, randomize: false}
    }

    async function getSessionDurationMs() {
        const minutesDoneToday = await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), stage)
        const remainingMinutes = (2 * maxSessionMinutes) - minutesDoneToday
        return Math.min(maxSessionMinutes, remainingMinutes) * 60 * 1000
    }

    async function sessionRestarted() {
        await saveEmWaveSessionData(stage)
        await setRegimes()
    }

    async function pacerFinished() {
        await saveEmWaveSessionData(stage)
        const todayMinutes = await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), 3)
        const doneForToday = todayMinutes >= 36 // two 18-minute sessions/day
        router.push({name: 'stage3End', params: {doneForToday: doneForToday}})
    }
</script>