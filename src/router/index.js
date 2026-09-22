import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/enviodosdados', name: 'enviados', component: () => import('../views/EnviadosView.vue') },
  { path: '/assinatura-poder', name: 'assinatura', component: () => import('../views/UpsellView.vue') },
  { path: '/g-ass', name: 'g-ass', component: () => import('../views/UpsellView.vue') },
  { path: '/obrigado-correio', name: 'obrigado', component: () => import('../views/ThankYouView.vue') },
  { path: '/brd', name: 'exit', component: () => import('../views/ExitView.vue') },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
