<template>
    <div class="instruction">
        It looks like the CALM Study application has been left running overnight. Please quit and restart before resuming your practice.
        <br/>
        <button class="button" @click="quit">Quit</button>
    </div>
</template>
<script setup>
    import { quit } from '../utils';
</script>