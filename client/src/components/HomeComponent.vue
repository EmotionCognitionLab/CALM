<template>
    <div class="container">
        <div class="row">
            <div class="left">
                <h2>Hi {{ firstName }}!</h2>
                <p class="underline">Today's agenda:</p>
                <ul>
                    <li v-for="item in agenda" :class=item.class>{{ item.name }}</li>
                </ul>
                <div><button ref="startButton" @click="start(allDone)"></button></div>
            </div>
            <div class="right">
                <img :src="homeImg" alt="rock tower" />
            </div>
        </div>
    </div>
</template>
<script setup>
    import { ref, onBeforeMount } from 'vue'
    import { maxSessionMinutes, stage2BreathingMinutes } from '../../../common/types/types'
    import { quit } from '../utils'
    import homeImg from '../assets/home-screen-rock-tower.png'
    import { useRouter } from "vue-router"

    const router = useRouter()
    const props = defineProps(['stage2Complete', 'firstName'])
    const agenda = ref([
        {name: 'Brain Games', class: 'notdone'},
    ])
    const startButton = ref()
    const stage2Complete = props.stage2Complete !== 'false'
    const allDone = ref(false)

    onBeforeMount(async() => {
        if (await window.mainAPI.getLumosityDoneToday()) {
            agenda.value[0].class = 'done'
        }
        let stage
        let minPerSession
        let trainTypeTxt
        if (stage2Complete) {
            stage = 3
            minPerSession = maxSessionMinutes
            trainTypeTxt = 'Mindfulness'
        } else {
            stage = 2
            minPerSession = stage2BreathingMinutes
            trainTypeTxt = 'Heart Rate'
        }
        const minutesDoneToday = await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), stage)
        for (let i=1; i<=2; i++) {
            agenda.value.push({name: `${trainTypeTxt} #${i}`, class: minutesDoneToday >= i * minPerSession ? 'done' : 'notdone'})
        }
        if (minutesDoneToday >= 2 * minPerSession) {
            startButton.value.innerText = 'Done for today - Quit'
            allDone.value = true
        } else {
            startButton.value.innerText = 'Get Started'
        }
    })

    function start(allDone) {
        if (allDone) quit()

        //lumosity
        if (agenda.value[0].class == 'notdone') {
            router.push(stage2Complete ? {path: '/lumosity/3'} : {path: '/lumosity/2'})
            return
        }
        // first breathing
        if (agenda.value[1].class == 'notdone') {
            router.push(stage2Complete ? {path: '/stage3/wait'} : {path: '/stage2/true'})
            return
        }
        // second breathing
        if (agenda.value[2].class == 'notdone') {
            router.push(stage2Complete ? {path: '/stage3/routing'} : {path: '/stage2/true'})
            return
        }
    }
</script>
<style scoped>
    h2 {
        color: rgb(127, 197, 255);
    }
    ul {
        display: inline-block;
        margin: 0px 0px 30px 0px;
    }
    li {
        display: flex;
        align-items: center;
    }
    li.notdone::before {
        content: '';
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 50%;
        border: 1px solid black;
        background: white;
        margin-right: 0.5rem;
    }
    li.done::before {
        content: "";
        position: relative;
        border-color: #000000;
        border-style: solid;
        border-width: 0 0.15em 0.15em 0;
        height: 0.8em;
        margin: -0.5em 0.5em 0em 0.5em;
        transform: rotate(45deg);
        width: 0.4em;
    }
    .container {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
    }
    .row {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 469px;
        width: 800px;
        border-radius: 5%;
        overflow: hidden;
        text-align: center;
    }
    .left {
        width: 50%;
        height: 100%;
        background-color: #ffffff;
        padding-top: 130px;
    }
    .right {
        width: 50%;
        height: 100%;
        background-color: #f0f0f0;
    }
    .underline {
        text-decoration: underline;
    }
</style>