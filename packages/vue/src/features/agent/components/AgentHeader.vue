<!-- Agent 面板头部：左侧开关对话列表抽屉，右侧提供新建会话、模型设置与关闭面板。 -->
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
          @click="$emit('toggle-sessions')"
        >
          <IconMenu2 aria-hidden="true" />
        </button>
      </BaseTooltip>

      <div class="agent-header__actions">
        <BaseTooltip :content="text.newSession" placement="bottom">
          <button type="button" :aria-label="text.newSession" @click="$emit('create')">
            <IconPlus aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip :content="text.settings" placement="bottom">
          <button type="button" :aria-label="text.settings" @click="$emit('settings')">
            <IconSettings aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip :content="text.closePanel" placement="bottom">
          <button
            type="button"
            data-testid="agent-panel-close"
            :aria-label="text.closePanel"
            @click="$emit('close')"
          >
            <IconChevronRight aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import IconChevronRight from '~icons/tabler/chevron-right'
  import IconMenu2 from '~icons/tabler/menu-2'
  import IconPlus from '~icons/tabler/plus'
  import IconSettings from '~icons/tabler/settings'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

  const props = defineProps<{
    locale: AgentLocale
    sessionsOpen: boolean
  }>()

  defineEmits<{
    create: []
    'toggle-sessions': []
    settings: []
    close: []
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  // 开关按钮的提示文案随抽屉状态在展开/收起之间切换。
  const sessionsToggleLabel = computed(() =>
    props.sessionsOpen ? text.value.closeSessions : text.value.openSessions,
  )
</script>

<style scoped>
  .agent-header {
    height: 40px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding: 0 var(--agent-header-inset, 12px);
    border-top: 1px solid var(--agent-border);
    border-bottom: 1px solid var(--agent-border);
    background: var(--agent-surface);
  }

  .agent-header__top {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .agent-header__actions {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 2px;
  }

  .agent-header__top button {
    width: var(--agent-header-button-size, 30px);
    height: var(--agent-header-button-size, 30px);
    display: inline-grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    color: var(--agent-muted);
    background: transparent;
    cursor: pointer;
  }

  .agent-header__top button:hover,
  .agent-header__top button:focus-visible {
    color: var(--agent-text);
    background: var(--agent-hover);
  }

  .agent-header__sessions-toggle[aria-expanded='true'] {
    color: var(--agent-text);
    background: var(--agent-hover);
  }
</style>
