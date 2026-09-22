<template>
  <div class="animation-section" v-if="open">
    <div class="animation-container">
      <div class="play-animation modal-warning">
        <div class="content-warning">
          <h3><br /><span style="color: rgb(255, 219, 96);"></span>, tu lectura dejará de estar disponible pronto.</h3>
          <p>Esta es tu última oportunidad de ver hasta el final.<br />Haz clic en el botón de abajo…</p>
        </div>
        <button class="btn-play" style="background: rgb(25, 161, 11) !important;" @click="emit('continue')">COMENZAR</button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['continue']);
</script>

<style scoped>
.animation-section {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  padding: 16px;
}
.content-warning { text-align: center; color: #fff; }
.btn-play {
  display: block;
  margin: 20px auto 0;
  padding: 14px 40px;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-weight: 700;
  font-size: 18px;
  cursor: pointer;
}
</style>
