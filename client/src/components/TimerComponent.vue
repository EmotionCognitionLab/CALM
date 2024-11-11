<template>
    <div>
        <slot name="text">
        </slot>
        <div id="timer" class="timer-text" :class="{small: countBy=='minutes'}" >{{ timeLeft }}</div>
        <div v-if="showButtons">
            <button class="timer-button" id="startTimer" @click="startTimer">Start</button>
            <button class="timer-button" id="stopTimer" @click="stopTimer">Stop</button>
        </div>
    </div>
</template>
<script setup>
    import { ref, computed, watch, onBeforeMount } from 'vue'

    // Set the secondsDuration prop if you want the timer to count a specific number of seconds
    // and to stop counting when the timer stops (and resume when it starts).
    // Set the endAtTime prop if you want the timer to end at a specific time regardless of
    // whether it was stopped before then, the app was quit and restarted in the meantime, etc.
    // The endAtTime value should be given in ms since the epoch.
    // You must set endAtKey if you set endAtTime - endAtKey is the key that the timer
    // will store andAtTime under in the database so that the timer survives quits.
    // It is an error to set both the secondsDuration and the endAtTime props.

    // The countBy prop can be set to 'seconds' if you want the timer to display seconds.
    // Otherwise it will display minutes only.
    const props = defineProps(['secondsDuration', 'showButtons', 'countBy', 'endAtTime', 'endAtKey'])
    const emit = defineEmits(['timer-started', 'timer-stopped', 'timer-finished'])
    let running = ref(false)

    if (props.endAtTime) {
        if (props.secondsDuration) {
            throw new Error('You may only set either secondsDuration or endAtTime, not both.')
        }
        if (!props.endAtKey) {
            throw new Error('You must set the endAtKey prop when you set endAtTime.')
        }
    }

    const secondsRemaining = ref()
    let endAt = Number.MAX_SAFE_INTEGER
    let interval = null
    const countBy = props.countBy ? ref(props.countBy) : ref('seconds')

    onBeforeMount(async () => {
        if (props.secondsDuration) {
            secondsRemaining.value = props.secondsDuration
        } else {
            const curEndAt = Number.parseInt(await window.mainAPI.getKeyValue(props.endAtKey))
            if (Number.isNaN(curEndAt)) {
                // no value was set for this key; use props.endAtTime
                secondsRemaining.value = Math.round((props.endAtTime - Date.now()) / 1000)
                await window.mainAPI.setKeyValue(props.endAtKey, props.endAtTime)
                endAt = props.endAtTime
            } else {
                secondsRemaining.value = Math.round((curEndAt - Date.now()) / 1000)
                endAt = curEndAt
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange, false);
    })
    
    watch(running, (isRunning) => {
        if (isRunning) {
            startTimer()
        } else {
            stopTimer()
        }
    })

    watch(() => props.secondsDuration, newVal => {
        secondsRemaining.value = newVal
    })

    watch(() => props.endAtTime, async newVal => {
        secondsRemaining.value = Math.round((newVal - Date.now()) / 1000)
        await window.mainAPI.setKeyValue(props.endAtKey, newVal)
        endAt = newVal
    })

    // Chromium will pause interval timers when the app loses
    // visibility. If we become visible again, update the time
    // remaining.
    // TODO make this work for a secondsDuration setup as well
    async function handleVisibilityChange() {
        if (document.visibilityState == 'visible' && props.endAtTime) {
            secondsRemaining.value = Math.max(0, Math.round((endAt - Date.now()) / 1000))
        }
    }

    function reset() {
        if (props.endAtTime) {
            throw new Error('A timer set to end at a specific time cannot be reset.')
        }
        secondsRemaining.value = props.secondsDuration
        running.value = false
    }

    defineExpose({running, reset})

    const timeLeft = computed(() => {
        const minutes = Math.floor(secondsRemaining.value / 60)
        const seconds = secondsRemaining.value % 60
        if (countBy.value === 'seconds') {
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        }

        // 14:01 - 15:00 is "15 minutes remaining"
        const minRem = seconds > 0 ? minutes + 1 : minutes
        const minTxt = minRem > 1 ? "minutes" : "minute"
        if (minRem > 0) return `${minRem.toString()} ${minTxt} remaining`
        return ''
    })

    function startTimer() {
        interval = setInterval(async () => await updateSecondsRemaining(), 1000)
        emit('timer-started')
    }

    function stopTimer() {
        clearInterval(interval)
        emit('timer-stopped')
    }

    async function updateSecondsRemaining() {
        secondsRemaining.value -= 1
        if (secondsRemaining.value <= 0 || endAt < Date.now()) {
            clearInterval(interval)
            emit('timer-finished')
            running.value = false
            if (props.endAtKey) {
                await window.mainAPI.deleteKeyValue(props.endAtKey)
            }
        }
    }
</script>
<style scoped>
    .timer-text {
        font-size: 64px;
        margin: 5px 5px 5px 5px;
    }
    .timer-button {
        padding: 8px;
        font-size: 18px;
        font-weight: bold;
        margin-right: 4px;
    }
    .small {
        font-size: 24px;
    }
</style>