<template>
  <span class="badge" :class="variant">
    <span class="dot" v-if="dot" />
    {{ text || variant }}
  </span>
</template>

<script setup>
defineProps({
  text: { type: [String, Number], default: '' },
  variant: { type: String, default: '' }, // '', green, red, amber, blue, purple, teal
  dot: { type: Boolean, default: true },
});
</script>
