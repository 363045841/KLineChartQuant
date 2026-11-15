<!-- Web 工作区只管理页面内标签；与 Electron 共用标签栏、持久化和图表生命周期。 -->
<template>
  <div class="app-container" :data-theme="currentTheme">
    <WorkspaceTabBar
      v-if="tabs.ready.value"
      :workspace-id="workspaceId"
      :tabs="tabs.tabs.value"
      :active-tab-id="tabs.activeTabId.value"
      :theme-mode="appearance.mode.value"
      accent="var(--klc-color-ui-accent)"
      @activate="tabs.activate"
      @create="tabs.createTab"
      @close="tabs.removeTab"
      @reorder="tabs.moveTab"
      @theme-change="appearance.setMode"
    />
    <div class="embed-container">
      <WorkspaceContent
        v-if="tabs.ready.value"
        :tabs="tabs.tabs.value"
        :active-tab-id="tabs.activeTabId.value"
        :theme-mode="appearance.mode.value"
        :workbench="{ chart: { leftAxisWidth: 60 } }"
        @spec-change="tabs.setSpec"
        @theme-change="currentTheme = $event"
        @active-controller="bindDocumentTitle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue'
  import { WorkspaceContent, WorkspaceTabBar, useWorkspaceTabs, useWorkspaceAppearance } from '../src/index'
  import { useChartDocumentTitle } from './useChartDocumentTitle'

  const workspaceId = 'web'
  const tabs = useWorkspaceTabs(workspaceId)
  const appearance = useWorkspaceAppearance()
  const themePreference = appearance.mode.value
  const currentTheme = ref<'light' | 'dark'>(
    themePreference === 'dark' ||
      (themePreference === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark' : 'light',
  )
  const { bind: bindDocumentTitle } = useChartDocumentTitle()
  onMounted(() => tabs.restore(null))
  onBeforeUnmount(() => { void tabs.dispose() })
</script>

<style>
  .app-container {
    width: 100%;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--klc-color-background);
    color: var(--klc-color-ui-text);
  }
  .embed-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    --kmap-chart-height: 100%;
    --kmap-chart-width: 100%;
  }
</style>
