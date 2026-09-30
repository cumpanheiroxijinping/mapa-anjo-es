<template>
  <div>
    <section v-if="summary" class="stats-grid">
      <StatCard label="Enviados" :value="summary.total_sent" />
      <StatCard label="Contactos" :value="summary.unique_contacts" />
      <StatCard label="Aperturas" :value="summary.unique_opens" />
      <StatCard label="Clics" :value="summary.unique_clicks" />
      <StatCard label="Bounces" :value="summary.unique_bounced" />
      <StatCard label="Unsubs" :value="summary.unique_unsubscribed" />
    </section>

    <div class="cols" style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px;">
      <div>
        <h2 class="section-title">Campañas</h2>
        <div v-if="!campaignMetrics.length" class="muted">Sin campañas todavía.</div>
        <div v-for="c in campaignMetrics" :key="c.campaign_id" class="stat-card" style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
            <div>
              <strong>{{ c.name }}</strong>
              <Badge :text="c.status" :variant="c.status" style="margin-left: 6px;" />
              <small class="muted"> · {{ c.template }}</small>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button v-if="['running','queued'].includes(c.status)" class="btn ghost" @click="act(c.campaign_id, 'pause')">Pausar</button>
              <button v-if="c.status === 'paused'" class="btn ghost" @click="act(c.campaign_id, 'resume')">Reanudar</button>
              <button v-if="!['cancelled','done'].includes(c.status)" class="btn ghost" @click="act(c.campaign_id, 'cancel')">Cancelar</button>
              <button class="btn ghost" @click="act(c.campaign_id, 'retry-failed')">Reenviar fallidos</button>
            </div>
          </div>
          <div class="badge" style="margin: 10px 0 6px; height: 8px; padding: 0; display: block; background: var(--bg-primary);">
            <div :style="{ width: progress(c) + '%' }" style="height: 100%; background: var(--accent-grad); border-radius: 6px;"></div>
          </div>
          <small class="muted">
            enviados {{ c.total_sent }} · aperturas {{ c.unique_opens }} · clics {{ c.unique_clicks }} · fallidos {{ c.queued_failed }}
          </small>
        </div>

        <h2 class="section-title">Crear campaña</h2>
        <div class="stat-card">
          <div class="filter-bar">
            <div class="field">Nombre<input v-model="form.name" /></div>
            <div class="field">Plantilla
              <select v-model="form.template">
                <option v-for="t in templates" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="field">Signo<input v-model="form.segment.zodiac_sign" placeholder="Piscis" /></div>
            <div class="field">Género<input v-model="form.segment.gender" placeholder="femenino" /></div>
            <div class="field">Estado civil<input v-model="form.segment.civil_status" placeholder="soltera" /></div>
            <div class="field">Edad mín.<input type="number" v-model="form.segment.min_age" /></div>
            <div class="field">Edad máx.<input type="number" v-model="form.segment.max_age" /></div>
            <div class="field">Desde<input v-model="form.segment.created_since" placeholder="2026-01-01" /></div>
            <div class="field">utm_source<input v-model="form.segment.utm_source" /></div>
            <div class="field">utm_medium<input v-model="form.segment.utm_medium" /></div>
            <div class="field">utm_campaign<input v-model="form.segment.utm_campaign" /></div>
            <div class="field" style="justify-content: flex-end;">
              <button class="btn primary" :disabled="creating" @click="createCampaign">Crear y enviar</button>
              <button class="btn ghost" @click="openPreview">Vista previa</button>
            </div>
          </div>
          <p v-if="createMsg" class="muted">{{ createMsg }}</p>
        </div>

        <Modal v-if="preview" :title="`Vista previa: ${preview.name}`" @close="preview = null">
          <div class="muted">Asunto: <b>{{ preview.subject }}</b><br />De: {{ preview.from?.name }} &lt;{{ preview.from?.email }}&gt;</div>
          <iframe class="preview-frame" :srcdoc="preview.html" style="width: 100%; min-height: 60vh; border: 0; margin-top: 12px; border-radius: 12px;"></iframe>
        </Modal>
      </div>

      <div>
        <h2 class="section-title">Eventos recientes</h2>
        <DataTable :columns="eventCols" :rows="events" :rowKey="''" emptyText="Sin eventos.">
          <template #cell-event_type="{ value }"><Badge :text="value" :variant="value" /></template>
          <template #cell-created_at="{ value }">{{ fmt(value) }}</template>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import StatCard from '../../components/admin/StatCard.vue';
import Badge from '../../components/admin/Badge.vue';
import DataTable from '../../components/admin/DataTable.vue';
import Modal from '../../components/admin/Modal.vue';
import { api } from '../../composables/useApi.js';

const eventCols = [
  { key: 'event_type', label: 'Tipo' },
  { key: 'email', label: 'Email', mono: true },
  { key: 'template', label: 'Plantilla' },
  { key: 'created_at', label: 'Cuándo' },
];

const summary = ref(null);
const campaignMetrics = ref([]);
const events = ref([]);
const templates = ref([]);
const error = ref('');
const creating = ref(false);
const createMsg = ref('');
const preview = ref(null);

const form = reactive({
  name: '', template: '',
  segment: { zodiac_sign: '', gender: '', civil_status: '', min_age: '', max_age: '', created_since: '', utm_source: '', utm_medium: '', utm_campaign: '' },
});

function fmt(ts) { return ts ? new Date(ts).toLocaleString() : ''; }
function progress(c) {
  const total = c.total_sent + (c.queued_failed || 0);
  return total ? Math.round((c.total_sent / total) * 100) : 0;
}

async function loadAll() {
  error.value = '';
  try {
    const [s, cm, ev, t] = await Promise.all([
      api.summary(), api.metricsByCampaign(), api.recentEvents(40), api.listTemplates(),
    ]);
    summary.value = s.summary;
    campaignMetrics.value = cm.campaigns;
    events.value = ev.events;
    templates.value = t.templates;
    if (!form.template && templates.value.length) form.template = templates.value[0];
  } catch (e) {
    if (e.code === 401) error.value = 'Sesión expirada.';
    else error.value = e.message;
  }
}

async function act(id, action) {
  error.value = '';
  try { await api.campaignAction(id, action); await loadAll(); }
  catch (e) { error.value = e.message; }
}

async function createCampaign() {
  creating.value = true;
  createMsg.value = '';
  const segment = {};
  for (const [k, v] of Object.entries(form.segment)) if (v !== '' && v != null) segment[k] = v;
  try {
    const r = await api.createCampaign({ name: form.name, template: form.template, segment });
    createMsg.value = `Campaña creada. ${r.enqueued} destinatarios en cola.`;
    form.name = '';
    for (const k of Object.keys(form.segment)) form.segment[k] = '';
    await loadAll();
  } catch (e) { createMsg.value = 'Error: ' + e.message; }
  finally { creating.value = false; }
}

async function openPreview() {
  if (!form.template) return;
  try { preview.value = await api.previewTemplate(form.template); }
  catch (e) { error.value = e.message; }
}

onMounted(loadAll);
</script>
