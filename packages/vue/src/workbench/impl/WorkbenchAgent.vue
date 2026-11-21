<!--
  浏览器 Agent 宿主：使用文档级客户端渲染工作区，容器与开合由侧边面板壳负责。
  只有当前活动图表标签会绑定 Agent 上下文，避免多个标签争夺同一份上下文。
-->
<template>
  <AgentWorkspace
    :client="client"
    :panel-side="panelSide"
    @close="emit('close')"
  />
</template>

<script setup lang="ts">
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { watch } from 'vue'
  import { getChartAgentClient } from '../../features/agent/browser-agent/host/impl/agent-client.js'
  import AgentWorkspace from '../../features/agent/components/AgentWorkspace.vue'
  import type { SidePanelSide } from '../../features/side-panel/types.js'

  const props = withDefaults(
    defineProps<{
      controller: ChartController | null
      /** 当前停靠侧，决定面板头部图标的展开方向。 */
      panelSide?: SidePanelSide
      /** 是否为当前活动图表标签；非活动标签不绑定 Agent 上下文。 */
      active?: boolean
    }>(),
    { panelSide: 'right', active: true },
  )
  const emit = defineEmits<{ close: [] }>()

  const client = getChartAgentClient()

  // 绑定只由活动标签写入：非活动标签不清理，避免与新的活动标签互相覆盖。
  watch(
    () => [props.controller, props.active] as const,
    ([controller, active]) => {
      if (active) client.bindChartAgent(controller?.agent)
    },
    { immediate: true },
  )
</script>
