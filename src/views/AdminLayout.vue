<template>
  <div class="admin">
    <aside class="admin-sidebar" :class="{ open: sidebarOpen }">
      <button class="close-btn" @click="sidebarOpen = false">×</button>
      <div class="admin-logo"><span class="dot" /> Panel del Ángel</div>
      <nav class="admin-nav">
        <router-link to="/admin/leads"><span class="ico">👥</span> Leads</router-link>
        <router-link to="/admin/clientes"><span class="ico">💳</span> Clientes</router-link>
        <router-link to="/admin/recuperacion"><span class="ico">🔄</span> Recuperación</router-link>
        <router-link to="/admin/automations"><span class="ico">✉️</span> Email Automations</router-link>
        <router-link v-if="user && user.role === 'admin'" to="/admin/usuarios"><span class="ico">🛡️</span> Usuarios</router-link>
      </nav>
      <div class="admin-user">
        <div class="avatar">{{ initials }}</div>
        <div class="meta">
          <div class="name">{{ user?.name || user?.email || 'Admin' }}</div>
          <div class="role">{{ user?.role || 'admin' }}</div>
        </div>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button class="hamburger" @click="sidebarOpen = true">☰</button>
          <div>
            <h1>{{ title }}</h1>
            <div class="sub">{{ subtitle }}</div>
          </div>
        </div>
        <div class="right">
          <div class="live"><span class="pulse" /> Ao vivo</div>
          <button class="btn ghost" @click="logout">Salir</button>
        </div>
      </header>
      <main class="admin-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';

const { user, logout: doLogout } = useAuth();
const route = useRoute();
const router = useRouter();
const sidebarOpen = ref(false);

const title = computed(() => route.meta?.title || 'Panel');
const subtitle = computed(() => route.meta?.subtitle || '');
const initials = computed(() => {
  const n = user?.name || user?.email || 'A';
  return n.slice(0, 2).toUpperCase();
});

function logout() {
  doLogout();
  router.push('/admin/login');
}
</script>
