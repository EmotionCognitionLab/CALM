<template>
    <div style="overflow: hidden;">
        <canvas ref="pacer" width="1200" height="400"></canvas>
    </div>
</template>
<script setup>
    import { BreathPacer } from 'pvs-breath-pacer'
    import { onMounted, ref, watch } from '@vue/runtime-core';
    import { isProxy, toRaw, inject } from 'vue'
    import awsSettings from '../../../common/aws-settings.json'

    const props = defineProps(['regimes', 'scaleH', 'scaleT', 'offsetProportionX', 'offsetProportionY'])
    const pacer = ref(null)
    let start = ref(false)
    let pause = ref(false)
    let resume = ref(false)
    defineExpose({start, pause, resume, buildBreathPacer})
    const emit = defineEmits(['pacer-finished', 'pacer-regime-changed'])
    let bp = null

    watch(start, (shouldStart) => {
        if (shouldStart) {
            bp.start()
            .then(() => {
                emit('pacer-finished')
            })
            pause.value = false
        }
    })

    watch(pause, (shouldPause) => {
        if (shouldPause) {
            bp.pause()
            start.value = false
            resume.value = false
        }
    })

    watch(resume, (shouldResume) => {
        if (shouldResume) {
            bp.resume()
            pause.value = false
        }
    })

    watch(() => props.regimes, newRegimes => {
        if (bp) {
            bp.pause() // TODO possible memory leak b/c of regime change subscription?
            buildBreathPacer(newRegimes)
        }
    })

    function regimeChanged(startTime, regime) {
        emit('pacer-regime-changed', startTime, regime);
    }

    function buildBreathPacer(regimes) {
        const pacerConfig = {
            scaleH: props.scaleH,
            scaleT: props.scaleT,
            offsetProportionX: props.offsetProportionX,
            offsetProportionY: props.offsetProportionY
        }
        const playAudioPacer = inject('playAudioPacer')
        if (playAudioPacer.value) {
            pacerConfig.audioInhaleUrl = `${awsSettings.ImagesUrl}/assets/breath_in.mp3`
            pacerConfig.audioExhaleUrl = `${awsSettings.ImagesUrl}/assets/breath_out.mp3`
            pacerConfig.audioVolume = 0.2
        }
        // if we don't do this we'll fail to emit regime-changed
        // events b/c Object.clone (used by electron's ipc event system)
        // doesn't work on vue proxies
        const rawRegimes = isProxy(regimes) ? toRaw(regimes) : regimes
        const newBp = new BreathPacer(pacer.value, rawRegimes, pacerConfig)
        newBp.subscribeToRegimeChanges(regimeChanged)
        bp = newBp
    }

    onMounted(() => {
        buildBreathPacer(props.regimes)
    })
</script>
<style scoped>
    canvas {
        background-color: mintcream;
        width: 750px;
        height: 250px;
    }
</style>