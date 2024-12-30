<template>
    <TrainingComponent 
        :regimes="[{durationMs: sessionDurationMs, breathsPerMinute: pace, randomize: false}]"
        :factors="{showHeartRate: true, showPacer: condition == 'A', showScore: true, audioGuideUrl: audioGuideUrl}"
        @pacerFinished="pacerFinished"
        @sessionRestart="saveEmWaveSessionData(stage)">
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
    const sessionDurationMs = ref(maxSessionMinutes*60*1000)
    const stage = 3

    onBeforeMount(async() => {
         // figure out how long this session should be
        const minutesDoneToday = await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), stage)
        const remainingMinutes = (2 * maxSessionMinutes) - minutesDoneToday
        if (remainingMinutes < 1) {
            // this shouldn't happen, but if it does just send them to the end
            router.push({name: 'stage3End', params: {doneForToday: true}})
        }
        
        sessionDurationMs.value = Math.min(maxSessionMinutes, remainingMinutes) * 60 * 1000
    })

    async function pacerFinished() {
        await saveEmWaveSessionData(stage)
        const todayMinutes = await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), 3)
        const doneForToday = todayMinutes >= 36 // two 18-minute sessions/day
        router.push({name: 'stage3End', params: {doneForToday: doneForToday}})
    }
</script>