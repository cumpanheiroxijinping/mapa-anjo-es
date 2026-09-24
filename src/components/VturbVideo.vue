<template>
  <div class="vturb-wrap">
    <vturb-smartplayer
      :id="cfg.id"
      style="display: block; margin: 0 auto; width: 100%; max-width: 400px;"
    >
      <div
        class="vturb-player-placeholder"
        :style="{
          position: 'relative',
          width: '100%',
          padding: cfg.placeholderPadding + '% 0 0',
          zIndex: 0,
          backgroundColor: 'black',
        }"
      ></div>
    </vturb-smartplayer>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  cfg: { type: Object, required: true },
});
const emit = defineEmits(['ready']);

function injectPlayerScript() {
  // Avoid injecting the same player.js twice.
  if (document.querySelector(`script[data-vturb="${props.cfg.playerId}"]`)) return;
  const s = document.createElement('script');
  s.type = 'text/javascript';
  s.async = true;
  s.src = props.cfg.scriptSrc;
  s.setAttribute('data-vturb', props.cfg.playerId);
  document.head.appendChild(s);
}

onMounted(() => {
  emit('ready');
  injectPlayerScript();
});
</script>

<style scoped>
.vturb-wrap {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}
</style>
