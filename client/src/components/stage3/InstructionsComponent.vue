<template>
    <div class="instruction">
        <div class="header">
            <h2>Get ready for your mindfulness practice!</h2>
        </div>
        <div class="container">
            <div class="left-col">
                <h3>
                    <ul>
                        <li>Sit on a chair with your feet flat on the floor.</li>
                        <li>Attach the ear sensor to your ear.</li>
                        <li>Rest your hands in your lap.</li>
                        <li v-if="condition == 'A'">Following the ball pacer, breathe in as the ball goes up and breathe out as it goes down.</li>
                        <li v-if="condition == 'A'">Breathe in through your nose and breathe out through your nose or mouth.</li>
                    </ul>
                </h3>
            </div>
            <div class="right-col">
                <img :src="seatedIcon"/>
            </div>
        </div>
        <button @click="beginSession()">Continue</button>
    </div>
</template>
<script setup>
    import { useRouter } from "vue-router"
    import seatedIcon from '../../assets/seated-person.png'

    const router = useRouter()
    const condition = window.sessionStorage.getItem('condition')

    async function beginSession() {
        // prevent them from jumping to look at earnings from here on out
        await window.mainAPI.disableMenus()
        router.push('/stage3/audio-selection')
    }
</script>
<style scoped>
    .container {
        display: flex;
        flex-wrap: wrap;
    }
    .instruction {
        max-width: 50em;
    }
    .left-col, .right-col {
        width: 50%;
        padding: 20px;
        box-sizing: border-box;
        text-align: left !important;
    }
    .left-col {
        padding-left: 60px;
    }
    .left-col li {
        padding-top: 15px;
    }
    .right-col {
        max-height: 72vh;
    }
    .right-col img {
        max-width: 100%;
    }
</style>