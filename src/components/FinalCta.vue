<template>
  <div class="final-cta">
    <button class="button-form pulsating-button cta-big" @click="go">{{ label }}</button>
  </div>
</template>

<script setup>
import { config } from '../config.js';
import { appendUtm } from '../composables/useUtm.js';
import { track } from '../composables/useAnalytics.js';

const props = defineProps({ label: { type: String, default: 'Quiero mi Mapa del Ángel de la Guarda' } });

function go() {
  track('pitch_viewed');
  const url = appendUtm(config.CHECKOUT_URL);
  window.location.href = url;
}
</script>

<style scoped>
.final-cta { text-align: center; margin: 28px 0; }
.cta-big {
  font-size: 20px;
  padding: 18px 48px;
  background: rgb(25, 161, 11) !important;
}
</style>
