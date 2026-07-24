<template>
  <label class="toggle-switch" :class="{ 'is-disabled': disabled }">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="toggle-switch__track" aria-hidden="true">
      <span class="toggle-switch__thumb" />
    </span>
  </label>
</template>

<script setup lang="ts">
  defineProps<{
    modelValue: boolean
    disabled?: boolean
    ariaLabel?: string
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
  }>()
</script>

<style scoped>
  .toggle-switch {
    position: relative;
    flex: 0 0 auto;
    display: inline-block;
    width: 34px;
    height: 20px;
    margin: 0;
    cursor: pointer;
  }

  .toggle-switch.is-disabled {
    cursor: default;
    opacity: 0.55;
  }

  .toggle-switch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  .toggle-switch__track {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 10px;
    background: var(--klc-color-border-button);
    transition: background 0.15s ease;
  }

  .toggle-switch__thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--klc-color-background);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.15s ease;
  }

  .toggle-switch input:checked + .toggle-switch__track {
    background: var(--klc-color-primary, #2962ff);
  }

  .toggle-switch input:checked + .toggle-switch__track .toggle-switch__thumb {
    transform: translateX(14px);
  }

  .toggle-switch input:focus-visible + .toggle-switch__track {
    outline: 2px solid var(--klc-color-axis-text);
    outline-offset: 2px;
  }
</style>
