<template>
  <div class="form-content">
    <p class="titulo-sesao">¿En qué Década naciste?</p>
    <div class="decade-selector">
      <ul class="decade-grid">
        <li v-for="d in decades" :key="d" class="decade-grid-item">
          <button
            class="decade-button"
            :class="{ 'decade-button--highlight': model === d }"
            @click="pick(d)"
          >
            {{ d }}
          </button>
        </li>
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

const decades = ['1910', '1920', '1930', '1940', '1950', '1960', '1970', '1980', '1990', '2000', '2010'];

function pick(v) {
  model.value = v;
  emit('next');
}
</script>