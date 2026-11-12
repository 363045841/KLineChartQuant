<!-- 每个标签持有独立工作台；切换只改变可见性，不重建图表实例。 -->
<template>
  <div class="workspace-content">
    <KlineWorkbench
      v-for="tab in tabs"
      v-show="tab.id === activeTabId"
      :key="tab.id"
      v-bind="workbench"
      :restore-layout="true"
      :layout-storage-id="tab.id"
      @controller-ready="charts.onControllerReady(tab.id, $event)"
      @update:is-fullscreen="emit('update:is-fullscreen', $event)"
    />
  </div>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import type { ChartController, SymbolSpec } from '@363045841yyt/klinechart-core/controllers'
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
    'update:is-fullscreen': [fullscreen: boolean]
  }>()
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
