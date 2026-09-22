import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import { initUtm } from './composables/useUtm.js';

initUtm();

createApp(App).use(router).mount('#app');
