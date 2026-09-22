<template>
  <div class="form-content">
    <h3 class="titulo-pergunta-signo">Tu lectura del Ángel de la Guarda está lista para revelarse</h3>
    <br />
    <p class="section-p" style="text-align: center; color: #fff;">
      Hemos sintonizado tu mapa personalizado. Presiona el botón para ver tu mensaje.
    </p>
    <br />
    <button class="button-form pulsating-button" @click="emit('next')">Ver mi lectura</button>
  </div>
</template>

<script setup>
const emit = defineEmits(['next']);
</script>
