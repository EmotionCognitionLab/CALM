<template>
    <div id="router">
      <router-view></router-view>
    </div>
</template>

<script setup>
// import 'logger'
import { getCurrentUser } from '../../common/auth/auth.js'

// new logger.Logger(true, getCurrentUser())

window.mainAPI.onGetCurrentUser((event) => {
  event.sender.send('current-user', getCurrentUser())
})

window.mainAPI.currentUser(getCurrentUser())

</script>

<style>
body {
  font-family: Arial, sans-serif;
  font-size: 20px;
  line-height: 1.6em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  background-color: #F6F7F8;
  height: 100%;
  width: 100%;
}
button {
    font-size: 18px;
    font-variant-caps: all-small-caps;
    font-weight: bold;
    border: none;
    border-radius: 12px;
    padding:10px 40px 10px 40px;
    background-color: #538FE9;
    color: #F6F7F8;
}
button:hover {
  background-color: #4084ea;
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.instruction {
    max-width: 40em;
    padding: 2.5%;
    margin: auto;
}
</style>
