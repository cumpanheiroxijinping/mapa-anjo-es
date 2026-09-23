<template>
  <div class="form-content">
    <p class="titulo-sesao">¿Cuál es el mayor desafío de tu vida en este momento?</p>
    <div class="birth-date-month">
      <ul class="birth-date-list desafio-list">
        <div class="row" style="row-gap: 20px;">
          <div v-for="o in opts" :key="o.value" class="col-6 col-md-6 col-sm-6 col-lg-6">
            <button class="botao-desafio date-item" :class="{ active: model === o.value }" @click="pick(o.value)">
              <img :src="o.img" :alt="o.label" />
              <br />
              {{ o.label }}
            </button>
          </div>
        </div>
      </ul>
    </div>
    <div class="navigation-container">
      <btn class="btn-voltar" @click="emit('back')">&lt; Volver</btn>
    </div>
  </div>
</template>

<script setup>
const model = defineModel();
const emit = defineEmits(['next', 'back']);

const opts = [
  { value: 'Vida Amorosa', label: 'Vida Amorosa', img: '/icons/desafio_vida_amorosa.png' },
  { value: 'Finanzas', label: 'Finanzas', img: '/icons/desafio_finanzas.png' },
  { value: 'Salud', label: 'Salud', img: '/icons/desafio_salud.png' },
  { value: 'Felicidad', label: 'Felicidad', img: '/icons/desafio_felicidad.png' },
];

function pick(v) {
  model.value = v;
  emit('next');
}
</script>