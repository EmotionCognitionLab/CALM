<template>
    <div>
        <div id="waiting" v-show="!waitOver">
            {{  waitMessage }} 
            <TimerComponent @timerFinished="waitOver=true" :secondsDuration="waitSeconds" :showButtons=false :countBy="'seconds'" ref="timer" />
        </div>
        <div id="breathing" v-show="waitOver">
            <RestComponent :key="heartMeasurementCount" :secondsDuration="120" @timerFinished="resetWait">
                <template #preText>
                    Now you will be asked to sit quietly for two minutes with a pulse sensor on your ear to measure your heart rate.
                </template>
                <template #postText>
                    You're all done for today! For this part of the study, you will repeat what you did today: play brain games and have your heart rate measured twice daily. When we're done with these heart rate measurements, you will begin the next part of the study: brain training plus daily mindfulness practice focusing on the breath.
                    <br/>
                    <button class="button"  @click="quit">Quit</button>
                </template>
            </RestComponent>
        </div>
    </div>
</template>
<script setup>
    import { ref, onMounted } from '@vue/runtime-core'
    import TimerComponent from './TimerComponent.vue'
    import RestComponent from './RestComponent.vue';
    import { quit } from '../utils'

    const waitSeconds = ref(120)
    const timer = ref(null)
    const waitOver = ref(false)
    let waitMessage = 'Please wait at least 10 minutes before your next task, which is to rest for 2 minutes while measuring your resting heart rate.'
    const heartMeasurementCount = ref(0)

    onMounted(async() => {
        const defaultEnd =  Date.now() + (waitSeconds.value * 1000)
        const waitEnd = Number.parseInt(await window.mainAPI.getKeyValue('waitEnd'))
        if (Number.isNaN(waitEnd) || waitEnd == 0) { // then there was no value set
            waitEnd = defaultEnd
            await window.mainAPI.setKeyValue('waitEnd', waitEnd)
        } else if (waitEnd < defaultEnd) {
            waitOver.value = true
        } else {
            waitSeconds.value = (Date.now() - waitEnd) / 1000
        }
        timer.value.running = true
    })
    
    function resetWait() {
        if (heartMeasurementCount.value != 0) return

        waitMessage = "Your first resting heart rate measurement is complete. As before, please wait at least 10 minutes before completing another 2 minutes of heart rate measurement."
        timer.value.reset()

        // ugh - if we just set running = true immediately the watcher
        // in TimerComponent doesn't trigger
        setTimeout(() => {
            timer.value.running = true
        }, 100)
        heartMeasurementCount.value = 1 // reset the RestComponent
        waitOver.value=false
    }

</script>
