<template>
  <div class="page-wrapper">
    <div class="background-image-sign"><img src="/bg_divino.jpg" alt="" style="filter: brightness(0.9)" /></div>
    <div class="container" style="padding: 100px 0; text-align: center;">
      <h1 class="titulo-principal">Assinatura do Poder</h1>
      <p class="subtitulo-principal">Recibe una lectura mensual de tu Ángel de la Guarda.</p>
      <button class="button-form pulsating-button" @click="goCheckout">Adquirir ahora</button>
    </div>
  </div>
</template>

<script setup>
import { config } from '../config.js';
import { appendUtm } from '../composables/useUtm.js';
function goCheckout() {
  window.location.href = appendUtm(config.CHECKOUT_URL);
}
</script>
