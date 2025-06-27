<template>
    <div>
        <div class="instruction">
            <h2>Please watch this video before continuing.</h2>
            <button @click="nextScreen" disabled="true" ref="continueBtn">Continue</button>
        </div>
        <video :src="videoUrl" autoplay @ended="videoDone" height="680">
                Your browser does not support the video tag.
        </video>
    </div>
</template>
<script setup>
    import { ref, onBeforeMount } from '@vue/runtime-core'
    import { useRouter } from "vue-router"
    import week1AA from '../assets/CALM Wk1_v2_AA_720.mov'
    import week1EA from '../assets/CALM Wk1_v2_EA_720.mov'
    import week6 from '../assets/CALM Wk6_v2_720.mov'
    import { yyyymmddString } from '../utils'

    const props = defineProps(['videoName', 'nextDest'])
    const videoUrl = ref('')
    const continueBtn = ref(null)
    const router = useRouter()

    onBeforeMount(async() => {
        switch (props.videoName) {
            case 'week1AA':
                videoUrl.value = week1AA
                break
            case 'week1EA':
                videoUrl.value = week1EA
                break
            case 'week6':
                videoUrl.value = week6
                break
            default:
                console.error('Unknown video name:', props.videoName)
        }
    })

    function videoDone() {
        if (props.videoName === 'week1AA' || props.videoName === 'week1EA') {
            window.mainAPI.setKeyValue('week1VideoSeenDate', yyyymmddString(new Date()))
        } else if (props.videoName === 'week6') {
            window.mainAPI.setKeyValue('week6VideoSeenDate', yyyymmddString(new Date()))
        }
        continueBtn.value.disabled = false
        
    }

    function nextScreen() {
        router.push(props.nextDest)
    }
</script>