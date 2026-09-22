<template>
  <div class="vsl-wrap">
    <iframe
      :src="src"
      class="vsl-iframe"
      style="width: 100%; aspect-ratio: 9 / 16; border: 0; display: block"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
      ref="iframeRef"
    ></iframe>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { config } from '../config.js';

const props = defineProps({
  embedId: { type: String, required: true },
  // When set, emit `emailCaptureDue` after this many seconds (original: 304 = 5:04).
  captureAtSec: { type: Number, default: 0 },
});
const emit = defineEmits(['ready', 'emailCaptureDue', 'started', 'interaction']);

const src = `https://play.tynk.ai/p/${props.embedId}`;
const iframeRef = ref(null);
let timer = null;

onMounted(() => {
  emit('ready');
  // Best-effort: most tynk embeds autoplay. If a postMessage API is available
  // we could listen for time updates; as a robust fallback we use the timer.
  if (props.captureAtSec > 0) {
    timer = setTimeout(() => emit('emailCaptureDue'), props.captureAtSec * 1000);
    emit('started');
  }
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<style scoped>
.vsl-wrap {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}
.vsl-iframe {
  border-radius: 12px;
  background: #000;
}
</style>
