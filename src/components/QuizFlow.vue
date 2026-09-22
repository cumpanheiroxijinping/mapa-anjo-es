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
          @next="advance"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import StepSign from './steps/StepSign.vue';
import StepName from './steps/StepName.vue';
import StepGender from './steps/StepGender.vue';
import StepCivil from './steps/StepCivil.vue';
import StepBirthYear from './steps/StepBirthYear.vue';
import StepBirthDay from './steps/StepBirthDay.vue';
import StepChallenge from './steps/StepChallenge.vue';
import StepConfirm from './steps/StepConfirm.vue';
import { track } from '../composables/useAnalytics.js';

const emit = defineEmits(['complete']);
const answers = ref({});
const current = ref(0);

const steps = [
  { key: 'zodiac_sign', component: StepSign },
  { key: 'first_name', component: StepName },
  { key: 'gender', component: StepGender },
  { key: 'civil_status', component: StepCivil },
  { key: 'birth_year', component: StepBirthYear },
  { key: 'birth_day', component: StepBirthDay },
  { key: 'life_challenge', component: StepChallenge },
  { key: 'confirm', component: StepConfirm },
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
</script>

<style scoped>
.quiz-flow { width: 100%; }
</style>
