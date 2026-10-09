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
            :class="{
              'is-active': session.id === activeSessionId,
              'is-editing': renameTarget?.id === session.id || deleteTarget?.id === session.id,
            }"
          >
            <!-- 行内重命名：Enter 保存、Esc 取消，替代「抽屉上再叠一层弹窗」。 -->
            <form
              v-if="renameTarget?.id === session.id"
              class="agent-session-drawer__rename"
              @submit.prevent="submitRename"
            >
              <input
                ref="renameInput"
                v-model="renameDraft"
                type="text"
                autocomplete="off"
                :aria-label="text.sessionNamePrompt"
                @keydown.escape.stop.prevent="closeRename"
              />
              <BaseTooltip :content="text.confirm" placement="bottom">
                <button
                  type="submit"
                  class="agent-session-drawer__icon-button"
                  :aria-label="text.confirm"
                  :disabled="!renameDraft.trim()"
                >
                  <IconCheck aria-hidden="true" />
                </button>
              </BaseTooltip>
              <BaseTooltip :content="text.cancel" placement="bottom">
                <button
                  type="button"
                  class="agent-session-drawer__icon-button"
                  :aria-label="text.cancel"
                  @click="closeRename"
                >
                  <IconX aria-hidden="true" />
                </button>
              </BaseTooltip>
            </form>

            <!-- 删除不可恢复：行内确认并说明后果，焦点落在「取消」。 -->
            <div
              v-else-if="deleteTarget?.id === session.id"
              class="agent-session-drawer__confirm"
              role="group"
              :aria-label="text.deleteSession"
              @keydown.escape.stop.prevent="closeDelete"
            >
              <span class="agent-session-drawer__confirm-text">{{ text.deleteSessionConfirm }}</span>
              <button
                ref="deleteCancel"
                type="button"
                class="agent-session-drawer__text-button"
                @click="closeDelete"
              >
                {{ text.cancel }}
              </button>
              <button
                type="button"
                class="agent-session-drawer__text-button agent-session-drawer__text-button--danger"
                @click="confirmDelete"
              >
                {{ text.deleteSession }}
              </button>
            </div>

            <template v-else>
              <button
                type="button"
                class="agent-session-drawer__select"
                :aria-current="session.id === activeSessionId ? 'true' : undefined"
                @click="$emit('select', session.id)"
              >
                <span class="agent-session-drawer__item-title">{{ session.title }}</span>
              </button>
              <div class="agent-session-drawer__item-actions">
                <BaseTooltip :content="text.renameSession" placement="bottom">
                  <button
                    type="button"
                    class="agent-session-drawer__icon-button"
                    :aria-label="`${text.renameSession}: ${session.title}`"
                    @click="openRename(session)"
                  >
                    <IconPencil aria-hidden="true" />
                  </button>
                </BaseTooltip>
                <BaseTooltip :content="text.deleteSession" placement="bottom">
                  <button
                    type="button"
                    class="agent-session-drawer__icon-button"
                    :aria-label="`${text.deleteSession}: ${session.title}`"
                    @click="openDelete(session)"
                  >
                    <IconTrash aria-hidden="true" />
                  </button>
                </BaseTooltip>
              </div>
            </template>
          </li>
        </ul>
      </aside>
    </div>
  </Transition>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
  import IconCheck from '~icons/tabler/check'
  import IconPencil from '~icons/tabler/pencil'
  import IconPlus from '~icons/tabler/plus'
  import IconTrash from '~icons/tabler/trash'
  import IconX from '~icons/tabler/x'
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
  /** v-for 内的单个 ref 会收集为数组，同一时间只有一行处于编辑态。 */
  const renameInput = useTemplateRef<HTMLInputElement[]>('renameInput')
  const deleteCancel = useTemplateRef<HTMLButtonElement[]>('deleteCancel')
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
    deleteTarget.value = null
    renameDraft.value = session.title
    renameTarget.value = session
    void nextTick(() => {
      const input = renameInput.value?.[0]
      input?.focus()
      input?.select()
    })
  }

  // 退出行内重命名并清空草稿，焦点回到列表面板。
  function closeRename(): void {
    const wasEditing = renameTarget.value !== null
    renameTarget.value = null
    renameDraft.value = ''
    if (wasEditing) void nextTick(() => panel.value?.focus())
  }

  // 提交有效的新名称，交由上层执行重命名。
  function submitRename(): void {
    const target = renameTarget.value
    const title = renameDraft.value.trim()
    if (!target || !title) return
    emit('rename', target.id, title)
    closeRename()
  }

  // 行内删除确认；默认聚焦「取消」，避免误删。
  function openDelete(session: AgentSessionView): void {
    renameTarget.value = null
    deleteTarget.value = session
    void nextTick(() => deleteCancel.value?.[0]?.focus())
  }

  // 退出行内删除确认。
  function closeDelete(): void {
    const wasConfirming = deleteTarget.value !== null
    deleteTarget.value = null
    if (wasConfirming) void nextTick(() => panel.value?.focus())
  }

  // 用户确认后发出删除目标会话的请求。
  function confirmDelete(): void {
    const target = deleteTarget.value
    if (!target) return
    emit('delete', target.id)
    closeDelete()
  }
</script>

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

  .agent-session-drawer__rename,
  .agent-session-drawer__confirm {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    padding: var(--klc-space-4, 4px);
  }

  .agent-session-drawer__rename input {
    flex: 1;
    min-width: 0;
    height: var(--klc-density-default, 32px);
    box-sizing: border-box;
    padding: 0 var(--klc-space-8, 8px);
    border: 1px solid var(--klc-color-ui-accent);
    border-radius: var(--klc-radius-sm, 6px);
    outline: none;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-input);
    font: inherit;
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .agent-session-drawer__confirm-text {
    flex: 1;
    min-width: 0;
    padding-left: var(--klc-space-4, 4px);
    color: var(--agent-text);
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .agent-session-drawer__text-button {
    flex: 0 0 auto;
    height: var(--klc-density-compact, 24px);
    padding: 0 var(--klc-space-8, 8px);
    border: 0;
    border-radius: var(--klc-radius-xs, 4px);
    color: var(--agent-text);
    background: transparent;
    font: inherit;
    font-size: var(--klc-text-12-font-size, 12px);
    cursor: pointer;
  }

  .agent-session-drawer__text-button:hover,
  .agent-session-drawer__text-button:focus-visible {
    background: var(--agent-hover);
  }

  .agent-session-drawer__text-button--danger {
    color: var(--klc-color-ui-danger-text);
    font-weight: 600;
  }

  .agent-session-drawer__item.is-editing {
    background: var(--agent-hover);
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
