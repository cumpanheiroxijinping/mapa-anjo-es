<template>
  <div class="dash">
    <!-- Token gate -->
    <div v-if="!authed" class="gate">
      <div class="gate-card">
        <h1>🔐 Panel del Ángel</h1>
        <p>Introduce el token de administrador para acceder al panel de email.</p>
        <input
          v-model="tokenInput"
          type="password"
          placeholder="ADMIN_TOKEN"
          @keyup.enter="login"
        />
        <button @click="login">Entrar</button>
        <p v-if="gateError" class="err">{{ gateError }}</p>
      </div>
    </div>

    <!-- Dashboard -->
    <div v-else class="content">
      <header class="topbar">
        <h1>📧 Panel de Email — Mapa del Ángel</h1>
        <button class="ghost" @click="logout">Salir</button>
      </header>

      <div class="tabs">
        <button :class="{ active: tab === 'email' }" @click="tab = 'email'">Email</button>
        <button :class="{ active: tab === 'recovery' }" @click="switchTab('recovery')">Recuperación</button>
      </div>

      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="loading" class="muted">Cargando…</p>

      <!-- Email tab -->
      <div v-if="tab === 'email'">
      <!-- Summary cards -->
      <section v-if="summary" class="cards">
        <div class="card"><span class="label">Enviados</span><b>{{ summary.total_sent }}</b></div>
        <div class="card"><span class="label">Contactos</span><b>{{ summary.unique_contacts }}</b></div>
        <div class="card"><span class="label">Aperturas</span><b>{{ summary.unique_opens }} <small>({{ summary.open_rate }}%)</small></b></div>
        <div class="card"><span class="label">Clics</span><b>{{ summary.unique_clicks }} <small>({{ summary.click_rate }}%)</small></b></div>
        <div class="card"><span class="label">Bounces</span><b>{{ summary.unique_bounced }} <small>({{ summary.bounce_rate }}%)</small></b></div>
        <div class="card"><span class="label">Unsubs</span><b>{{ summary.unique_unsubscribed }} <small>({{ summary.unsubscribe_rate }}%)</small></b></div>
      </section>

      <div class="cols">
        <!-- Left: campaigns + create form -->
        <div class="col">
          <h2>Campañas</h2>
          <div v-if="campaignMetrics.length === 0" class="muted">Sin campañas todavía.</div>
          <div v-for="c in campaignMetrics" :key="c.campaign_id" class="campaign">
            <div class="campaign-head">
              <div>
                <strong>{{ c.name }}</strong>
                <span class="tag" :class="c.status">{{ c.status }}</span>
                <small class="muted"> · {{ c.template }}</small>
              </div>
              <div class="actions">
                <button v-if="c.status === 'running' || c.status === 'queued'" @click="act(c.campaign_id, 'pause')">Pausar</button>
                <button v-if="c.status === 'paused'" @click="act(c.campaign_id, 'resume')">Reanudar</button>
                <button v-if="c.status !== 'cancelled' && c.status !== 'done'" @click="act(c.campaign_id, 'cancel')">Cancelar</button>
                <button @click="act(c.campaign_id, 'retry-failed')">Reenviar fallidos</button>
              </div>
            </div>
            <div class="bar">
              <div class="fill" :style="{ width: progress(c) + '%' }"></div>
            </div>
            <small class="muted">
              enviados {{ c.total_sent }} · aperturas {{ c.unique_opens }} ({{ c.open_rate }}%) ·
              clics {{ c.unique_clicks }} ({{ c.click_rate }}%) · fallidos {{ c.queued_failed }}
            </small>
          </div>

          <h2>Crear campaña</h2>
          <form class="form" @submit.prevent="createCampaign">
            <label>Nombre<input v-model="form.name" required /></label>
            <label>Plantilla
              <select v-model="form.template" required>
                <option v-for="t in templates" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <div class="row">
              <label>Signo<input v-model="form.segment.zodiac_sign" placeholder="Piscis" /></label>
              <label>Género<input v-model="form.segment.gender" placeholder="femenino" /></label>
              <label>Estado civil<input v-model="form.segment.civil_status" placeholder="soltera" /></label>
            </div>
            <div class="row">
              <label>Edad mín.<input v-model="form.segment.min_age" type="number" /></label>
              <label>Edad máx.<input v-model="form.segment.max_age" type="number" /></label>
              <label>Desde (YYYY-MM-DD)<input v-model="form.segment.created_since" placeholder="2026-01-01" /></label>
            </div>
            <div class="row">
              <label>utm_source<input v-model="form.segment.utm_source" /></label>
              <label>utm_medium<input v-model="form.segment.utm_medium" /></label>
              <label>utm_campaign<input v-model="form.segment.utm_campaign" /></label>
            </div>
            <div class="form-actions">
              <button type="submit" :disabled="creating">Crear y enviar</button>
              <button type="button" class="ghost" @click="openPreview">Vista previa</button>
            </div>
            <p v-if="createMsg" class="muted">{{ createMsg }}</p>
          </form>

          <!-- Preview modal -->
          <div v-if="preview" class="modal" @click.self="preview = null">
            <div class="modal-box">
              <div class="modal-head">
                <strong>Vista previa: {{ preview.name }}</strong>
                <button class="ghost" @click="preview = null">Cerrar</button>
              </div>
              <div class="preview-meta">
                Asunto: <b>{{ preview.subject }}</b><br />
                De: {{ preview.from?.name }} &lt;{{ preview.from?.email }}&gt;
              </div>
              <iframe class="preview-frame" :srcdoc="preview.html"></iframe>
            </div>
          </div>
        </div>

        <!-- Right: recent events -->
        <div class="col">
          <h2>Eventos recientes</h2>
          <div v-if="events.length === 0" class="muted">Sin eventos.</div>
          <table v-else class="events">
            <thead>
              <tr><th>Tipo</th><th>Email</th><th>Plantilla</th><th>Cuándo</th></tr>
            </thead>
            <tbody>
              <tr v-for="(e, i) in events" :key="i">
                <td><span class="tag" :class="e.event_type">{{ e.event_type }}</span></td>
                <td>{{ e.email }}</td>
                <td>{{ e.template }}</td>
                <td class="muted">{{ fmt(e.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </div>

      <!-- Recovery tab -->
      <div v-else-if="tab === 'recovery'">
        <h2>Recuperación — fila activa</h2>
        <div v-if="recoveryQueue.length === 0" class="muted">Sin recuperaciones activas.</div>
        <table v-else class="events">
          <thead>
            <tr><th>Email</th><th>Auto</th><th>Pendientes</th></tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in recoveryQueue" :key="i">
              <td>{{ r.email }}</td>
              <td><span class="tag">{{ r.automation_key }}</span></td>
              <td>
                <span v-for="(p, j) in r.pending" :key="j" class="tag">
                  {{ p.template }} · {{ fmt(p.send_at) }} · {{ p.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <h2>Postbacks recientes</h2>
        <div v-if="postbacks.length === 0" class="muted">Sin postbacks.</div>
        <table v-else class="events">
          <thead>
            <tr><th>Code</th><th>Email</th><th>Status</th><th>Evento</th><th>Cuándo</th></tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in postbacks" :key="i">
              <td>{{ p.code }}</td>
              <td>{{ p.email }}</td>
              <td><span class="tag" :class="p.status">{{ p.status }}</span></td>
              <td>{{ p.mapped_event }}</td>
              <td class="muted">{{ fmt(p.processed_at) }}</td>
            </tr>
          </tbody>
        </table>

        <h2>Buscar leads</h2>
        <div class="form">
          <label>Funnel stage<input v-model="leadFilter.funnel_stage" placeholder="CHECKOUT_NO_DATA" /></label>
          <label>Main status<input v-model="leadFilter.main_product_status" placeholder="paid" /></label>
          <label>Tag<input v-model="leadFilter.tag" placeholder="PAYMENT_FAILED" /></label>
          <label>Buscar email<input v-model="leadFilter.search" placeholder="@dominio" /></label>
          <div class="form-actions">
            <button type="button" @click="searchLeads">Buscar</button>
          </div>
        </div>
        <div v-if="monitorLeads.length" class="muted">{{ monitorLeads.length }} lead(s)</div>
        <table v-if="monitorLeads.length" class="events">
          <thead>
            <tr><th>Email</th><th>Stage</th><th>Status</th><th>Challenge</th><th>Supp</th></tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in monitorLeads" :key="i">
              <td>{{ l.email }}</td>
              <td>{{ l.funnel_stage }}</td>
              <td>{{ l.main_product_status }}</td>
              <td>{{ l.primary_challenge || '-' }}</td>
              <td>{{ l.suppression_recovery ? 'R' : '' }}</td>
            </tr>
          </tbody>
        </table>

        <h2>Disparar por evento</h2>
        <div class="form">
          <label>Modo
            <select v-model="triggerForm.mode">
              <option value="reapply">Reaplicar evento (reinicia F/G)</option>
              <option value="resend">Reenviar template</option>
            </select>
          </label>
          <template v-if="triggerForm.mode === 'reapply'">
            <label>Evento
              <select v-model="triggerForm.event">
                <option value="abandonment">abandonment → F</option>
                <option value="rejected">rejected → G</option>
                <option value="canceled">canceled → G</option>
              </select>
            </label>
            <label>Segmento
              <select v-model="triggerForm.segment">
                <option value="todos">Todos los leads</option>
                <option value="tag">Solo tag</option>
              </select>
            </label>
            <label v-if="triggerForm.segment === 'tag'">Tag<input v-model="triggerForm.tag" placeholder="PAYMENT_FAILED" /></label>
          </template>
          <template v-else>
            <label>Tag<input v-model="triggerForm.tag" placeholder="PAYMENT_FAILED" /></label>
            <label>Template<input v-model="triggerForm.template" placeholder="payment_failed_1" /></label>
          </template>
          <div class="form-actions">
            <button type="button" @click="runTrigger">Disparar</button>
          </div>
          <p v-if="triggerMsg" class="muted">{{ triggerMsg }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import { api, monitorApi, getToken, setToken } from '../composables/useApi.js';

const authed = ref(!!getToken());
const tokenInput = ref('');
const gateError = ref('');

const tab = ref('email');
const loading = ref(false);
const error = ref('');
const summary = ref(null);
const campaignMetrics = ref([]);
const events = ref([]);
const templates = ref([]);

const recoveryQueue = ref([]);
const postbacks = ref([]);
const monitorLeads = ref([]);
const leadFilter = reactive({ funnel_stage: '', main_product_status: '', tag: '', search: '' });
const triggerForm = reactive({ mode: 'reapply', event: 'abandonment', segment: 'todos', tag: '', template: '' });
const triggerMsg = ref('');

const form = reactive({
  name: '',
  template: '',
  segment: {
    zodiac_sign: '', gender: '', civil_status: '',
    min_age: '', max_age: '', created_since: '',
    utm_source: '', utm_medium: '', utm_campaign: '',
  },
});
const creating = ref(false);
const createMsg = ref('');
const preview = ref(null);

function login() {
  if (!tokenInput.value) {
    gateError.value = 'Token requerido';
    return;
  }
  setToken(tokenInput.value);
  authed.value = true;
  gateError.value = '';
  loadAll();
}
function logout() {
  setToken('');
  authed.value = false;
}

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    const [s, cm, ev, t] = await Promise.all([
      api.summary(),
      api.metricsByCampaign(),
      api.recentEvents(40),
      api.listTemplates(),
    ]);
    summary.value = s.summary;
    campaignMetrics.value = cm.campaigns;
    events.value = ev.events;
    templates.value = t.templates;
    if (!form.template && templates.value.length) form.template = templates.value[0];
  } catch (e) {
    if (e.code === 401) {
      logout();
      gateError.value = 'Token inválido';
    } else {
      error.value = e.message;
    }
  } finally {
    loading.value = false;
  }
}

function progress(c) {
  const total = c.total_sent + (c.queued_failed || 0);
  if (!total) return 0;
  return Math.round((c.total_sent / total) * 100);
}

async function act(id, action) {
  error.value = '';
  try {
    await api.campaignAction(id, action);
    await loadAll();
  } catch (e) {
    error.value = e.message;
  }
}

async function createCampaign() {
  creating.value = true;
  createMsg.value = '';
  // Strip empty segment keys.
  const segment = {};
  for (const [k, v] of Object.entries(form.segment)) {
    if (v !== '' && v !== null && v !== undefined) segment[k] = v;
  }
  try {
    const r = await api.createCampaign({ name: form.name, template: form.template, segment });
    createMsg.value = `Campaña creada. ${r.enqueued} destinatarios en cola.`;
    // reset
    form.name = '';
    for (const k of Object.keys(form.segment)) form.segment[k] = '';
    await loadAll();
  } catch (e) {
    createMsg.value = 'Error: ' + e.message;
  } finally {
    creating.value = false;
  }
}

async function openPreview() {
  if (!form.template) return;
  try {
    preview.value = await api.previewTemplate(form.template);
  } catch (e) {
    error.value = e.message;
  }
}

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString();
}

async function switchTab(t) {
  tab.value = t;
  if (t === 'recovery') await loadMonitor();
}

async function loadMonitor() {
  loading.value = true;
  error.value = '';
  try {
    const [r, p] = await Promise.all([monitorApi.recovery(), monitorApi.postbacks()]);
    recoveryQueue.value = r.queue;
    postbacks.value = p.postbacks;
  } catch (e) {
    if (e.code === 401) { logout(); gateError.value = 'Token inválido'; }
    else error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function searchLeads() {
  error.value = '';
  try {
    const params = new URLSearchParams();
    if (leadFilter.funnel_stage) params.set('funnel_stage', leadFilter.funnel_stage);
    if (leadFilter.main_product_status) params.set('main_product_status', leadFilter.main_product_status);
    if (leadFilter.tag) params.set('tag', leadFilter.tag);
    if (leadFilter.search) params.set('search', leadFilter.search);
    const r = await monitorApi.leads('?' + params.toString());
    monitorLeads.value = r.leads;
  } catch (e) {
    error.value = e.message;
  }
}

async function runTrigger() {
  triggerMsg.value = '';
  try {
    const payload = { ...triggerForm };
    if (payload.segment === 'todos') delete payload.tag;
    const res = await monitorApi.triggerEvent(payload);
    triggerMsg.value = `${res.targets} lead(s) en cola (${res.mode}). Procesando en segundo plano.`;
  } catch (e) {
    triggerMsg.value = 'Error: ' + e.message;
  }
}

onMounted(() => {
  if (authed.value) loadAll();
});
</script>

<style scoped>
.dash { min-height: 100vh; color: #fff; }
.gate { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.gate-card { background: #121a33; padding: 32px; border-radius: 12px; width: 340px; text-align: center; }
.gate-card input { width: 100%; padding: 10px; margin: 12px 0; border-radius: 8px; border: 1px solid #2a3350; background: #0b1020; color: #fff; }
.gate-card button { width: 100%; padding: 10px; border: 0; border-radius: 8px; background: #f4d58d; color: #0b1020; font-weight: 700; cursor: pointer; }
.content { max-width: 1100px; margin: 0 auto; padding: 24px; }
.tabs { display: flex; gap: 8px; margin: 16px 0; }
.tabs button { padding: 8px 16px; border: 1px solid #2a3350; background: #121a33; color: #cdd3e6; border-radius: 8px; cursor: pointer; font-size: 14px; }
.tabs button.active { background: #f4d58d; color: #0b1020; font-weight: 700; border-color: #f4d58d; }
.topbar { display: flex; justify-content: space-between; align-items: center; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; }
.card { background: #121a33; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.card .label { font-size: 12px; color: #9aa0b5; }
.card b { font-size: 22px; }
.card small { color: #9aa0b5; font-weight: 400; }
.cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px; }
@media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
.col h2 { margin: 18px 0 10px; font-size: 18px; }
.campaign { background: #121a33; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
.campaign-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.actions button { background: #1e2a4d; color: #fff; border: 1px solid #2a3350; border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 12px; }
.actions button:hover { background: #2a3a66; }
.bar { height: 8px; background: #0b1020; border-radius: 6px; margin: 10px 0 6px; overflow: hidden; }
.fill { height: 100%; background: #f4d58d; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; margin-left: 6px; background: #2a3350; color: #cdd3e6; }
.tag.running, .tag.open { background: #1f6f43; color: #d7ffe6; }
.tag.paused { background: #6f5a1f; color: #fff2cc; }
.tag.cancelled, .tag.failed, .tag.hard_bounce, .tag.soft_bounce { background: #6f1f2b; color: #ffd7dd; }
.tag.done, .tag.delivered { background: #1f4f6f; color: #d7f0ff; }
.tag.unsubscribed, .tag.complaint { background: #5a1f6f; color: #f2d7ff; }
.tag.click { background: #1f3a6f; color: #d7e2ff; }
.form { background: #121a33; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.form label { display: flex; flex-direction: column; font-size: 12px; color: #9aa0b5; gap: 4px; }
.form input, .form select { padding: 8px; border-radius: 6px; border: 1px solid #2a3350; background: #0b1020; color: #fff; font-size: 14px; }
.row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.form-actions { display: flex; gap: 10px; }
.form button, .topbar button { padding: 10px 16px; border: 0; border-radius: 8px; background: #f4d58d; color: #0b1020; font-weight: 700; cursor: pointer; }
.form button:disabled { opacity: 0.6; cursor: default; }
button.ghost { background: transparent; border: 1px solid #2a3350; color: #cdd3e6; font-weight: 400; }
.events { width: 100%; border-collapse: collapse; font-size: 13px; }
.events th, .events td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #1e2a4d; }
.events th { color: #9aa0b5; font-weight: 500; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 50; }
.modal-box { background: #fff; color: #111; border-radius: 10px; width: 90%; max-width: 700px; max-height: 90vh; display: flex; flex-direction: column; }
.modal-head { display: flex; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #eee; }
.preview-meta { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #eee; }
.preview-frame { flex: 1; border: 0; width: 100%; min-height: 60vh; }
.muted { color: #9aa0b5; font-size: 13px; }
.err { color: #ff8a9b; font-size: 13px; }
</style>
