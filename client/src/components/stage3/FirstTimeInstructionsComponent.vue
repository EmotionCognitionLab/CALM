<template>
    <div id="first-time-instructions" class="instruction">
        <p>
            We are now finished with the part of the study measuring your resting heart rate. Great job! Today you will start your first mindfulness practice.
        </p>
        <p>
            Throughout your practice, you will see a "calmness" score. This score shows whether your body is relaxed, according to your heart rate.  The higher the score the better!
        </p>
        <div v-if="condition == 'A'">
            Some helpful tips:
            <ul>
                <li>If you start to feel lightheaded or dizzy, try breathing less deeply. </li>
                <li>If that doesn't help, remove the sensor from your ear and take a break. Try again later when you're feeling better. </li>
                <li>Try to breathe in a relaxed way without taking in more air than necessary</li>
            </ul>
        </div>
        <button @click="done">Continue</button>
    </div>
</template>
<script setup>
    import { useRouter } from "vue-router"

    const condition = window.sessionStorage.getItem('condition')
    const router = useRouter()

    function done() {
        router.push('/stage3/instructions/2')
    }
</script>