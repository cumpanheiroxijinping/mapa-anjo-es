<template>
  <div class="pagination" v-if="totalPages > 1">
    <button class="btn ghost" :disabled="page <= 1" @click="$emit('change', page - 1)">← Anterior</button>
    <span>Página {{ page }} de {{ totalPages }} · {{ total }} registros</span>
    <button class="btn ghost" :disabled="page >= totalPages" @click="$emit('change', page + 1)">Próxima →</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({
  page: { type: Number, default: 1 },
  total: { type: Number, default: 0 },
  limit: { type: Number, default: 50 },
});
defineEmits(['change']);
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.limit)));
</script>
