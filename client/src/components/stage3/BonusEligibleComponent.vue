<template>
    <div class="instruction">
        <p>
            Congratulations! You can now get EXTRA rewards for practicing. When your average score for a  session is in the top 25% of all of your scores so far, you will get an extra $6!
        </p>
        <button @click="done">Continue</button>
    </div>
</template>
<script setup>
    import { useRouter } from "vue-router"

    const condition = window.sessionStorage.getItem('condition')
    const router = useRouter()

    async function done() {
        await window.mainAPI.setKeyValue('bonus-announcement-seen', 'true')
        router.push('/stage3/audio-selection')
    }
</script>