<template>
    <div>
        <div v-if="!uploadComplete">
            <slot name="preUploadText">Please wait while we upload your data...</slot>
            <i class="fa fa-spinner fa-spin" style="font-size: 48px;"></i>
        </div>
        <div v-else>
            <slot name="postUploadText">Upload successful!</slot>
        </div>
    </div>
</template>
<script setup>
    import { ref, onMounted } from '@vue/runtime-core'
    import { SessionStore } from '../session-store.js'

    const uploadComplete = ref(false)
    const emit = defineEmits(['upload-complete'])

    onMounted(async () => {
        try {
            const sess = await SessionStore.getRendererSession()
            await window.mainAPI.uploadEmWaveData(sess)
            await window.mainAPI.uploadBreathData(sess)
            uploadComplete.value = true
            emit('upload-complete')
            await window.mainAPI.uploadComplete()
        } catch (err) {
            console.error('Error uploading data', err)
        }
        
    })
</script>
<style scoped>
@import 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
</style>
