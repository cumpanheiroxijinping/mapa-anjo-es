<template>
  <div class="ms1 form-content">
    <br />
    <h3 class="titulo-pergunta-signo">Haz clic en TU SIGNO</h3>
    <br />
    <div class="sbc1945">
      <button v-for="s in signs" :key="s.id" class="bs5829" :class="{ selected: model === s.id }" @click="select(s.id)">
        <img :src="s.img" :alt="s.label" />
        <p>{{ s.label }}</p>
      </button>
    </div>
    <div class="privacy-section">
      <p class="privacy-text"><span class="lock-icon">🔒</span><strong>Privacidad Garantizada:</strong> Tus respuestas son 100% anónimas y confidenciales.</p>
      <p class="stats-text">Más de 50.638 personas ya descubrieron cuál es su ángel a través de esta prueba.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
const model = defineModel();
const emit = defineEmits(['next']);

const signs = [
  { id: 'aries', label: 'Aries', img: '/signs/aries.png' },
  { id: 'touro', label: 'Tauro', img: '/signs/touro.png' },
  { id: 'gemeos', label: 'Géminis', img: '/signs/gemeos.png' },
  { id: 'cancer', label: 'Cáncer', img: '/signs/cancer.png' },
  { id: 'leao', label: 'Leo', img: '/signs/leao.png' },
  { id: 'virgem', label: 'Virgo', img: '/signs/virgem.png' },
  { id: 'libra', label: 'Libra', img: '/signs/libra.png' },
  { id: 'escorpiao', label: 'Escorpio', img: '/signs/escorpiao.png' },
  { id: 'sagitario', label: 'Sagitario', img: '/signs/sagitario.png' },
  { id: 'capricornio', label: 'Capricornio', img: '/signs/capricornio.png' },
  { id: 'aquario', label: 'Acuario', img: '/signs/aquario.png' },
  { id: 'peixes', label: 'Piscis', img: '/signs/peixes.png' },
];

function select(id) {
  model.value = id;
  emit('next');
}
</script>
