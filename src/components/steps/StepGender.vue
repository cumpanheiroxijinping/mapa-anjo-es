<template>
  <div class="form-content">
    <h3 class="titulo-pergunta-signo">¿Cuál es tu sexo?</h3>
    <br />
    <div class="sbc1945">
      <button class="bs5829" :class="{ selected: model === 'Masculino' }" @click="pick('Masculino')">
        <p>Masculino</p>
      </button>
      <button class="bs5829" :class="{ selected: model === 'Femenino' }" @click="pick('Femenino')">
        <p>Femenino</p>
      </button>
    </div>
  </div>
</template>

<script setup>
const model = defineModel();
const emit = defineEmits(['next']);
function pick(v) {
  model.value = v;
  emit('next');
}
</script>
