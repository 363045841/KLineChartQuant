<!-- Agent 面板头部：左侧开关对话列表抽屉，右侧提供新建会话、模型设置与关闭面板。 -->
<template>
  <SidePanelHeader class="agent-header">
    <template #default>
      <BaseTooltip :content="sessionsToggleLabel" placement="bottom">
        <BaseIconButton
          class="agent-header__sessions-toggle"
          data-testid="agent-sessions-toggle"
          :label="sessionsToggleLabel"
          aria-haspopup="dialog"
          :aria-expanded="sessionsOpen"
          :disabled="!available"
          @click="emit('toggle-sessions')"
        >
          <IconMenu2 aria-hidden="true" />
        </BaseIconButton>
      </BaseTooltip>

    </template>
    <template #actions>
        <BaseTooltip :content="text.newSession" placement="bottom">
          <BaseIconButton
            :label="text.newSession"
            :disabled="!available"
            @click="emit('create')"
          >
            <IconPlus aria-hidden="true" />
          </BaseIconButton>
        </BaseTooltip>
        <BaseTooltip :content="text.settings" placement="bottom">
          <BaseIconButton :label="text.settings" @click="emit('settings')">
            <IconSettings aria-hidden="true" />
          </BaseIconButton>
        </BaseTooltip>
        <BaseTooltip :content="text.closePanel" placement="bottom">
          <BaseIconButton
            data-testid="agent-panel-close"
            :label="text.closePanel"
            @click="emit('close')"
          >
            <IconChevronLeft v-if="panelSide === 'left'" aria-hidden="true" />
            <IconChevronRight v-else aria-hidden="true" />
          </BaseIconButton>
        </BaseTooltip>
    </template>
  </SidePanelHeader>
</template>

<script setup lang="ts">
  import './agent-icon-button.css'

  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import { computed } from 'vue'
  import IconChevronLeft from '~icons/tabler/chevron-left'
  import IconChevronRight from '~icons/tabler/chevron-right'
  import IconMenu2 from '~icons/tabler/menu-2'
  import IconPlus from '~icons/tabler/plus'
  import IconSettings from '~icons/tabler/settings'
  import SidePanelHeader from '../../side-panel/SidePanelHeader.vue'
  import type { SidePanelSide } from '../../side-panel/types.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy/index.js'

  const props = withDefaults(
    defineProps<{
      locale: AgentLocale
      sessionsOpen: boolean
      panelSide?: SidePanelSide
      /** 运行时可用时才允许操作会话；不可用时仅保留设置与关闭入口。 */
      available?: boolean
    }>(),
    { panelSide: 'right', available: true },
  )

  const emit = defineEmits<{
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
  .agent-header__sessions-toggle[aria-expanded='true'] {
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
  }
</style>
