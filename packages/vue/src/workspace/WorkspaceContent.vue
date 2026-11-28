<!-- 每个标签持有独立工作台；切换只改变可见性，不重建图表实例。 -->
<template>
  <div class="workspace-content">
    <KlineWorkbench
      v-for="tab in tabs"
      v-show="tab.id === activeTabId"
      :key="tab.id"
      v-bind="workbenchWithTheme"
      :restore-layout="true"
      :layout-storage-id="tab.id"
      :agent-context-active="tab.id === activeTabId"
      @controller-ready="charts.onControllerReady(tab.id, $event)"
    />
  </div>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import type { SymbolSpec } from '@363045841yyt/klinechart-core'
  import { computed } from 'vue'
  import KlineWorkbench from '../workbench/KlineWorkbench.vue'
  import type { KlineWorkbenchProps } from '../workbench/types.js'
  import { useWorkspaceCharts } from './impl/useWorkspaceCharts.js'
  import type { WorkspaceTab } from './types.js'

  const props = defineProps<{
    tabs: readonly WorkspaceTab[]
    activeTabId: string
    workbench?: KlineWorkbenchProps
    themeMode?: ChartSettings['theme']
  }>()
  const emit = defineEmits<{
    'spec-change': [tabId: string, spec: SymbolSpec | null]
    'active-controller': [controller: ChartController]
    'theme-change': [theme: 'light' | 'dark']
  }>()
  /**
   * 新建标签时把当前明暗偏好作为图表的初始设置下传。
   * 图表默认设置是 dark，若等 controller-ready 再同步，新标签会先画一帧深色再切回浅色。
   */
  const workbenchWithTheme = computed<KlineWorkbenchProps>(() => {
    const base = props.workbench ?? {}
    const themeMode = props.themeMode
    if (themeMode === undefined) return base
    const chart = base.chart ?? {}
    return {
      ...base,
      chart: { ...chart, settings: { ...chart.settings, theme: themeMode } },
    }
  })
  const charts = useWorkspaceCharts(props, {
    spec: (tabId, spec) => emit('spec-change', tabId, spec),
    active: (controller) => emit('active-controller', controller),
    theme: (theme) => emit('theme-change', theme),
  })
</script>

<style scoped>
  .workspace-content {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
