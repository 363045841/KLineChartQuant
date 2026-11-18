<!-- 单一产品入口：立即挂载界面，脚本与 Agent 独立异步加载。 -->
<template>
  <div class="kline-workbench" :data-theme="theme">
    <WorkbenchContent
      ref="content"
      v-bind="{ ...$props, ...$attrs }"
      @controller-ready="emit('controller-ready', $event)"
      @theme-change="onThemeChange"
      @error="emit('error', $event)"
    />
  </div>
</template>

<script setup lang="ts">
  // 工具登记契约随 @Tool 注册表移到 /agent-tools 子入口，controllers 不再重导出。
  import type { RegisteredChartTool } from '@363045841yyt/klinechart-core/agent-tools'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { onErrorCaptured, shallowRef } from 'vue'
  import WorkbenchContent from './impl/WorkbenchContent.vue'
  import type { KlineWorkbenchHandle, KlineWorkbenchProps } from './types.js'

  defineOptions({ inheritAttrs: false })
  withDefaults(defineProps<KlineWorkbenchProps>(), {
    agent: true,
    scripts: true,
    initialAgentPanelOpen: false,
    restoreLayout: true,
  })
  const emit = defineEmits<{
    'controller-ready': [controller: ChartController]
    'theme-change': [theme: 'light' | 'dark']
    error: [error: Error]
  }>()
  const content = shallowRef<KlineWorkbenchHandle | null>(null)
  const theme = shallowRef<'light' | 'dark'>('light')
  onErrorCaptured((error) => {
    // 错误向宿主报告；局部操作异常不改变整个工作台的生命周期。
    emit('error', error)
    return false
  })
  /** 工作台外壳跟随图表的有效主题，与源码预览保持一致。 */
  function onThemeChange(value: 'light' | 'dark'): void {
    theme.value = value
    emit('theme-change', value)
  }
  defineExpose({
    getController: () => content.value?.getController() ?? null,
    registerChartTools: (tools: ReadonlyArray<RegisteredChartTool>) =>
      content.value?.registerChartTools(tools),
  })
</script>

<style>
  .kline-workbench { width: 100%; height: 100%; min-width: 0; min-height: 0; }
</style>
