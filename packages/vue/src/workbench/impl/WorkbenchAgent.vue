<!-- 浏览器 Agent 宿主：只创建 Bridge 并渲染 Agent 工作区，容器与开合由侧边面板壳负责。 -->
<template>
  <AgentWorkspace
    :bridge="bridge"
    :panel-side="panelSide"
    @close="emit('close')"
    @toggle-panel-side="emit('toggle-panel-side')"
  />
</template>

<script setup lang="ts">
  import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { onBeforeUnmount, watch } from 'vue'
  import { BrowserAgentBridge } from '../../features/agent/browser-agent/bridge/impl/browser-agent-bridge.js'
  import AgentWorkspace from '../../features/agent/components/AgentWorkspace.vue'
  import type { SidePanelSide } from '../../features/side-panel/types.js'

  const props = withDefaults(
    defineProps<{
      controller: ChartController | null
      /** 当前停靠侧，决定面板头部图标的展开方向。 */
      panelSide?: SidePanelSide
      /** 宿主注入的凭据存储；省略时沿用浏览器默认实现。 */
      credentials?: ProviderCredentialStore
    }>(),
    { panelSide: 'right', credentials: undefined },
  )
  const emit = defineEmits<{ close: []; 'toggle-panel-side': [] }>()

  const bridge = new BrowserAgentBridge({
    getChartAgent: () => props.controller?.agent,
    credentials: props.credentials,
  })
  watch(
    () => props.controller,
    (controller) => bridge.bindChartAgent(controller?.agent),
    { immediate: true },
  )
  onBeforeUnmount(() => {
    void bridge.close()
  })
</script>
