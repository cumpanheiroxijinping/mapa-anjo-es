<template>
  <div class="popup-overlay">
    <div class="gender-wrap">
      <p class="titulo-sesao">¿Cuál es tu sexo?</p>
      <div class="gender-options">
        <button class="btn-send" :class="{ active: model === 'Masculino' }" @click="pick('Masculino')">
          <img src="/icons/sexo_masculino.png" style="height: 80px;" alt="Masculino" />
          <br />
          Masculino
        </button>
        <button class="btn-send" :class="{ active: model === 'Femenino' }" @click="pick('Femenino')">
          <img src="/icons/sexo_femenino.png" style="height: 80px;" alt="Femenino" />
          <br />
          Femenino
        </button>
      </div>
      <div style="margin-top: 5px;">
        <btn class="btn-voltar" @click="emit('back')">&lt; Volver</btn>
      </div>
    </div>
  </div>
</template>

<script setup>
const model = defineModel();
const emit = defineEmits(['next', 'back']);
function pick(v) {
  model.value = v;
  emit('next');
}
</script>