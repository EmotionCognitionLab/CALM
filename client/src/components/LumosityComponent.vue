<template>
    <div>
        <button @click="done">All done with Brain Games</button>
        <dialog ref="confirm">
            <form method="dialog">
                Have you played all of today's Brain Games?
                <button @click="gamesConfirmed">Yes</button>
                <button>No</button>
            </form>
        </dialog>
        <div id="lumosity-container">
            <iframe src="https://www.lumosity.com" frameborder="0" id="lumosity-iframe">

            </iframe>
        </div>
    </div>
</template>
<script setup>
    import { ref, onBeforeMount } from '@vue/runtime-core'
    import { useRouter } from "vue-router"
    import { SessionStore } from '../session-store.js'
    import ApiClient from "../../../common/api/client.js"

    const router = useRouter()

    const confirm = ref(null)
    let doneDest = '/stage2'
    
    onBeforeMount(async () => {
        try {
            const session = await SessionStore.getRendererSession()
            const apiClient = new ApiClient(session)
            const data = await apiClient.getSelf()
            if (data?.progress?.status == 'stage2Complete') {
                doneDest = '/stage3'
            }
        } catch (err) {
            console.error(err);
        }
    })

    function done() {
        confirm.value.showModal()
    }

    function gamesConfirmed() {
        router.push(doneDest)
    }

</script>
<style scoped>
    #lumosity-container {
        position: relative;
        height: 0;
        width: 96%;
        padding-bottom: 56%;
    }
    #lumosity-iframe {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
    }
    :modal {
        background-color: lightgrey;
        border: 2px solid black;
        border-radius: 5px;
    }
</style>
