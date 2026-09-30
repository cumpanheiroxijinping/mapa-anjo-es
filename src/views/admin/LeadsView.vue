<template>
  <div>
    <label style="font-size: 12px; color: var(--text-dim); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; margin-bottom: 12px;">
      <input type="checkbox" v-model="includeTest" @change="load" /> Mostrar leads de teste (ex.: @test.com)
    </label>
    <div class="filter-bar">
      <div class="field">Buscar email/nome<input v-model="filters.search" @keyup.enter="load" placeholder="email@dominio" /></div>
      <div class="field">Signo
        <select v-model="filters.zodiac_sign" @change="load">
          <option value="">Todos</option>
          <option v-for="s in signs" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="field">Desafío
        <select v-model="filters.life_challenge" @change="load">
          <option value="">Todos</option>
          <option v-for="c in challenges" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="field">Género
        <select v-model="filters.gender" @change="load">
          <option value="">Todos</option>
          <option v-for="g in genders" :key="g" :value="g">{{ g }}</option>
        </select>
      </div>
      <div class="field">UTM source<input v-model="filters.utm_source" @keyup.enter="load" placeholder="facebook" /></div>
      <div class="field"><button class="btn" @click="load">Filtrar</button></div>
      <div class="field"><button class="btn ghost" @click="runDiagnostics">Diagnóstico</button></div>
      <div class="field"><button class="btn ghost" @click="checkVersion">Versión</button></div>
    </div>

    <div v-if="diag" class="stat-card" style="margin-bottom: 18px;">
      <div class="label">Contagem de registros por tabela</div>
      <pre class="muted" style="font-size: 12px; margin-top: 8px;">{{ JSON.stringify(diag.counts, null, 2) }}</pre>
    </div>
    <div v-if="version" class="stat-card" style="margin-bottom: 18px;">
      <div class="label">Versión del backend</div>
      <pre class="muted" style="font-size: 12px; margin-top: 8px;">{{ JSON.stringify(version) }}</pre>
    </div>

    <p v-if="error" class="err">{{ error }}</p>

    <DataTable :columns="columns" :rows="leads" :rowKey="'email'" emptyText="Sin leads.">
      <template #cell-email="{ value }">
        <span class="mono">{{ value }}</span>
      </template>
      <template #cell-created_at="{ value }">
        {{ fmt(value) }}
      </template>
      <template #actions="{ row }">
        <button class="btn ghost" @click="openDetail(row.email)">Ver</button>
      </template>
    </DataTable>

    <Pagination :page="page" :total="total" :limit="limit" @change="(p) => { page = p; load(); }" />

    <Modal v-if="detail" :title="`Lead: ${detail.state?.email}`" @close="detail = null">
      <template v-if="detail.state">
        <div class="section-title">Estado de contacto</div>
        <DataTable :columns="stateCols" :rows="[detail.state]" />
        <div class="section-title">Automatizaciones activas</div>
        <div class="muted">{{ detail.active_automations?.length ? detail.active_automations.join(', ') : 'Ninguna' }}</div>
        <div class="section-title">Transacciones</div>
        <DataTable :columns="txCols" :rows="detail.transactions || []" emptyText="Sin transacciones." />
        <div class="section-title">Eventos recientes</div>
        <DataTable :columns="eventCols" :rows="(detail.events || []).slice(0, 20)" emptyText="Sin eventos." />
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import DataTable from '../../components/admin/DataTable.vue';
import Modal from '../../components/admin/Modal.vue';
import Pagination from '../../components/admin/Pagination.vue';
import { leadsApi } from '../../composables/useApi.js';

const signs = ['Aries', 'Tauro', 'Géminis', 'Cáncer', 'Leo', 'Virgo', 'Libra', 'Escorpio', 'Sagitario', 'Capricornio', 'Acuario', 'Piscis'];
const challenges = ['love', 'finance', 'health', 'happiness'];
const genders = ['femenino', 'masculino', 'outro'];

const filters = reactive({ search: '', zodiac_sign: '', life_challenge: '', gender: '', utm_source: '' });
const columns = [
  { key: 'first_name', label: 'Nombre' },
  { key: 'email', label: 'Email', mono: true },
  { key: 'zodiac_sign', label: 'Signo' },
  { key: 'life_challenge', label: 'Desafío' },
  { key: 'gender', label: 'Género' },
  { key: 'utm_source', label: 'UTM' },
  { key: 'created_at', label: 'Criado' },
];
const stateCols = [
  { key: 'funnel_stage', label: 'Stage' },
  { key: 'main_product_status', label: 'Status' },
  { key: 'payment_method', label: 'Método' },
  { key: 'main_product_price', label: 'Precio' },
  { key: 'primary_challenge', label: 'Desafío' },
  { key: 'unsubscribe_at', label: 'Unsub' },
];
const txCols = [
  { key: 'transaction_id', label: 'ID' },
  { key: 'product', label: 'Produto' },
  { key: 'value', label: 'Valor' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Cuándo' },
];
const eventCols = [
  { key: 'event_name', label: 'Evento' },
  { key: 'funnel_name', label: 'Funnel' },
  { key: 'created_at', label: 'Cuándo' },
];

const leads = ref([]);
const total = ref(0);
const page = ref(1);
const limit = 50;
const error = ref('');
const detail = ref(null);
const includeTest = ref(false);
const diag = ref(null);
const version = ref(null);

async function checkVersion() {
  error.value = '';
  version.value = null;
  try {
    version.value = await leadsApi.version();
  } catch (e) {
    error.value = e.message;
  }
}

function buildParams() {
  const p = new URLSearchParams();
  p.set('limit', limit);
  p.set('offset', (page.value - 1) * limit);
  if (filters.search) p.set('search', filters.search);
  if (filters.zodiac_sign) p.set('zodiac_sign', filters.zodiac_sign);
  if (filters.life_challenge) p.set('life_challenge', filters.life_challenge);
  if (filters.gender) p.set('gender', filters.gender);
  if (filters.utm_source) p.set('utm_source', filters.utm_source);
  if (includeTest.value) p.set('includeTest', '1');
  return '?' + p.toString();
}

async function load() {
  error.value = '';
  try {
    const r = await leadsApi.list(buildParams());
    leads.value = r.leads || [];
    total.value = r.total || 0;
  } catch (e) {
    if (e.code === 401) error.value = 'Sesión expirada.';
    else error.value = e.message;
  }
}

async function runDiagnostics() {
  error.value = '';
  diag.value = null;
  try {
    const r = await leadsApi.diagnostics();
    diag.value = r;
  } catch (e) {
    error.value = e.message;
  }
}

async function openDetail(email) {
  try {
    detail.value = await leadsApi.detail(email);
  } catch (e) {
    error.value = e.message;
  }
}

function fmt(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

onMounted(load);
</script>
