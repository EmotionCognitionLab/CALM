<template>
    <div class="instruction" v-if="!readyToUpload">
        Crunching the numbers...
        <i class="fa fa-spinner fa-spin" style="font-size: 48px;"></i>
    </div>
    <div v-else>
        <UploadComponent>
            <template #preUploadText>
                <div class="instruction">Terrific! Please wait while we upload your data...</div>
            </template>
            <template #postUploadText>
                    <div class="instruction">
                        <p>
                            {{ postUploadText }}
                        </p>
                    </div>
                <br/>
                <button class="button" @click="quit">Quit</button>
            </template>
        </UploadComponent>
    </div>
</template>
<script setup>
     import { ref, onBeforeMount } from '@vue/runtime-core'
     import { maxSessionMinutes } from '../../../../common/types/types.js';
     import { quit } from '../../utils';
     import UploadComponent from '../UploadComponent.vue';

     const props = defineProps(['doneForToday'])
     let earnedBonus = false
     const readyToUpload = ref(false)
     const postUploadText = ref('')

     onBeforeMount(async() => {
        const mostRecentSession = (await window.mainAPI.extractEmWaveSessionData(-1, false))[0]
        earnedBonus = await window.mainAPI.earnedStage3Bonus(mostRecentSession.sessionUuid)
        const avgCoherence = mostRecentSession.avgCoherence
        const sessionMinutes = Math.min(Math.round(mostRecentSession.durationSec / 60), maxSessionMinutes)
        const weightedAvgCoherence = (sessionMinutes / maxSessionMinutes) * avgCoherence;

        postUploadText.value = `Upload complete. Your calmness score was ${weightedAvgCoherence.toFixed(2)}. `
        if (earnedBonus) {
            postUploadText.value += 'Congratulations! Your score for this practice session was in the top 25% of all your scores. You will receive a bonus of $6. To see your earnings, go to View > Earnings. '
        }
        if (props.doneForToday) {
            postUploadText.value += "Nice work. You are all done for today. See you tomorrow! Click 'Quit' to close the application."
        } else {
            postUploadText.value += "Click 'Quit' for now but come back anytime later today for your second practice."
        }
        readyToUpload.value = true
     })
</script>
