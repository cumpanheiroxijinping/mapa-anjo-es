<template>
  <div class="stat-card">
    <div class="label">{{ label }}</div>
    <div class="value" :class="{ accent }">{{ value }}</div>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  value: { type: [String, Number], default: '' },
  accent: { type: Boolean, default: false },
});
</script>
