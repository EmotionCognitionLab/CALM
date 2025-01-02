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
     import { quit } from '../../utils';
     import UploadComponent from '../UploadComponent.vue';

     const props = defineProps(['doneForToday'])
     let earnedBonus = false
     const readyToUpload = ref(false)
     const postUploadText = ref('')
     const condition = window.sessionStorage.getItem('condition')

     onBeforeMount(async() => {
        const mostRecentSession = (await window.mainAPI.getEmWaveSessionsForStage(3)).slice(-1)[0] // TODO if fetching all sessions and discarding all but the last is slow, add sorting and limiting to this call
        earnedBonus = await window.mainAPI.earnedStage3Bonus(mostRecentSession.emWaveSessionId)
        const weightedAvgCoherence = mostRecentSession.weightedAvgCoherence
        const weightedInverseCoherence = mostRecentSession.weightedInverseCoherence
        const score = condition == 'A' ? weightedAvgCoherence : weightedInverseCoherence;

        postUploadText.value = `Upload complete. Your calmness score was ${score.toFixed(2)}. `
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
