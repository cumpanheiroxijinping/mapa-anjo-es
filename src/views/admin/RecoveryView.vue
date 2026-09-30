<template>
  <div>
    <p v-if="error" class="err">{{ error }}</p>

    <h2 class="section-title">Recuperación — fila activa
      <label style="float: right; font-size: 12px; color: var(--text-dim); font-weight: 400; cursor: pointer;">
        <input type="checkbox" v-model="includeTest" @change="load" /> Mostrar testes
      </label>
    </h2>
    <DataTable :columns="recCols" :rows="recoveryQueue" :rowKey="'email'" emptyText="Sin recuperaciones activas.">
      <template #cell-pending="{ row }">
        <span v-for="(p, j) in (row.pending || [])" :key="j" class="badge" style="margin-right: 6px;">
          {{ p.template }} · {{ fmt(p.send_at) }}
        </span>
      </template>
    </DataTable>

    <h2 class="section-title">Postbacks recientes</h2>
    <DataTable :columns="pbCols" :rows="postbacks" :rowKey="'code'" emptyText="Sin postbacks.">
      <template #cell-status="{ value }">
        <Badge :text="value" :variant="statusVariant(value)" />
      </template>
      <template #cell-processed_at="{ value }">{{ fmt(value) }}</template>
    </DataTable>

    <h2 class="section-title">Buscar leads</h2>
    <div class="filter-bar">
      <div class="field">Funnel stage<input v-model="leadFilter.funnel_stage" placeholder="CHECKOUT_NO_DATA" /></div>
      <div class="field">Main status<input v-model="leadFilter.main_product_status" placeholder="paid" /></div>
      <div class="field">Tag<input v-model="leadFilter.tag" placeholder="PAYMENT_FAILED" /></div>
      <div class="field">Buscar email<input v-model="leadFilter.search" placeholder="@dominio" /></div>
      <div class="field"><button class="btn" @click="searchLeads">Buscar</button></div>
    </div>
    <DataTable :columns="leadCols" :rows="monitorLeads" :rowKey="'email'" emptyText="Sin resultados." />

    <h2 class="section-title">Disparar por evento</h2>
    <div class="filter-bar">
      <div class="field">Modo
        <select v-model="triggerForm.mode">
          <option value="reapply">Reaplicar evento (reinicia F/G)</option>
          <option value="resend">Reenviar template</option>
        </select>
      </div>
      <template v-if="triggerForm.mode === 'reapply'">
        <div class="field">Evento
          <select v-model="triggerForm.event">
            <option value="abandonment">abandonment → F</option>
            <option value="rejected">rejected → G</option>
            <option value="canceled">canceled → G</option>
          </select>
        </div>
        <div class="field">Segmento
          <select v-model="triggerForm.segment">
            <option value="todos">Todos los leads</option>
            <option value="tag">Solo tag</option>
          </select>
        </div>
        <div class="field" v-if="triggerForm.segment === 'tag'">Tag<input v-model="triggerForm.tag" placeholder="PAYMENT_FAILED" /></div>
      </template>
      <template v-else>
        <div class="field">Tag<input v-model="triggerForm.tag" placeholder="PAYMENT_FAILED" /></div>
        <div class="field">Template<input v-model="triggerForm.template" placeholder="payment_failed_1" /></div>
      </template>
      <div class="field"><button class="btn primary" @click="runTrigger">Disparar</button></div>
    </div>
    <p v-if="triggerMsg" class="muted">{{ triggerMsg }}</p>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import DataTable from '../../components/admin/DataTable.vue';
import Badge from '../../components/admin/Badge.vue';
import { monitorApi } from '../../composables/useApi.js';

const includeTest = ref(false);

const recCols = [
  { key: 'email', label: 'Email', mono: true },
  { key: 'automation_key', label: 'Auto' },
  { key: 'pending', label: 'Pendientes' },
];
const pbCols = [
  { key: 'code', label: 'Code' },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Status' },
  { key: 'mapped_event', label: 'Evento' },
  { key: 'processed_at', label: 'Cuándo' },
];
const leadCols = [
  { key: 'email', label: 'Email', mono: true },
  { key: 'funnel_stage', label: 'Stage' },
  { key: 'main_product_status', label: 'Status' },
  { key: 'primary_challenge', label: 'Desafío' },
  { key: 'suppression_recovery', label: 'Supp' },
];

const error = ref('');
const recoveryQueue = ref([]);
const postbacks = ref([]);
const monitorLeads = ref([]);
const leadFilter = reactive({ funnel_stage: '', main_product_status: '', tag: '', search: '' });
const triggerForm = reactive({ mode: 'reapply', event: 'abandonment', segment: 'todos', tag: '', template: '' });
const triggerMsg = ref('');

function statusVariant(s) {
  if (['approved'].includes(s)) return 'green';
  if (['rejected', 'canceled', 'chargeback'].includes(s)) return 'red';
  if (['pending', 'abandonment'].includes(s)) return 'amber';
  return '';
}
function fmt(ts) { return ts ? new Date(ts).toLocaleString() : ''; }

async function load() {
  error.value = '';
  try {
    const q = includeTest.value ? '?includeTest=1' : '';
    const [r, p] = await Promise.all([monitorApi.recovery(q), monitorApi.postbacks(q)]);
    recoveryQueue.value = r.queue || [];
    postbacks.value = p.postbacks || [];
  } catch (e) {
    if (e.code === 401) error.value = 'Sesión expirada.';
    else error.value = e.message;
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
    monitorLeads.value = r.leads || [];
  } catch (e) { error.value = e.message; }
}

async function runTrigger() {
  triggerMsg.value = '';
  try {
    const payload = { ...triggerForm };
    if (payload.segment === 'todos') delete payload.tag;
    const res = await monitorApi.triggerEvent(payload);
    triggerMsg.value = `${res.targets} lead(s) en cola (${res.mode}).`;
  } catch (e) { triggerMsg.value = 'Error: ' + e.message; }
}

onMounted(load);
</script>
