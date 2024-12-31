<template>
    <div>
        <button @click="done">I'm all done with Brain Games</button>
        <dialog ref="confirm">
            <form method="dialog">
                Have you played all of today's Brain Games?
                <button @click="gamesConfirmed">Yes</button>
                <button @click="showLumosityView">No</button>
            </form>
        </dialog>
    </div>
</template>
<script setup>
    import { ref, onBeforeMount } from '@vue/runtime-core'
    import { useRouter } from "vue-router"
    import { SessionStore } from '../session-store.js'
    import ApiClient from "../../../common/api/client.js"

    const router = useRouter()
    const confirm = ref(null)
    let mustWaitBeforeNextStep = true
    
    onBeforeMount(async () => {
        try {
            // #23 disable menus - loading earnings or other pages
            // while the Lumosity frame is active replaces 
            // the "I'm all done with brain games" button
            await window.mainAPI.disableMenus()
            
            let lumosInfo = await window.mainAPI.getKeyValue('lumos')
            if (!lumosInfo) {
                const lumosCreds = await apiClient.getLumosCredsForSelf()
                lumosInfo = `${lumosCreds.email}:${lumosCreds.pw}`
                await window.mainAPI.setKeyValue('lumos', lumosInfo)
            }
            const [email, pw] = lumosInfo.split(':')
            window.mainAPI.createLumosityView(email, pw, navigator.userAgent)
            // if they take more than 30 minutes on this screen they can go straight to 
            // heart rate measurement
            setTimeout(() => {
                mustWaitBeforeNextStep = false
            }, 30 * 60 * 1000)

        } catch (err) {
            console.error(err);
        }
    })

    function done() {
        window.mainAPI.hideLumosityView()
        confirm.value.showModal()
    }

    async function gamesConfirmed() {
        window.mainAPI.closeLumosityView()
        window.mainAPI.setLumosityDoneToday()
        const session = await SessionStore.getRendererSession()
        const apiClient = new ApiClient(session)
        const data = await apiClient.getSelf()
        if (data?.progress?.status == 'stage2Complete') {
            if (mustWaitBeforeNextStep) {
                router.push('/stage3/wait')
            } else {
                router.push('/stage3/routing')
            }
        } else {
            router.push({name: 'stage2', params: { mustWait: mustWaitBeforeNextStep }})
        }
        
    }

    function showLumosityView() {
        window.mainAPI.showLumosityView()
    }

</script>
<style scoped>
    :modal {
        background-color: lightgrey;
        border: 2px solid black;
        border-radius: 5px;
    }
</style>
