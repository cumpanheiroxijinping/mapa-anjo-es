<template>
  <div class="form-content">
    <h3 class="titulo-pergunta-signo">¿Cuál es tu Día de Nacimiento?</h3>
    <br />
    <div class="input-control">
      <input
        v-model="model"
        type="number"
        min="1"
        max="31"
        class="field-input"
        placeholder="Día (1-31)"
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
const valid = computed(() => model.value >= 1 && model.value <= 31);
function submit() {
  if (valid.value) emit('next');
}
</script>
