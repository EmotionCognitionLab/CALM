<template>
    
</template>
<script setup>
    import { onBeforeMount } from '@vue/runtime-core'
    import { useRouter } from "vue-router"
    import { SessionStore } from '../../session-store.js'
    import ApiClient from '../../../../common/api/client';
    import { defaultBreathsPerMinute } from '../../utils'

    const router = useRouter()

    onBeforeMount(async() => {
        const session = await SessionStore.getRendererSession()
        const apiClient = new ApiClient(session)
        const self = await apiClient.getSelf()
        
        // check assignment to condition
        let condition
        if (!self.condition?.assigned) {
            // they haven't been assigned to condition yet; do it
            const resp = await apiClient.assignConditionToSelf()
            condition = resp.condition
        } else {
            condition = self.condition.assigned
        }
        window.sessionStorage.setItem('condition', condition)
        if (condition == 'A') {
            window.sessionStorage.setItem('pace', self.pace)
        } else {
            window.sessionStorage.setItem('pace', defaultBreathsPerMinute)
        }

        // see if this is their first stage 3 session ever
        const stage3Sessions = await window.mainAPI.getEmWaveSessionsForStage(3)
        window.sessionStorage.setItem('stage3SessionCount', stage3Sessions.length)
        if (stage3Sessions.length == 0) {
            router.push('/stage3/instructions/1')
        } else {
            router.push('/stage3/instructions/2')
        }
    })
</script>