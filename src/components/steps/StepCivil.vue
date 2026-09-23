<template>
  <div class="form-content">
    <p class="titulo-sesao">¿Cuál es tu Estado Civil?</p>
    <div class="birth-date-month">
      <ul class="birth-date-list estado-civil-list">
        <button
          v-for="o in opts"
          :key="o.value"
          class="botao-civil date-item"
          :class="{ active: model === o.value }"
          @click="pick(o.value)"
        >
          <img :src="o.img" :alt="o.label" />
          <br />
          {{ o.label }}
        </button>
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
  { value: 'Casado(a)', label: 'Casado(a)', img: '/icons/civil_casado.png' },
  { value: 'En una relación', label: 'En una relación', img: '/icons/civil_relacion.png' },
  { value: 'Comprometido(a)', label: 'Comprometido(a)', img: '/icons/civil_comprometido.png' },
  { value: 'Soltero(a)', label: 'Soltero(a)', img: '/icons/civil_soltero.png' },
  { value: 'Separado(a)', label: 'Separado(a)', img: '/icons/civil_separado.png' },
  { value: 'Viudo(a)', label: 'Viudo(a)', img: '/icons/civil_viudo.png' },
];

function pick(v) {
  model.value = v;
  emit('next');
}
</script>