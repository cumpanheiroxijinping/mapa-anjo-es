<template>
  <div class="form-content">
    <h3 class="titulo-pergunta-signo">¿Cuál es tu Primer Nombre?</h3>
    <br />
    <div class="input-control">
      <input
        v-model="model"
        type="text"
        class="field-input"
        placeholder="Escribe tu nombre"
        @keyup.enter="submit"
      />
    </div>
    <br />
    <button class="button-form pulsating-button" :disabled="!model" @click="submit">Continuar</button>
  </div>
</template>

<script setup>
const model = defineModel();
const emit = defineEmits(['next']);
function submit() {
  if (model && model.trim()) emit('next');
}
</script>
