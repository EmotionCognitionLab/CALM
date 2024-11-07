<template>
    <div>
        <button v-if="!gamesDone" @click="done">All done with Brain Games</button>
        <dialog ref="confirm">
            <form method="dialog">
                Have you played all of today's Brain Games?
                <button @click="gamesConfirmed">Yes</button>
                <button>No</button>
            </form>
        </dialog>
        <div id="lumosity-container" v-if="!gamesDone">
            <iframe src="https://www.lumosity.com" frameborder="0" id="lumosity-iframe">

            </iframe>
        </div>
    </div>
</template>
<script setup>
    import { ref } from '@vue/runtime-core'
    import { useRouter } from "vue-router"

    const router = useRouter()

    const confirm = ref(null)
    const gamesDone = ref(false)
    
    function done() {
        confirm.value.showModal()
    }

    function gamesConfirmed() {
        router.push('/stage2')
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
