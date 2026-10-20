<!-- Agent 面板头部：左侧开关对话列表抽屉，右侧提供新建会话、模型设置、停靠侧切换与关闭面板。 -->
<template>
  <header class="agent-header">
    <div class="agent-header__top">
      <BaseTooltip :content="sessionsToggleLabel" placement="bottom">
        <button
          type="button"
          class="agent-header__sessions-toggle"
          data-testid="agent-sessions-toggle"
          :aria-label="sessionsToggleLabel"
          aria-haspopup="dialog"
          :aria-expanded="sessionsOpen"
          :disabled="!available"
          @click="emit('toggle-sessions')"
        >
          <IconMenu2 aria-hidden="true" />
        </button>
      </BaseTooltip>

      <div class="agent-header__actions">
        <BaseTooltip :content="text.newSession" placement="bottom">
          <button
            type="button"
            :aria-label="text.newSession"
            :disabled="!available"
            @click="emit('create')"
          >
            <IconPlus aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip :content="text.settings" placement="bottom">
          <button type="button" :aria-label="text.settings" @click="emit('settings')">
            <IconSettings aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip :content="panelSideLabel" placement="bottom">
          <button
            type="button"
            data-testid="agent-panel-side-toggle"
            :aria-label="panelSideLabel"
            @click="emit('toggle-panel-side')"
          >
            <IconLayoutSidebarLeftExpand v-if="panelSide === 'right'" aria-hidden="true" />
            <IconLayoutSidebarRightExpand v-else aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip :content="text.closePanel" placement="bottom">
          <button
            type="button"
            data-testid="agent-panel-close"
            :aria-label="text.closePanel"
            @click="emit('close')"
          >
            <IconChevronLeft v-if="panelSide === 'left'" aria-hidden="true" />
            <IconChevronRight v-else aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import IconChevronLeft from '~icons/tabler/chevron-left'
  import IconChevronRight from '~icons/tabler/chevron-right'
  import IconLayoutSidebarLeftExpand from '~icons/tabler/layout-sidebar-left-expand'
  import IconLayoutSidebarRightExpand from '~icons/tabler/layout-sidebar-right-expand'
  import IconMenu2 from '~icons/tabler/menu-2'
  import IconPlus from '~icons/tabler/plus'
  import IconSettings from '~icons/tabler/settings'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import type { AgentPanelSide } from '../workspace/types.js'

  const props = withDefaults(
    defineProps<{
      locale: AgentLocale
      sessionsOpen: boolean
      panelSide?: AgentPanelSide
      /** 运行时可用时才允许操作会话；不可用时仅保留设置与关闭入口。 */
      available?: boolean
    }>(),
    { panelSide: 'right', available: true },
  )

  const emit = defineEmits<{
    create: []
    'toggle-sessions': []
    settings: []
    'toggle-panel-side': []
    close: []
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  // 开关按钮的提示文案随抽屉状态在展开/收起之间切换。
  const sessionsToggleLabel = computed(() =>
    props.sessionsOpen ? text.value.closeSessions : text.value.openSessions,
  )
  // 切换按钮的提示文案指向面板将要移动到的位置。
  const panelSideLabel = computed(() =>
    props.panelSide === 'right' ? text.value.movePanelLeft : text.value.movePanelRight,
  )
</script>

<style scoped>
  .agent-header {
    height: 40px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding: 0 var(--agent-header-inset, 8px);
    border-top: 1px solid var(--agent-border);
    border-bottom: 1px solid var(--agent-border);
    background: var(--agent-surface);
  }

  .agent-header__actions {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 2px;
  }

  .agent-header__top button:disabled {
    opacity: 0.4;
    cursor: default;
    color: var(--agent-muted);
    background: transparent;
  }

  .agent-header__sessions-toggle[aria-expanded='true'] {
    color: var(--agent-text);
    background: var(--agent-hover);
  }
</style>

<style scoped src="./agent-icon-button.css"></style>
<style scoped src="../../../components/common/header-row.css"></style>
