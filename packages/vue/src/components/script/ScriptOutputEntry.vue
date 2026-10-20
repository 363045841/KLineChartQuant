<!-- 单条脚本输出：时间、级别、bar 与消息。 -->
<template>
  <div class="script-output__entry" :data-level="level">
    <time :datetime="dateTime">{{ timeText }}</time>
    <span class="script-output__level">{{ level }}</span>
    <span class="script-output__bar">{{ bar }}</span>
    <span class="script-output__message">{{ message }}</span>
  </div>
</template>

<script setup lang="ts">
  import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'

  defineProps<{
    level: LogEvent['level']
    bar: string
    message: string
    dateTime: string
    timeText: string
  }>()
</script>

<style scoped>
  .script-output__entry { display: grid; grid-template-columns: max-content 5ch 6ch minmax(0, 1fr); gap: var(--klc-space-8, 8px); padding: var(--klc-space-4, 4px) 0; align-items: baseline; }
  .script-output__entry time, .script-output__bar, .script-output__level { color: var(--klc-color-ui-muted); }
  .script-output__entry[data-level='error'] .script-output__message, .script-output__entry[data-level='error'] .script-output__level { color: var(--klc-color-performance-negative); }
  .script-output__entry[data-level='warn'] .script-output__level { color: var(--klc-brand-accent-text); }
  .script-output__message { white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
  @media (max-width: 480px) { .script-output__entry { grid-template-columns: 5ch 5ch minmax(0, 1fr); } .script-output__entry time { display: none; } }
</style>
