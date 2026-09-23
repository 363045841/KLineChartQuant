<template>
  <input
    type="color"
    class="color-input"
    :value="value"
    :aria-label="ariaLabel"
    @input="emit('change', ($event.target as HTMLInputElement).value)"
  />
</template>

<script setup lang="ts">
  defineProps<{ value: string; ariaLabel: string }>()
  const emit = defineEmits<{ change: [value: string] }>()
</script>

<style scoped>
  .color-input {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    transition: transform 0.15s ease;
    overflow: hidden;
  }

  .color-input:hover {
    transform: scale(1.1);
  }

  .color-input::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .color-input::-webkit-color-swatch {
    border: none;
    border-radius: 6px;
  }

  .color-input::-moz-color-swatch {
    border: none;
    border-radius: 6px;
  }
</style>
