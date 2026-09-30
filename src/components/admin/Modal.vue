<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-head">
        <h2 style="margin: 0; font-size: 18px;">{{ title }}</h2>
        <button class="close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ title: { type: String, default: '' } });
defineEmits(['close']);
</script>
