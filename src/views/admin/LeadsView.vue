<template>
  <div>
    <div class="filter-bar">
      <div class="field">Buscar email<input v-model="filters.search" @keyup.enter="load" placeholder="email@dominio" /></div>
      <div class="field">Funnel stage
        <select v-model="filters.funnel_stage" @change="load">
          <option value="">Todos</option>
          <option v-for="s in stages" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="field">Status principal
        <select v-model="filters.main_product_status" @change="load">
          <option value="">Todos</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="field">Desafío
        <select v-model="filters.primary_challenge" @change="load">
          <option value="">Todos</option>
          <option v-for="c in challenges" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="field">Tag<input v-model="filters.tag" @keyup.enter="load" placeholder="PAYMENT_FAILED" /></div>
      <div class="field"><button class="btn" @click="load">Filtrar</button></div>
    </div>

    <p v-if="error" class="err">{{ error }}</p>

    <DataTable :columns="columns" :rows="leads" :rowKey="'email'" emptyText="Sin leads.">
      <template #cell-main_product_status="{ value }">
        <Badge :text="value" :variant="statusVariant(value)" />
      </template>
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
import Badge from '../../components/admin/Badge.vue';
import Modal from '../../components/admin/Modal.vue';
import Pagination from '../../components/admin/Pagination.vue';
import { leadsApi } from '../../composables/useApi.js';

const stages = ['QUIZ_NEW', 'QUIZ_COMPLETED', 'VSL2_VIEWED', 'OFFER_NO_CHECKOUT', 'CHECKOUT_ABANDONED', 'PAID', 'REFUNDED'];
const statuses = ['none', 'pending', 'paid', 'refunded', 'chargeback'];
const challenges = ['love', 'finance', 'health', 'happiness'];

const filters = reactive({ search: '', funnel_stage: '', main_product_status: '', primary_challenge: '', tag: '' });
const columns = [
  { key: 'email', label: 'Email', mono: true },
  { key: 'funnel_stage', label: 'Stage' },
  { key: 'main_product_status', label: 'Status' },
  { key: 'primary_challenge', label: 'Desafío' },
  { key: 'country', label: 'País' },
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

function statusVariant(s) {
  if (['paid'].includes(s)) return 'green';
  if (['refunded', 'chargeback'].includes(s)) return 'red';
  if (['pending'].includes(s)) return 'amber';
  return '';
}

function buildParams() {
  const p = new URLSearchParams();
  p.set('limit', limit);
  p.set('offset', (page.value - 1) * limit);
  if (filters.search) p.set('search', filters.search);
  if (filters.funnel_stage) p.set('funnel_stage', filters.funnel_stage);
  if (filters.main_product_status) p.set('main_product_status', filters.main_product_status);
  if (filters.primary_challenge) p.set('primary_challenge', filters.primary_challenge);
  if (filters.tag) p.set('tag', filters.tag);
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
