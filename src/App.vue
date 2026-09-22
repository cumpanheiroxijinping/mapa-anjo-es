<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup>
// Global styles + bootstrap
import './assets/css/astrologyStyle.css';
</script>

<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
#app { min-height: 100vh; }
body {
  font-family: 'Sora', 'PT Sans', system-ui, sans-serif;
  background: #0b0a1a;
  color: #fff;
}
</style>
