<template>
  <div class="form-content">
    <p class="titulo-sesao">¿En qué Año naciste?</p>
    <div class="year-selector">
      <ul class="year-grid">
        <li v-for="y in years" :key="y" class="year-grid-item">
          <button
            class="year-button"
            :class="{ 'year-button--highlight': model === y }"
            @click="pick(y)"
          >
            {{ y }}
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
import { computed } from 'vue';

const model = defineModel();
const emit = defineEmits(['next', 'back']);

// The year step depends on the chosen decade (previous step). The original
// shows exactly the 10 years inside the selected decade.
const props = defineProps({
  decade: { type: String, default: '' },
});

const years = computed(() => {
  if (!props.decade) return [];
  const start = Number(props.decade);
  return Array.from({ length: 10 }, (_, i) => String(start + i));
});

function pick(v) {
  model.value = v;
  emit('next');
}
</script>