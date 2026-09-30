<template>
  <div>
    <div class="stats-grid" v-if="stats">
      <StatCard label="Receita" :value="money(stats.revenue)" accent />
      <StatCard label="Aprovadas" :value="stats.approved" />
      <StatCard label="Reembolsos" :value="stats.refunded" />
      <StatCard label="Chargebacks" :value="stats.chargeback" />
      <StatCard label="Hoje" :value="stats.today" />
      <StatCard label="Últimos 7d" :value="stats.thisWeek" />
    </div>

    <div class="filter-bar">
      <div class="field">Buscar<input v-model="filters.search" @keyup.enter="load" placeholder="email / nome / ID" /></div>
      <div class="field">Status
        <select v-model="filters.status" @change="load">
          <option value="">Todos</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="field">Desde<input type="date" v-model="filters.startDate" @change="load" /></div>
      <div class="field">Até<input type="date" v-model="filters.endDate" @change="load" /></div>
      <div class="field"><button class="btn" @click="load">Filtrar</button></div>
    </div>

    <p v-if="error" class="err">{{ error }}</p>

    <DataTable :columns="columns" :rows="txs" :rowKey="'transaction_id'" emptyText="Sin transacciones.">
      <template #cell-status="{ value }">
        <Badge :text="value" :variant="statusVariant(value)" />
      </template>
      <template #cell-value="{ value }">
        <span class="mono">{{ money(value) }}</span>
      </template>
      <template #cell-email="{ value }">
        <span class="mono">{{ value }}</span>
      </template>
      <template #cell-created_at="{ value }">
        {{ fmt(value) }}
      </template>
      <template #actions="{ row }">
        <button class="btn ghost" @click="openDetail(row)">Ver</button>
      </template>
    </DataTable>

    <Pagination :page="page" :total="total" :limit="limit" @change="(p) => { page = p; load(); }" />

    <Modal v-if="detail" :title="`Transacción: ${detail.transaction_id}`" @close="detail = null">
      <div class="section-title">Detalles</div>
      <DataTable :columns="detailCols" :rows="[detail]" />
      <div class="section-title">Payload original</div>
      <pre class="muted" style="white-space: pre-wrap; font-size: 12px; max-height: 320px; overflow: auto;">{{ pretty(detail.raw_payload) }}</pre>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import DataTable from '../../components/admin/DataTable.vue';
import Badge from '../../components/admin/Badge.vue';
import StatCard from '../../components/admin/StatCard.vue';
import Modal from '../../components/admin/Modal.vue';
import Pagination from '../../components/admin/Pagination.vue';
import { transactionsApi } from '../../composables/useApi.js';

const statuses = ['approved', 'canceled', 'rejected', 'chargeback', 'abandonment', 'pending'];
const filters = reactive({ search: '', status: '', startDate: '', endDate: '' });
const columns = [
  { key: 'transaction_id', label: 'ID' },
  { key: 'email', label: 'Email', mono: true },
  { key: 'product', label: 'Produto' },
  { key: 'value', label: 'Valor' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Cuándo' },
];
const detailCols = [
  { key: 'transaction_id', label: 'ID' },
  { key: 'email', label: 'Email' },
  { key: 'name', label: 'Nome' },
  { key: 'product', label: 'Produto' },
  { key: 'value', label: 'Valor' },
  { key: 'currency', label: 'Moeda' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Cuándo' },
];

const stats = ref(null);
const txs = ref([]);
const total = ref(0);
const page = ref(1);
const limit = 50;
const error = ref('');
const detail = ref(null);

function statusVariant(s) {
  if (s === 'approved') return 'green';
  if (['refunded', 'chargeback'].includes(s)) return 'red';
  if (['canceled', 'rejected', 'abandonment'].includes(s)) return 'amber';
  if (s === 'pending') return 'blue';
  return '';
}
function money(v) {
  const n = Number(v || 0);
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pretty(o) { try { return JSON.stringify(o, null, 2); } catch { return ''; } }
function fmt(ts) { return ts ? new Date(ts).toLocaleString() : ''; }

function buildParams() {
  const p = new URLSearchParams();
  p.set('limit', limit);
  p.set('offset', (page.value - 1) * limit);
  if (filters.search) p.set('search', filters.search);
  if (filters.status) p.set('status', filters.status);
  if (filters.startDate) p.set('startDate', filters.startDate);
  if (filters.endDate) p.set('endDate', filters.endDate);
  return '?' + p.toString();
}

async function load() {
  error.value = '';
  try {
    const [list, st] = await Promise.all([transactionsApi.list(buildParams()), transactionsApi.stats()]);
    txs.value = list.transactions || [];
    total.value = list.total || 0;
    stats.value = st.stats;
  } catch (e) {
    if (e.code === 401) error.value = 'Sesión expirada.';
    else error.value = e.message;
  }
}

function openDetail(row) { detail.value = row; }

onMounted(load);
</script>
