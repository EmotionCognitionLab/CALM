<template>
    <div id="audio-selection" class="instruction" v-show="!audioSelected">
        <fieldset>
            <legend>Please select one of the following audio guides for your practice today. Over time, you should try out the different options and observe which one leads to the best calmness scores for you.</legend>
            <div>
                <input type="radio" id="belly" v-model="audioGuide" value="CALM_Belly_18min.mp4" />
                <label for="belly">Belly Focus</label>
            </div>
            <div>
                <input type="radio" id="lip" v-model="audioGuide" value="CALM_LipNostril_18min.mp4" />
                <label for="lip">Lip Focus</label>
            </div>
            <div>
                <input v-if="condition == 'A'" type="radio" id="eyes" v-model="audioGuide" value="CALM_EyesClosed_Osc+_18min.mp4" />
                <input v-else type="radio" id="eyes" v-model="audioGuide" value="CALM_EyesClosed_Osc-_18min.mp4" />
                <label for="eyes">Eyes closed</label>
            </div>
            <div v-if="condition == 'A'">
                <input type="radio" id="pacer-only" v-model="audioGuide" value="pacer-only" />
                <label for="pacer-only">No audio guide, just the pacer</label>
            </div>
            <div>
                <input type="radio" id="no-pacer" v-model="audioGuide" value="no-pacer" checked />
                <label for="no-pacer">No sound</label>
            </div>
        </fieldset>
        <button @click="setAudioGuide">Continue</button>
    </div>
</template>
<script setup>
    import { onBeforeMount, ref } from '@vue/runtime-core'
    import awsSettings from '../../../../common/aws-settings.json'
    import { useRouter } from "vue-router"

    const router = useRouter()
    const audioSelected = ref(true)
    const stage3SessionCount = Number.parseInt(window.sessionStorage.getItem('stage3SessionCount'))
    let audioGuideUrl
    const condition = ref(window.sessionStorage.getItem('condition'))
    window.sessionStorage.setItem('playAudioPacer', condition.value == 'A')
    const nextStepDest = '/stage3/breathing'
    const audioGuide = ref('no-pacer')

    onBeforeMount(async() => {
        if (stage3SessionCount > 2) {
            audioSelected.value = false
        } else {
            switch (stage3SessionCount) {
                case 0:
                    audioGuideUrl = `${awsSettings.ImagesUrl}/assets/CALM_Belly_18min.mp4`
                    break;
                case 1:
                    audioGuideUrl = `${awsSettings.ImagesUrl}/assets/CALM_LipNostril_18min.mp4`
                    break;
                case 2:
                    if (condition.value == 'A') {
                        audioGuideUrl = `${awsSettings.ImagesUrl}/assets/CALM_EyesClosed_Osc+_18min.mp4`
                    } else {
                        audioGuideUrl = `${awsSettings.ImagesUrl}/assets/CALM_EyesClosed_Osc-_18min.mp4`
                    }
                    break;
                default:
                    audioGuideUrl = null
            }
            window.sessionStorage.setItem('audioGuideUrl', audioGuideUrl)
            router.push(nextStepDest)
        } 
    })
    
    function setAudioGuide() {
        switch (audioGuide.value) {
            case 'pacer-only':
                audioGuideUrl = null
                break;
            case 'no-pacer':
                audioGuideUrl = null
                window.sessionStorage.setItem('playAudioPacer', false)
                break;
            default:
                audioGuideUrl = `${awsSettings.ImagesUrl}/assets/${audioGuide.value}`
                break;
        }
        if (audioGuideUrl) window.sessionStorage.setItem('audioGuideUrl', audioGuideUrl)
        audioSelected.value = true
        router.push(nextStepDest)
    }

</script>
<style scoped>
    #audio-selection > fieldset {
        margin-bottom: 30px;
        text-align: left;
    }
</style>