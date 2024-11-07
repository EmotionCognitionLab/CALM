<template>
    <div>
        <div id="waiting" v-show="!waitOver">
            {{  waitMessage }} 
            <TimerComponent @timerFinished="waitOver=true" :secondsDuration=600 :showButtons=false :countBy="'seconds'" ref="timer" />
        </div>
        <div id="breathing" v-show="waitOver">
            <RestComponent :key="heartMeasurementCount" :secondsDuration="120" @timerFinished="resetWait">
                <template #preText>
                    Now you will be asked to sit quietly for two minutes with a pulse sensor on your ear to measure your heart rate.
                </template>
            </RestComponent>
        </div>
    </div>
</template>
<script setup>
    import { ref, onMounted } from '@vue/runtime-core'
    import TimerComponent from './TimerComponent.vue'
    import RestComponent from './RestComponent.vue';

    const timer = ref(null)
    const waitOver = ref(false)
    let waitMessage = 'Please wait at least 10 minutes before your next task, which is to rest for 2 minutes while measuring your resting heart rate.'
    const heartMeasurementCount = ref(0)

    onMounted(() => timer.value.running = true)
    
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
