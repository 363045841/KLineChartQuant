<!-- 左侧对话列表抽屉：列出全部会话，支持切换、重命名、删除与新建会话。 -->
<template>
  <Transition name="agent-session-drawer">
    <div v-if="show" class="agent-session-drawer">
      <button
        type="button"
        class="agent-session-drawer__backdrop"
        :aria-label="text.closeSessions"
        @click="$emit('close')"
      ></button>

      <aside
        ref="panel"
        class="agent-session-drawer__panel"
        role="dialog"
        aria-modal="true"
        :aria-label="text.sessions"
        tabindex="-1"
        @keydown.escape.stop.prevent="$emit('close')"
      >
        <header class="agent-session-drawer__head">
          <h2 class="agent-session-drawer__title">{{ text.sessions }}</h2>
          <div class="agent-session-drawer__head-actions">
            <BaseTooltip :content="text.newSession" placement="bottom">
              <button
                type="button"
                class="agent-session-drawer__icon-button"
                :aria-label="text.newSession"
                @click="$emit('create')"
              >
                <IconPlus aria-hidden="true" />
              </button>
            </BaseTooltip>
            <BaseTooltip :content="text.closeSessions" placement="bottom">
              <button
                type="button"
                class="agent-session-drawer__icon-button"
                :aria-label="text.closeSessions"
                @click="$emit('close')"
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
          <li
            v-for="session in sessions"
            :key="session.id"
            class="agent-session-drawer__item"
            :class="{ 'is-active': session.id === activeSessionId }"
          >
            <button
              type="button"
              class="agent-session-drawer__select"
              :aria-current="session.id === activeSessionId ? 'true' : undefined"
              @click="$emit('select', session.id)"
            >
              <span class="agent-session-drawer__item-title">{{ session.title }}</span>
            </button>
            <div class="agent-session-drawer__item-actions">
              <button
                type="button"
                class="agent-session-drawer__icon-button"
                :aria-label="text.renameSession"
                @click="openRename(session)"
              >
                <IconPencil aria-hidden="true" />
              </button>
              <button
                type="button"
                class="agent-session-drawer__icon-button"
                :aria-label="text.deleteSession"
                @click="openDelete(session)"
              >
                <IconTrash aria-hidden="true" />
              </button>
            </div>
          </li>
        </ul>
      </aside>

      <BaseModal
        :show="renameTarget !== null"
        :title="text.renameSession"
        width="min(92vw, 360px)"
        @close="closeRename"
      >
        <form :id="renameFormId" @submit.prevent="submitRename">
          <label class="agent-session-drawer__field">
            <span class="agent-session-drawer__field-label">{{ text.sessionNamePrompt }}</span>
            <input
              ref="renameInput"
              v-model="renameDraft"
              class="form-control"
              type="text"
              autocomplete="off"
            />
          </label>
        </form>
        <template #footer>
          <BaseButton @click="closeRename">{{ text.cancel }}</BaseButton>
          <BaseButton type="submit" :form="renameFormId" :disabled="!renameDraft.trim()">
            {{ text.confirm }}
          </BaseButton>
        </template>
      </BaseModal>

      <BaseModal
        :show="deleteTarget !== null"
        :title="text.deleteSession"
        width="min(92vw, 360px)"
        @close="closeDelete"
      >
        <p class="agent-session-drawer__confirm">{{ text.deleteSessionConfirm }}</p>
        <template #footer>
          <BaseButton @click="closeDelete">{{ text.cancel }}</BaseButton>
          <BaseButton @click="confirmDelete">{{ text.deleteSession }}</BaseButton>
        </template>
      </BaseModal>
    </div>
  </Transition>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, useId, watch } from 'vue'
  import IconPencil from '~icons/tabler/pencil'
  import IconPlus from '~icons/tabler/plus'
  import IconTrash from '~icons/tabler/trash'
  import IconX from '~icons/tabler/x'
  import BaseButton from '../../../components/BaseButton.vue'
  import BaseModal from '../../../components/BaseModal.vue'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import type { AgentSessionView } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

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

  const text = computed(() => getAgentCopy(props.locale))

  const panel = ref<HTMLElement | null>(null)
  const renameFormId = useId()
  const renameInput = ref<HTMLInputElement | null>(null)
  const renameDraft = ref('')
  const renameTarget = ref<AgentSessionView | null>(null)
  const deleteTarget = ref<AgentSessionView | null>(null)

  // 抽屉打开后聚焦面板，使内容可读且 Escape 关闭可用。
  watch(
    () => props.show,
    (open) => {
      if (open) void nextTick(() => panel.value?.focus())
    },
  )

  // 打开重命名弹窗，并预填目标会话名称。
  function openRename(session: AgentSessionView): void {
    renameDraft.value = session.title
    renameTarget.value = session
    void nextTick(() => {
      renameInput.value?.focus()
      renameInput.value?.select()
    })
  }

  // 关闭重命名弹窗并清空草稿。
  function closeRename(): void {
    renameTarget.value = null
    renameDraft.value = ''
  }

  // 提交有效的新名称，交由上层执行重命名。
  function submitRename(): void {
    const target = renameTarget.value
    const title = renameDraft.value.trim()
    if (!target || !title) return
    emit('rename', target.id, title)
    closeRename()
  }

  // 打开删除会话确认弹窗。
  function openDelete(session: AgentSessionView): void {
    deleteTarget.value = session
  }

  // 关闭删除会话确认弹窗。
  function closeDelete(): void {
    deleteTarget.value = null
  }

  // 用户确认后发出删除目标会话的请求。
  function confirmDelete(): void {
    const target = deleteTarget.value
    if (!target) return
    emit('delete', target.id)
    closeDelete()
  }
</script>

<style scoped src="../../../components/common/form-control.css"></style>

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

  .agent-session-drawer__head-actions,
  .agent-session-drawer__item-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .agent-session-drawer__icon-button {
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

  .agent-session-drawer__icon-button:hover,
  .agent-session-drawer__icon-button:focus-visible {
    color: var(--agent-text);
    background: var(--agent-hover);
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

  .agent-session-drawer__item {
    display: flex;
    align-items: center;
    gap: 2px;
    border-radius: 6px;
  }

  .agent-session-drawer__item:hover,
  .agent-session-drawer__item.is-active {
    background: var(--agent-hover);
  }

  .agent-session-drawer__select {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    color: var(--agent-text);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .agent-session-drawer__item-title {
    display: block;
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agent-session-drawer__item-actions {
    padding-right: 4px;
    transition: opacity 0.12s ease;
  }

  /* 仅在支持 hover 的设备上隐藏操作按钮；触摸设备始终可见。键盘聚焦时同样显示。 */
  @media (hover: hover) {
    .agent-session-drawer__item-actions {
      opacity: 0;
    }

    .agent-session-drawer__item:hover .agent-session-drawer__item-actions,
    .agent-session-drawer__item:focus-within .agent-session-drawer__item-actions {
      opacity: 1;
    }
  }

  .agent-session-drawer__field {
    display: grid;
    gap: 5px;
  }

  .agent-session-drawer__field-label {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .agent-session-drawer__confirm {
    margin: 0;
    color: var(--klc-color-ui-text);
    font-size: 13px;
    line-height: 1.5;
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
