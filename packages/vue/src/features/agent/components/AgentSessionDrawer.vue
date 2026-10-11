<!-- 会话列表抽屉：负责外壳、列表编排及唯一行内编辑目标。 -->
<template>
  <Transition name="agent-session-drawer">
    <div v-if="show" class="agent-session-drawer">
      <button
        type="button"
        class="agent-session-drawer__backdrop"
        :aria-label="text.closeSessions"
        @click="emit('close')"
      ></button>
      <aside
        ref="panel"
        class="agent-session-drawer__panel"
        role="dialog"
        aria-modal="true"
        :aria-label="text.sessions"
        tabindex="-1"
        @keydown.escape.stop.prevent="emit('close')"
      >
        <header class="agent-session-drawer__head">
          <h2 class="agent-session-drawer__title">{{ text.sessions }}</h2>
          <div class="agent-session-drawer__head-actions">
            <BaseTooltip :content="text.newSession" placement="bottom">
              <button
                type="button"
                class="agent-session-drawer__icon-button"
                :aria-label="text.newSession"
                @click="emit('create')"
              >
                <IconPlus aria-hidden="true" />
              </button>
            </BaseTooltip>
            <BaseTooltip :content="text.closeSessions" placement="bottom">
              <button
                type="button"
                class="agent-session-drawer__icon-button"
                :aria-label="text.closeSessions"
                @click="emit('close')"
              >
                <IconX aria-hidden="true" />
              </button>
            </BaseTooltip>
          </div>
        </header>
        <p v-if="sessions.length === 0" class="agent-session-drawer__empty">
          {{ text.noSessions }}
        </p>
        <ul v-else class="agent-session-drawer__list">
          <AgentSessionRow
            v-for="session in sessions"
            :key="session.id"
            v-model:draft="renameDraft"
            :session="session"
            :active="session.id === activeSessionId"
            :mode="interaction?.sessionId === session.id ? interaction.mode : 'idle'"
            :locale="locale"
            @select="emit('select', session.id)"
            @request-rename="openRename(session)"
            @request-delete="openDelete(session)"
            @rename="emit('rename', session.id, $event)"
            @delete="emit('delete', session.id)"
            @cancel="closeInteraction"
          />
        </ul>
      </aside>
    </div>
  </Transition>
</template>

<script setup lang="ts">
  import IconPlus from '~icons/tabler/plus'
  import IconX from '~icons/tabler/x'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import type { AgentSessionView } from '../agent-contracts.js'
  import type { AgentLocale } from '../agent-copy.js'
  import AgentSessionRow from './AgentSessionRow.vue'
  import { useAgentSessionDrawer } from './agent-session/impl/useAgentSessionDrawer.js'

  const props = defineProps<{
    show: boolean
    sessions: AgentSessionView[]
    activeSessionId: string | null
    locale: AgentLocale
  }>()
  const emit = defineEmits<{
    close: []
    create: []
    select: [sessionId: string]
    rename: [sessionId: string, title: string]
    delete: [sessionId: string]
  }>()
  const { text, panel, interaction, renameDraft, openRename, openDelete, closeInteraction } =
    useAgentSessionDrawer(props)
</script>

<style scoped src="./agent-icon-button.css"></style>

<style scoped>
  .agent-session-drawer {
    position: absolute;
    inset: 0;
    z-index: 10;
  }

  .agent-session-drawer__backdrop {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    background: var(--klc-color-agent-backdrop);
    cursor: pointer;
  }

  .agent-session-drawer__panel {
    position: relative;
    z-index: 1;
    width: min(280px, 82%);
    height: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--agent-border);
    background: var(--agent-surface);
    box-shadow: 12px 0 32px var(--klc-color-agent-panel-shadow);
    outline: none;
  }

  .agent-session-drawer__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--agent-border);
  }

  .agent-session-drawer__title {
    margin: 0;
    color: var(--agent-text);
    font-size: 13px;
    font-weight: 600;
  }

  .agent-session-drawer__head-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .agent-session-drawer__empty {
    flex: 1;
    margin: 0;
    padding: 24px 16px;
    color: var(--agent-muted);
    font-size: 12px;
    text-align: center;
  }

  .agent-session-drawer__list {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 6px;
    overflow-y: auto;
    list-style: none;
  }

  .agent-session-drawer-enter-active,
  .agent-session-drawer-leave-active {
    transition: opacity 0.2s ease;
  }

  .agent-session-drawer-enter-from,
  .agent-session-drawer-leave-to {
    opacity: 0;
  }

  .agent-session-drawer-enter-active .agent-session-drawer__panel,
  .agent-session-drawer-leave-active .agent-session-drawer__panel {
    transition: transform 0.24s ease;
  }

  .agent-session-drawer-enter-from .agent-session-drawer__panel,
  .agent-session-drawer-leave-to .agent-session-drawer__panel {
    transform: translateX(-100%);
  }

  @media (prefers-reduced-motion: reduce) {
    .agent-session-drawer-enter-active,
    .agent-session-drawer-leave-active,
    .agent-session-drawer-enter-active .agent-session-drawer__panel,
    .agent-session-drawer-leave-active .agent-session-drawer__panel {
      transition-duration: 0.01ms;
    }
  }
</style>
