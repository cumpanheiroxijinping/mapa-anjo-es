import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import { isAuthed } from '../composables/useAuth.js';

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/enviodosdados', name: 'enviados', component: () => import('../views/EnviadosView.vue') },
  { path: '/assinatura-poder', name: 'assinatura', component: () => import('../views/UpsellView.vue') },
  { path: '/g-ass', name: 'g-ass', component: () => import('../views/UpsellView.vue') },
  { path: '/obrigado-correio', name: 'obrigado', component: () => import('../views/ThankYouView.vue') },
  { path: '/brd', name: 'exit', component: () => import('../views/ExitView.vue') },

  // Admin auth
  { path: '/admin/login', name: 'admin-login', component: () => import('../views/LoginView.vue'), meta: { title: 'Acceso' } },

  // Admin panel (requires auth)
  {
    path: '/admin',
    component: () => import('../views/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/admin/leads' },
      { path: 'leads', name: 'admin-leads', component: () => import('../views/admin/LeadsView.vue'), meta: { title: 'Leads', subtitle: 'Captura y estado de contactos' } },
      { path: 'clientes', name: 'admin-clientes', component: () => import('../views/admin/ClientsView.vue'), meta: { title: 'Clientes', subtitle: 'Transacciones y ventas' } },
      { path: 'recuperacion', name: 'admin-recuperacion', component: () => import('../views/admin/RecoveryView.vue'), meta: { title: 'Recuperación', subtitle: 'Secuencias activas y postbacks' } },
      { path: 'automations', name: 'admin-automations', component: () => import('../views/admin/AutomationsView.vue'), meta: { title: 'Email Automations', subtitle: 'Campañas y métricas de email' } },
      { path: 'usuarios', name: 'admin-usuarios', component: () => import('../views/admin/UsersView.vue'), meta: { title: 'Usuarios', subtitle: 'Gestión de acceso' } },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach((to) => {
  if (to.meta?.requiresAuth && !isAuthed()) {
    return { name: 'admin-login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'admin-login' && isAuthed()) {
    return { name: 'admin-leads' };
  }
  return true;
});

export default router;
