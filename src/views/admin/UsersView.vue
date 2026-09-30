<template>
  <div>
    <p v-if="error" class="err">{{ error }}</p>

    <div class="filter-bar">
      <div class="field">Username<input v-model="form.username" /></div>
      <div class="field">Email<input v-model="form.email" /></div>
      <div class="field">Nombre<input v-model="form.name" /></div>
      <div class="field">Rol
        <select v-model="form.role">
          <option value="support">support</option>
          <option value="viewer">viewer</option>
          <option value="admin">admin</option>
        </select>
      </div>
      <div class="field">Contraseña<input type="password" v-model="form.password" placeholder="mín 6" /></div>
      <div class="field" style="justify-content: flex-end;">
        <button class="btn primary" :disabled="creating" @click="create">Crear usuario</button>
      </div>
    </div>

    <DataTable :columns="cols" :rows="users" :rowKey="'id'" emptyText="Sin usuarios.">
      <template #cell-role="{ value }"><Badge :text="value" :variant="value === 'admin' ? 'teal' : ''" /></template>
      <template #cell-is_active="{ value }">
        <Badge :text="value ? 'activo' : 'inactivo'" :variant="value ? 'green' : 'red'" />
      </template>
      <template #cell-last_login="{ value }">{{ fmt(value) }}</template>
      <template #actions="{ row }">
        <button class="btn ghost" @click="toggleActive(row)" :disabled="row.id === meId">{{ row.is_active ? 'Desactivar' : 'Activar' }}</button>
        <button class="btn ghost" @click="remove(row)" :disabled="row.id === meId">Eliminar</button>
      </template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import DataTable from '../../components/admin/DataTable.vue';
import Badge from '../../components/admin/Badge.vue';
import { authApi } from '../../composables/useApi.js';
import { useAuth } from '../../composables/useAuth.js';

const { user } = useAuth();
const meId = user?.value?.id ?? user?.id;

const cols = [
  { key: 'username', label: 'Username' },
  { key: 'email', label: 'Email', mono: true },
  { key: 'name', label: 'Nombre' },
  { key: 'role', label: 'Rol' },
  { key: 'is_active', label: 'Estado' },
  { key: 'last_login', label: 'Último login' },
];

const users = ref([]);
const error = ref('');
const creating = ref(false);
const form = reactive({ username: '', email: '', name: '', role: 'support', password: '' });

function fmt(ts) { return ts ? new Date(ts).toLocaleString() : '—'; }

async function load() {
  error.value = '';
  try { users.value = (await authApi.users()).users || []; }
  catch (e) { if (e.code === 401) error.value = 'Sesión expirada.'; else error.value = e.message; }
}

async function create() {
  error.value = '';
  if (!form.username || !form.email || !form.password) { error.value = 'Username, email y contraseña requeridos.'; return; }
  creating.value = true;
  try {
    await authApi.createUser({ username: form.username, email: form.email, name: form.name, role: form.role, password: form.password });
    form.username = form.email = form.name = form.password = '';
    await load();
  } catch (e) { error.value = e.message; }
  finally { creating.value = false; }
}

async function toggleActive(row) {
  error.value = '';
  try { await authApi.updateUser(row.id, { is_active: !row.is_active }); await load(); }
  catch (e) { error.value = e.message; }
}

async function remove(row) {
  error.value = '';
  try { await authApi.deleteUser(row.id); await load(); }
  catch (e) { error.value = e.message; }
}

onMounted(load);
</script>
