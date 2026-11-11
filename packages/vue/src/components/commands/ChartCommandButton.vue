<!-- 图表命令按钮：名称、可用性和动作来自注册表，Tooltip 读取同一命令的当前快捷键。 -->
<template>
  <BaseTooltip v-if="definition" :content="definition.title.zh" :command="command" placement="top">
    <button
      type="button"
      class="chart-command-button"
      :aria-label="definition.title.zh"
      :disabled="!available"
      :data-command="command"
      @pointerdown.stop
      @dblclick.stop
      @click="run"
    >
      <component :is="CHART_COMMAND_ICONS[command]" aria-hidden="true" />
    </button>
  </BaseTooltip>
</template>

<script setup lang="ts">
  import { CHART_COMMAND_ICONS } from '../../composables/commands/chartCommands.js'
  import { useChartCommand } from '../../composables/commands/useChartCommand.js'
  import BaseTooltip from '../common/BaseTooltip.vue'

  const props = defineProps<{ command: string }>()
  const emit = defineEmits<{ (e: 'execute', command: string): void }>()
  const { definition, available, execute } = useChartCommand(() => props.command)

  /** 把执行过的命令 id 交给宿主，宿主据此处理浮层收起等点击后的界面行为。 */
  function run(): void {
    execute()
    emit('execute', props.command)
  }
</script>

<style scoped>
  .chart-command-button {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: var(--klc-radius-xs);
    background: var(--klc-color-chart-navigation-background);
    box-shadow: var(--klc-elevation-1);
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .chart-command-button:hover:not(:disabled) {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  :global([data-theme='dark']) .chart-command-button {
    color: var(--klc-color-ui-text);
  }

  :global([data-theme='dark']) .chart-command-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--klc-color-ui-hover) 85%, var(--klc-color-ui-text));
  }

  .chart-command-button:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 2px;
  }

  .chart-command-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .chart-command-button :deep(svg) {
    width: 16px;
    height: 16px;
  }
</style>
