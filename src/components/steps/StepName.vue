<template>
  <div class="form-content">
    <h3 class="titulo-sesao" style="color: white;">¿Cuál es tu Primer Nombre?</h3>
    <br />
    <div>
      <input
        v-model="name"
        type="text"
        id="f131238918284"
        placeholder="Escribe tu nombre"
        autocomplete="given-name"
        class="field-input"
        @keyup.enter="submit"
      />
      <div class="error-field" v-if="error">{{ error }}</div>
    </div>
    <div class="form-button">
      <button class="button-form pulsating-button" :disabled="!name.trim()" @click="submit" style="margin-bottom: 50px;">
        ¡Haz clic aquí para continuar!
      </button>
    </div>
    <div class="navigation-container">
      <btn class="btn-voltar" @click="emit('back')">&lt; Volver</btn>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const model = defineModel();
const emit = defineEmits(['next', 'back']);
const name = ref(model.value || '');
const error = ref('');

function submit() {
  const value = name.value.trim();
  if (!value) {
    error.value = 'Por favor, escribe tu nombre.';
    return;
  }
  model.value = value;
  emit('next');
}
</script>