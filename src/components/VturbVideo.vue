<template>
  <div class="vturb-wrap">
    <vturb-smartplayer
      :id="cfg.id"
      style="display: block; margin: 0 auto; width: 100%; max-width: 400px;"
    >
      <div
        class="vturb-player-placeholder"
        :style="{
          position: 'relative',
          width: '100%',
          padding: cfg.placeholderPadding + '% 0 0',
          zIndex: 0,
          backgroundColor: 'black',
        }"
      ></div>
    </vturb-smartplayer>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { config } from '../config.js';
import { fireEvent } from '../composables/useEvent.js';

const props = defineProps({
  cfg: { type: Object, required: true },
  // 'vsl1' | 'vsl2' — selects which event taxonomy to emit (spec §4).
  keyName: { type: String, default: 'vsl1' },
});
const emit = defineEmits(['ready']);

function injectPlayerScript() {
  // Avoid injecting the same player.js twice.
  if (document.querySelector(`script[data-vturb="${props.cfg.playerId}"]`)) return;
  const s = document.createElement('script');
  s.type = 'text/javascript';
  s.async = true;
  s.src = props.cfg.scriptSrc;
  s.setAttribute('data-vturb', props.cfg.playerId);
  document.head.appendChild(s);
}

// --- Progress emission -----------------------------------------------------
// We emit started + 25/50/75 percent events. Since the player runs in a
// cross-origin iframe, we can't read currentTime directly; we (a) listen for
// any native VTurb/smartplayer window events if the player broadcasts them,
// and (b) fall back to a wall-clock estimate based on a nominal duration so
// the automation still receives stage signals if no native event fires.
const VSL_DURATION_SEC = 360; // nominal; adjust per real video length
const milestones = [25, 50, 75];
const firedMilestones = new Set();
let startTs = null;
let timer = null;

function prefix() {
  return props.keyName === 'vsl2' ? 'vsl2' : 'vsl1';
}

function emitStarted() {
  fireEvent(`${prefix()}_started`, { playerId: props.cfg.playerId }, { dedupe: true }).catch(() => {});
}

function emitMilestone(pct) {
  fireEvent(`${prefix()}_${pct}`, { percent: pct }, { dedupe: true }).catch(() => {});
  if (pct >= 50 && props.keyName === 'vsl2') {
    // 50% of VSL2 is a strong "offer reached" proxy per spec §5.
    fireEvent('vsl2_offer_reached', { proxy: '50pct' }, { dedupe: true }).catch(() => {});
  }
}

// Native player event bridge (best-effort). ConverteAI/VTurb may post
// `smartplayer` messages or dispatch a custom event; we listen broadly.
function onPlayerMessage(ev) {
  let data = ev.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return; }
  }
  if (!data || typeof data !== 'object') return;
  const type = (data.event || data.type || '').toString().toLowerCase();
  if (type.includes('play') && startTs === null) {
    startTs = Date.now();
    emitStarted();
  } else if (type.includes('progress') && typeof data.percent === 'number') {
    for (const m of milestones) {
      if (data.percent >= m && !firedMilestones.has(m)) {
        firedMilestones.add(m);
        emitMilestone(m);
      }
    }
  }
}

function startFallbackTimer() {
  timer = setInterval(() => {
    if (startTs === null) return;
    const elapsed = (Date.now() - startTs) / 1000;
    const pct = Math.min(100, Math.round((elapsed / VSL_DURATION_SEC) * 100));
    for (const m of milestones) {
      if (pct >= m && !firedMilestones.has(m)) {
        firedMilestones.add(m);
        emitMilestone(m);
      }
    }
  }, 5000);
}

onMounted(() => {
  emit('ready');
  injectPlayerScript();
  // Emit started shortly after mount (player likely autoplays).
  setTimeout(() => {
    if (startTs === null) {
      startTs = Date.now();
      emitStarted();
      startFallbackTimer();
    }
  }, 1500);
  window.addEventListener('message', onPlayerMessage);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  window.removeEventListener('message', onPlayerMessage);
});
</script>

<style scoped>
.vturb-wrap {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}
</style>
