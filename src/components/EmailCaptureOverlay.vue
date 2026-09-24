<template>
  <div class="email-overlay" v-if="open">
    <div class="form-modal">
      <div class="hf-4920">
        <p class="section-p" style="color: white; text-align: center; font-family: Sora, serif; margin-top: 20px;">
          Ingresa tu <b>correo electrónico</b> para recibir el resto de tu <b>lectura personalizada...</b>
        </p>
      </div>
      <div class="form-content" style="min-height: 145px;">
        <h4 style="font-family: Sora, serif; color: white; text-align: center;">¿Cuál es tu Email?</h4>
        <div class="input-control">
          <input v-model="email" type="email" placeholder="Ingresa tu Email" autocomplete="email" class="field-input" @keyup.enter="submit" />
        </div>
        <p v-if="error" class="text-red-600 mt-2" style="color:#ff9b9b;text-align:center;">{{ error }}</p>
      </div>
      <div class="form-button" style="margin-bottom: 30px;">
        <button class="button-form pulsating-button" :disabled="!email" @click="submit">Haz clic para continuar</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { submitLead } from '../composables/useLead.js';
import { track } from '../composables/useAnalytics.js';

const props = defineProps({ open: { type: Boolean, default: false }, firstName: { type: String, default: '' } });
const emit = defineEmits(['captured']);
const email = ref('');
const error = ref('');

async function submit() {
  const value = (email.value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    error.value = 'Por favor, ingresa un email válido.';
    return;
  }
  error.value = '';
  // Capture lead (Brevo + Postgres). Pass the partial quiz answers so far.
  await submitLead({ email: value, first_name: props.firstName, source: 'vsl1_email_capture' });
  track('lead_conversion', { email: value, source: 'vsl1_email_capture' });
  emit('captured', value);
}
</script>

<style scoped>
.email-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}
/* Keep the modal centered and capped on wide screens */
.email-overlay :deep(.form-modal) {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
}
.email-overlay :deep(.field-input) {
  margin-left: auto;
  margin-right: auto;
}
/* Center the submit button inside the modal */
.email-overlay :deep(.form-button) {
  text-align: center;
}
</style>
