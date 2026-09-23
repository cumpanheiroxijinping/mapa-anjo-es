<template>
  <div class="quiz-flow">
    <div class="progress-container">
      <div class="progress-step-text">Paso {{ current + 1 }} de {{ steps.length }}</div>
      <div class="progress-bar-top">
        <div class="progress-bar-fill" :style="{ width: pct + '%' }"></div>
      </div>
    </div>

    <div class="form-modal-og">
      <div class="form-container">
        <component
          :is="steps[current].component"
          v-model="answers[steps[current].key]"
          :sign="steps[current].key === 'birth_day' ? answers.zodiac_sign : undefined"
          :decade="steps[current].key === 'birth_year' ? answers.birth_decade : undefined"
          @next="advance"
          @back="goBack"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import StepSign from './steps/StepSign.vue';
import StepBirthDay from './steps/StepBirthDay.vue';
import StepBirthDecade from './steps/StepBirthDecade.vue';
import StepBirthYear from './steps/StepBirthYear.vue';
import StepCivil from './steps/StepCivil.vue';
import StepChallenge from './steps/StepChallenge.vue';
import StepGender from './steps/StepGender.vue';
import StepName from './steps/StepName.vue';
import { track } from '../composables/useAnalytics.js';

const emit = defineEmits(['complete']);
const answers = ref({});
const current = ref(0);

// Exact original order (8 steps):
// 1 Signo → 2 Día de Nacimiento → 3 Década → 4 Año → 5 Estado Civil →
// 6 Desafío → 7 Sexo → 8 Primer Nombre
const steps = [
  { key: 'zodiac_sign', component: StepSign },
  { key: 'birth_day', component: StepBirthDay },
  { key: 'birth_decade', component: StepBirthDecade },
  { key: 'birth_year', component: StepBirthYear },
  { key: 'civil_status', component: StepCivil },
  { key: 'life_challenge', component: StepChallenge },
  { key: 'gender', component: StepGender },
  { key: 'first_name', component: StepName },
];

const pct = computed(() => Math.round(((current.value + 1) / steps.length) * 100));

function advance() {
  const key = steps[current.value].key;
  const val = answers.value[key];
  track('quiz_progress', { step: current.value + 1, key, value: val });
  if (key === 'gender') track('sex_selected', { gender: val });
  if (current.value < steps.length - 1) {
    current.value += 1;
  } else {
    emit('complete', { ...answers.value });
  }
}

function goBack() {
  if (current.value > 0) {
    current.value -= 1;
    track('quiz_back', { step: current.value + 1 });
  }
}
</script>

<style scoped>
.quiz-flow { width: 100%; }
</style>