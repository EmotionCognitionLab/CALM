<template>
    <div id="waiting">
        <TimerComponent @timerFinished="waitDone" :endAtTime=endWaitAt :endAtKey="endAtKey" :showButtons=false :countBy="'seconds'" ref="timer">
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

    const router = useRouter()
    let endWaitAt = ref(Date.now() + (10 * 60 * 1000))
    let endAtKey = ref('stage3Wait')
    const timer = ref(null)

    onMounted(async() => {
        timer.value.running = true
    })
    
    async function waitDone() {
        router.push('/stage3/routing')
    }

</script>