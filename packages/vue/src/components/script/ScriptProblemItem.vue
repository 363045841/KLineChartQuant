<!-- 单条脚本问题：严重级别、消息与源码位置。 -->
<template>
  <button
    type="button"
    class="script-problems__item"
    :data-severity="problem.severity"
    :disabled="!problem.location"
    @click="emit('reveal', problem)"
  >
    <IconTablerAlertCircle v-if="problem.severity === 'error'" class="script-problems__icon" aria-label="错误" />
    <IconTablerAlertTriangle v-else-if="problem.severity === 'warning'" class="script-problems__icon" aria-label="警告" />
    <IconTablerInfoCircle v-else class="script-problems__icon" aria-label="提示" />
    <span class="script-problems__message">{{ problem.message }}</span>
    <span class="script-problems__location">{{ problem.source }}<template v-if="problem.location"> [{{ problem.location.line }}:{{ problem.location.column }}]</template></span>
  </button>
</template>

<script setup lang="ts">
  import type { ScriptEditorProblem } from '@vue-src/composables/chart/scriptEditor/types.js'
  import IconTablerAlertCircle from '~icons/tabler/alert-circle'
  import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'
  import IconTablerInfoCircle from '~icons/tabler/info-circle'

  defineProps<{ problem: ScriptEditorProblem }>()
  const emit = defineEmits<{ reveal: [problem: ScriptEditorProblem] }>()
</script>

<style scoped>
  .script-output .script-problems__item { display: grid; grid-template-columns: 16px minmax(0, 1fr) max-content; gap: var(--klc-space-8, 8px); width: 100%; padding: var(--klc-space-8, 8px) 0; text-align: left; align-items: start; border: 0; background: transparent; color: var(--klc-color-ui-text); font: inherit; cursor: pointer; }
  .script-output .script-problems__item:disabled { opacity: 1; cursor: default; }
  .script-output .script-problems__item:focus-visible { outline: 2px solid var(--klc-color-ui-focus); outline-offset: -2px; }
  .script-output .script-problems__icon { width: 16px; height: 16px; }
  .script-output .script-problems__item[data-severity='error'] .script-problems__icon { color: var(--klc-color-performance-negative); }
  .script-output .script-problems__item[data-severity='warning'] .script-problems__icon { color: var(--klc-brand-accent-text); }
  .script-output .script-problems__message { white-space: pre-wrap; overflow-wrap: anywhere; }
  .script-output .script-problems__location { color: var(--klc-color-ui-muted); font-size: inherit; }
</style>
