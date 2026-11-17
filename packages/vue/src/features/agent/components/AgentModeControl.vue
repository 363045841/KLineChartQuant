<!-- 运行模式选择：plan 只读分析，build 允许改动图表。 -->
<template>
  <div class="agent-mode" role="radiogroup" :aria-label="label">
    <label v-for="option in options" :key="option.value" class="agent-mode__option">
      <input
        class="agent-mode__input"
        type="radio"
        :name="groupName"
        :value="option.value"
        :checked="modelValue === option.value"
        :aria-label="option.label"
        @change="emit('update:modelValue', option.value)"
      />
      <span class="agent-mode__surface">{{ option.label }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
  import type { AgentRunMode } from '@363045841yyt/klinechart-agent-runtime'
  import { computed, useId } from 'vue'

  const props = defineProps<{
    modelValue: AgentRunMode
    label: string
    options: ReadonlyArray<{ readonly value: AgentRunMode; readonly label: string }>
  }>()
  const emit = defineEmits<{ 'update:modelValue': [value: AgentRunMode] }>()
  const groupName = useId()
  const options = computed(() => props.options)
</script>

<style scoped>
  .agent-mode {
    display: inline-flex;
    flex: 0 0 auto;
    overflow: hidden;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--klc-radius-full, 9999px);
    background-color: var(--klc-color-agent-composer-input-background);
  }

  .agent-mode__option {
    position: relative;
    display: grid;
    cursor: pointer;
  }

  /* 输入覆盖完整点击区域，透明隐藏外观仍保留原生单选组的焦点与方向键行为。 */
  .agent-mode__input {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  .agent-mode__surface {
    display: grid;
    place-items: center;
    min-inline-size: 44px;
    padding: 2px 10px;
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    transition:
      color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard),
      background-color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
    pointer-events: none;
  }

  .agent-mode__option:hover .agent-mode__surface {
    color: var(--klc-color-ui-text);
  }

  .agent-mode__input:checked + .agent-mode__surface {
    color: var(--klc-color-ui-text);
    background-color: var(--klc-color-ui-hover);
  }

  .agent-mode__input:focus-visible + .agent-mode__surface {
    outline: 2px solid var(--klc-color-ui-accent);
    outline-offset: -2px;
  }
</style>
