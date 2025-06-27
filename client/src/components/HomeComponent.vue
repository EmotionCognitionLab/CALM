<template>
    <div>
        <div class="container" v-if="!playVideo">
            <div class="row shadow">
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
            <div class="shortrow" @click="showHelp">
                <div class="infotip">?</div>
            </div>
            <div v-if="isModalVisible" class="modal">
                <div class="modal-content">
                    <span class="close" @click="hideHelp">&times;</span>
                    <h3>Questions?</h3>
                    <p class="underline">Click 'View' on the menu bar for:</p>
                    <ul>
                        <li>General study info</li>
                        <li>Questions about the laptop, ear sensor, or the app</li>
                        <li>Your earnings summary</li>
                    </ul>
                </div>
            </div>
        </div>
        <div v-if="playVideo">
            <video-component :videoName="videoName" :nextDest="postVideoDest"/>
        </div>
    </div>
</template>
<script setup>
    import { ref, onBeforeMount } from 'vue'
    import dayjs from 'dayjs'
    import customParseFormat from 'dayjs/plugin/customParseFormat.js'
    dayjs.extend(customParseFormat)
    import { maxSessionMinutes, stage2BreathingMinutes } from '../../../common/types/types'
    import { getCondition, quit } from '../utils'
    import homeImg from '../assets/home-screen-rock-tower.png'
    import { useRouter } from "vue-router"
    import { SessionStore } from '../session-store.js'
    import ApiClient from "../../../common/api/client.js"

    import VideoComponent from './VideoComponent.vue'

    const router = useRouter()
    const props = defineProps(['stage2Complete', 'firstName'])
    const agenda = ref([
        {name: 'Brain Games', class: 'notdone'},
    ])
    const startButton = ref()
    const stage2Complete = props.stage2Complete !== 'false'
    const allDone = ref(false)
    const isModalVisible = ref(false)
    const postVideoDest = ref(null)
    const videoName = ref(null)
    const playVideo = ref(false)

    function showHelp() {
        isModalVisible.value = true
    }

    function hideHelp() {
        isModalVisible.value = false
    }

    onBeforeMount(async() => {
        const week1VideoDate =  await window.mainAPI.getKeyValue('week1VideoSeenDate')
        if (week1VideoDate == null) {
            // they need to see the week 1 video; figure out which one
            const session = await SessionStore.getRendererSession()
            const apiClient = new ApiClient(session)
            const condition = await getCondition(apiClient);
            if (condition.race !== 'black') {
                videoName.value = 'week1EA'
            } else {
               videoName.value = 'week1AA'
            }      
        } else {
            // figure out if they need to see the week 6 video
            const week1Date = dayjs(week1VideoDate, "YYYYMMDD")
            if (dayjs().diff(week1Date, 'day') >= 42) {
                if (await window.mainAPI.getKeyValue('week6VideoSeenDate') == null) {
                    videoName.value =  'week6'
                }
            }
        }
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

        let dest
        //lumosity
        if (agenda.value[0].class == 'notdone') {
            dest = {path: '/lumosity'}
        } else if (agenda.value[1].class == 'notdone') {
            // first breathing
            dest = stage2Complete ? {path: '/stage3/wait'} : {path: '/stage2'}
        } else if (agenda.value[2].class == 'notdone') {
            // second breathing
            dest = stage2Complete ? {path: '/stage3/routing'} : {path: '/stage2'}
        }
        if (videoName.value) {
            postVideoDest.value = dest
            playVideo.value = true
        } else {
            router.push(dest)
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
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        padding-top: 10%;
    }
    .infotip {
        display: flex;
        background-color: lightgrey;
        border-radius: 50%;
        width: 2rem;
        height: 2rem;
        justify-content: center;
        cursor: pointer;
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
    .shadow {
        box-shadow: 9px 16px 11px rgba(0, 0, 0, 0.2);
    }
    .shortrow {
        display: flex;
        justify-content: right;
        width: 860px;
        text-align: right;
    }
    .underline {
        text-decoration: underline;
    }
    .modal {
        display: flex;
        justify-content: center;
        align-items: center;
        position: fixed;
        z-index: 1;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgba(0, 0, 0, 0.4);
    }
    .modal-content {
        background-color: #538FE9;
        color: white;
        padding: 20px;
        border-radius: 10px;
        width: 80%;
        max-width: 500px;
        text-align: center;
        position: relative;
    }
    .close {
        position: absolute;
        top: 10px;
        right: 20px;
        color: white;
        font-size: 30px;
        font-weight: bold;
        cursor: pointer;
    }
</style>