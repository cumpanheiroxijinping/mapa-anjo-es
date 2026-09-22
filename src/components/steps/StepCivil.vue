<template>
  <div class="form-content">
    <h3 class="titulo-pergunta-signo">¿Cuál es tu Estado Civil?</h3>
    <br />
    <div class="sbc1945">
      <button v-for="o in opts" :key="o" class="bs5829" :class="{ selected: model === o }" @click="pick(o)">
        <p>{{ o }}</p>
      </button>
    </div>
  </div>
</template>

<script setup>
const model = defineModel();
const emit = defineEmits(['next']);
const opts = ['Soltero(a)', 'Casado(a)', 'Viudo(a)'];
function pick(v) {
  model.value = v;
  emit('next');
}
</script>
