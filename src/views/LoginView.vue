<template>
  <div class="login-wrap">
    <div class="login-card">
      <h1>🔐 Panel del Ángel</h1>
      <div class="sub">Introduce tus credenciales para acceder al panel.</div>
      <form @submit.prevent="submit">
        <label>Email</label>
        <input v-model="email" type="email" placeholder="admin@ejemplo.com" autocomplete="username" />
        <label>Contraseña</label>
        <input v-model="password" type="password" placeholder="••••••••" autocomplete="current-password" @keyup.enter="submit" />
        <button class="btn primary" type="submit" :disabled="loading">
          {{ loading ? 'Entrando…' : 'Entrar' }}
        </button>
        <p v-if="error" class="err" style="margin-top: 12px;">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';

const { login } = useAuth();
const router = useRouter();
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  if (!email.value || !password.value) { error.value = 'Email y contraseña requeridos.'; return; }
  loading.value = true;
  try {
    await login(email.value, password.value);
    router.push('/admin/leads');
  } catch (e) {
    error.value = 'Credenciales inválidas.';
  } finally {
    loading.value = false;
  }
}
</script>
