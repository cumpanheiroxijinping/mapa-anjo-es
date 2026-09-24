<template>
  <div class="page-wrapper">
    <div class="background-image-sign">
      <img src="/bg_divino.jpg" fetchpriority="low" decoding="async" alt="" style="filter: brightness(0.9)" />
    </div>

    <div class="container">
      <!-- LANDING HEADLINE -->
      <section class="eh90427" v-show="stage === 'landing'">
        <div class="hf-4920" style="padding-top: 200px;">
          <div class="alerta-vibracional">
            <span class="alerta-icon">⚠️</span>
            <span class="alerta-text">Alerta Vibracional</span>
            <span class="alerta-icon">⚠️</span>
          </div>
          <h1 class="titulo-principal">¿Tu Ángel está tratando de hablar, pero tu radio está apagada?</h1>
          <h2 class="subtitulo-principal">Esta prueba de 30 segundos te revela tu Ángel de la Guarda y te sintoniza con él</h2>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <button class="button-form pulsating-button" @click="stage = 'quiz'">Comenzar la prueba</button>
        </div>
      </section>

      <!-- QUIZ (8 steps) -->
      <section v-show="stage === 'quiz'">
        <QuizFlow @complete="onQuizComplete" />
      </section>

      <!-- VSL 1 -->
      <section v-show="stage === 'vsl1'">
        <h2 class="subtitulo-principal" style="text-align:center;">Tu lectura personalizada está cargando…</h2>
        <VturbVideo :cfg="config.VSL1_VTURB" />
      </section>

      <!-- VSL 2 -->
      <section v-show="stage === 'vsl2'">
        <h2 class="subtitulo-principal" style="text-align:center;">Aquí está el mensaje de tu Ángel…</h2>
        <VturbVideo :cfg="config.VSL2_VTURB" />
      </section>

      <!-- ALERT MODAL -->
      <AlertModal :open="stage === 'alert'" @continue="stage = 'cta'" />

      <!-- FINAL CTA -->
      <section v-show="stage === 'cta'" style="text-align:center; padding: 40px 0 80px;">
        <h1 class="titulo-principal">Tu Mapa del Ángel de la Guarda está listo</h1>
        <p class="subtitulo-principal">Desbloquea tu lectura completa ahora mismo.</p>
        <FinalCta />
      </section>
    </div>

    <!-- EMAIL CAPTURE OVERLAY (over VSL1 at 5:04) -->
    <EmailCaptureOverlay :open="stage === 'vsl1' && emailOpen" :first-name="quizAnswers.first_name" @captured="onEmailCaptured" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import QuizFlow from '../components/QuizFlow.vue';
import VturbVideo from '../components/VturbVideo.vue';
import AlertModal from '../components/AlertModal.vue';
import FinalCta from '../components/FinalCta.vue';
import EmailCaptureOverlay from '../components/EmailCaptureOverlay.vue';
import { config } from '../config.js';
import { track } from '../composables/useAnalytics.js';
import { submitLead } from '../composables/useLead.js';

const stage = ref('landing'); // landing | quiz | vsl1 | vsl2 | alert | cta
const emailOpen = ref(false);
const quizAnswers = ref({});

let captureTimer = null;

function onQuizComplete(answers) {
  quizAnswers.value = answers;
  track('quiz_completed', { sign: answers.zodiac_sign });
  // Persist full quiz answers as a lead (no email yet → Brevo skips, Postgres stores if email present;
  // we wait for email at 5:04, but store partial now too).
  stage.value = 'vsl1';
}

// Start the email-capture timer only when VSL1 becomes visible (not on page load,
// since the section uses v-show and is mounted before the user reaches it).
watch(stage, (next) => {
  if (captureTimer) {
    clearTimeout(captureTimer);
    captureTimer = null;
  }
  if (next === 'vsl1') {
    captureTimer = setTimeout(() => {
      emailOpen.value = true;
      track('video_interaction', { vsl: 1, moment: 'email_capture_shown' });
    }, config.EMAIL_CAPTURE_AT_SEC * 1000);
  }
});

async function onEmailCaptured(email) {
  emailOpen.value = false;
  // Re-submit full quiz payload now that we have the email.
  await submitLead({ email, ...quizAnswers.value, source: 'vsl1_email_capture' });
  track('lead_conversion', { email, source: 'vsl1_email_capture_full' });
  stage.value = 'vsl2';
}

// --- Back-redirect / exit-intent (replicates original history.pushState + onpopstate) ---
function onPopState() {
  // Throwing the user to /brd retention when they try to leave the funnel.
  window.location.href = '/brd';
}
onMounted(() => {
  history.pushState(null, null, location.href);
  window.addEventListener('popstate', onPopState);
});
onBeforeUnmount(() => {
  if (captureTimer) clearTimeout(captureTimer);
  window.removeEventListener('popstate', onPopState);
});
</script>
