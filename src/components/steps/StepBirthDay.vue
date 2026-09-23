<template>
  <div class="form-content">
    <p class="titulo-sesao">¿Cuál es tu Día de Nacimiento?</p>
    <div class="dsc698">
      <div v-for="(month, mi) in monthRanges" :key="month.name" class="dc48194">
        <div class="header31283"><h4>{{ month.name }}</h4></div>
        <div class="dt948389">
          <ul class="ls318329">
            <li
              v-for="d in month.days"
              :key="d"
              :data-value="d"
              class="birth-day-li"
              :class="{ active: model === month.key + '-' + d }"
              @click="pick(month, d)"
            >
              {{ d }}
            </li>
          </ul>
        </div>
      </div>
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

const props = defineProps({
  sign: { type: String, default: '' },
});

// Original template: each sign covers the second half of one month
// (day 20..end) plus the first half of the following month (day 1..20).
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const SIGN_START = {
  aries: 2,      // Marzo 20 → Abril 20
  touro: 3,      // Abril 20 → Mayo 20
  gemeos: 4,     // Mayo 20 → Junio 20
  cancer: 5,     // Junio 20 → Julio 20
  leao: 6,       // Julio 20 → Agosto 20
  virgem: 7,     // Agosto 20 → Septiembre 20
  libra: 8,      // Septiembre 20 → Octubre 20
  escorpiao: 9,  // Octubre 20 → Noviembre 20
  sagitario: 10, // Noviembre 20 → Diciembre 20
  capricornio: 11, // Diciembre 20 → Enero 20
  aquario: 0,    // Enero 20 → Febrero 20
  peixes: 1,     // Febrero 20 → Marzo 20
};

const monthRanges = computed(() => {
  const first = SIGN_START[props.sign] !== undefined ? SIGN_START[props.sign] : 2;
  const second = (first + 1) % 12;
  const firstDays = [...Array(DAYS_IN_MONTH[first] - 19).keys()].map((i) => i + 20); // 20..end
  const secondDays = [...Array(20).keys()].map((i) => i + 1); // 1..20
  return [
    { name: MONTHS[first], key: String(first), days: firstDays },
    { name: MONTHS[second], key: String(second), days: secondDays },
  ];
});

function pick(month, d) {
  model.value = `${month.key}-${d}`; // e.g. "3-21" → April 21
  emit('next');
}
</script>