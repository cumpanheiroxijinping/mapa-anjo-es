<template>
  <div class="form-content">
    <h3 class="titulo-pergunta-signo">¿En qué Año naciste?</h3>
    <br />
    <div class="input-control">
      <input
        v-model="model"
        type="number"
        min="1900"
        max="2100"
        class="field-input"
        placeholder="Ej: 1990"
        @keyup.enter="submit"
      />
    </div>
    <br />
    <button class="button-form pulsating-button" :disabled="!valid" @click="submit">Continuar</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
const model = defineModel();
const emit = defineEmits(['next']);
const valid = computed(() => model.value >= 1900 && model.value <= 2100);
function submit() {
  if (valid.value) emit('next');
}
</script>
