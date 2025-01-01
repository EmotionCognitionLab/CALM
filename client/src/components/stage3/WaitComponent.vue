<template>
    <div id="waiting">
        <TimerComponent v-if="showTimer" @timerFinished="waitDone" :endAtTime=endWaitAt :endAtKey="endAtKey" :showButtons=false :countBy="'seconds'" ref="timer">
            <template #text>
                You're done with today's brain games! Come back in a few minutes to start today's first mindfulness practice.
            </template>
        </TimerComponent>
    </div>
</template>
<script setup>
    import { ref, onMounted } from '@vue/runtime-core'
    import TimerComponent from '../TimerComponent.vue'
    import { useRouter } from "vue-router"
    import { yyyymmddString } from '../../utils';

    const router = useRouter()
    let endWaitAt = ref(Date.now() + (10 * 60 * 1000))
    let endAtKey = ref('stage3Wait')
    const timer = ref(null)
    const nextDest = '/stage3/routing'
    const showTimer = ref(false)

    onMounted(async() => {
        const alreadyWaited = await window.mainAPI.getKeyValue(waitDoneKey())
        if (alreadyWaited == 'true') {
            router.push(nextDest)
        } else {
            showTimer.value = true
            setTimeout(() => timer.value.running = true, 500) // give vue a moment to instantiate the component
        }
    })
    
    function waitDoneKey() {
        return `${yyyymmddString(new Date())}-lumos-wait-done`;
    }

    async function waitDone() {
        await window.mainAPI.setKeyValue(waitDoneKey(), 'true')
        router.push(nextDest)
    }

</script>