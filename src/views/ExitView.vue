<template>
  <div class="page-wrapper">
    <div class="background-image-sign"><img src="/bg_divino.jpg" alt="" style="filter: brightness(0.9)" /></div>
    <div class="container" style="padding: 100px 0; text-align: center;">
      <h1 class="titulo-principal">Espera… todavía hay una última revelación</h1>
      <p class="subtitulo-principal">Antes de irte, tu Ángel quiere entregarte esto con un descuento especial.</p>
      <button class="button-form pulsating-button" @click="goCheckout">Aprovechar ahora</button>
      <br /><br />
      <router-link to="/" style="color:#fff;text-decoration:underline;">No, gracias, volver</router-link>
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
