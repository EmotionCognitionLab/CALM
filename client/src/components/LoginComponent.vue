<template>
    <div>
        <slot name="bodyText">Please log in to continue.<br/></slot>
        <button :disabled="hasClicked" id="startSetup" @click="login">
            <slot name="btnText">Login</slot>
        </button>
    </div>
</template>
<script setup>
    import { ref } from "vue";
    import { useRoute } from "vue-router";

    const route = useRoute();
    const hasClicked = ref(false);

    const login = () => {
        hasClicked.value = true;
        if (route.query.postLoginPath !== undefined) {
            window.sessionStorage.setItem('postLoginPath', route.query.postLoginPath)
        }
        window.mainAPI.showLoginWindow()
    }

</script>
