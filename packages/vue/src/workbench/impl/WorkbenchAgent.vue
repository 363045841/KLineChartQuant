<!-- 浏览器 Agent 宿主：只创建 Bridge 并渲染 Agent 工作区，容器与开合由侧边面板壳负责。 -->
<template>
  <AgentWorkspace
    :bridge="bridge"
    :panel-side="panelSide"
    :quick-prompts="quickPrompts"
    @close="emit('close')"
  />
</template>

<script setup lang="ts">
  import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
  // 工具登记契约随 @Tool 注册表移到 /agent-tools 子入口，controllers 不再重导出。
  import type { RegisteredChartTool } from '@363045841yyt/klinechart-core/agent-tools'
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
      /** 宿主追加的图表工具惰性源；省略时不追加。 */
      extraChartTools?: () => ReadonlyArray<RegisteredChartTool>
      /** 输入框上方的快捷提示；由工作台按期权结构生成。 */
      quickPrompts?: readonly string[]
    }>(),
    { panelSide: 'right', credentials: undefined, extraChartTools: undefined, quickPrompts: () => [] },
  )
  const emit = defineEmits<{ close: [] }>()

  const bridge = new BrowserAgentBridge({
    getChartAgent: () => props.controller?.agent,
    credentials: props.credentials,
    extraChartTools: props.extraChartTools,
  })

  watch(
    () => props.controller,
    (controller) => bridge.bindChartAgent(controller?.agent),
    { immediate: true },
  )
  onBeforeUnmount(() => {
    void bridge.close()
  })
  /** 宿主的工具晚于挂载就绪时补入 Agent 目录。 */
  defineExpose({
    registerChartTools: (tools: ReadonlyArray<RegisteredChartTool>) =>
      bridge.registerExternalChartTools(tools),
  })
</script>
