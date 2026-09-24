<!-- 展示 Agent 会话入口，并通过事件向宿主请求会话操作、设置或关闭面板。 -->
<template>
  <header class="agent-header">
    <div class="agent-header__top">
      <div class="agent-header__identity">
        <IconSparkles aria-hidden="true" />
        <strong>{{ text.agent }}</strong>
      </div>
      <div class="agent-header__actions">
        <button
          type="button"
          :title="text.newSession"
          :aria-label="text.newSession"
          @click="$emit('create')"
        >
          <IconPlus aria-hidden="true" />
        </button>
        <button
          type="button"
          :title="text.renameSession"
          :aria-label="text.renameSession"
          :disabled="!activeSessionId"
          @click="openRenameDialog"
        >
          <IconPencil aria-hidden="true" />
        </button>
        <button
          type="button"
          :title="text.deleteSession"
          :aria-label="text.deleteSession"
          :disabled="!activeSessionId"
          @click="openDeleteDialog"
        >
          <IconTrash aria-hidden="true" />
        </button>
        <button
          type="button"
          :title="text.settings"
          :aria-label="text.settings"
          @click="$emit('settings')"
        >
          <IconSettings aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="agent-panel-close"
          :title="text.closePanel"
          :aria-label="text.closePanel"
          @click="$emit('close')"
        >
          <IconPanelRightClose aria-hidden="true" />
        </button>
      </div>
    </div>

    <Dropdown
      class="agent-header__sessions"
      :model-value="activeSessionId ?? ''"
      :options="sessionOptions"
      :aria-label="text.agent"
      @update:model-value="$emit('select', $event)"
    />
  </header>

  <BaseModal
    :show="renameOpen"
    :title="text.renameSession"
    width="min(92vw, 360px)"
    @close="closeRenameDialog"
  >
    <form :id="renameFormId" @submit.prevent="submitRename">
      <label class="rename-field">
        <span class="rename-field__label">{{ text.sessionNamePrompt }}</span>
        <input ref="renameInput" v-model="renameDraft" type="text" autocomplete="off" />
      </label>
    </form>

    <template #footer>
      <BaseButton @click="closeRenameDialog">{{ text.cancel }}</BaseButton>
      <BaseButton type="submit" :form="renameFormId" :disabled="!renameDraft.trim()">
        {{ text.confirm }}
      </BaseButton>
    </template>
  </BaseModal>

  <BaseModal
    :show="deleteOpen"
    :title="text.deleteSession"
    width="min(92vw, 360px)"
    @close="closeDeleteDialog"
  >
    <p class="delete-confirm">{{ text.deleteSessionConfirm }}</p>

    <template #footer>
      <BaseButton @click="closeDeleteDialog">{{ text.cancel }}</BaseButton>
      <BaseButton @click="confirmDelete">{{ text.deleteSession }}</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, useId } from 'vue'
  import IconPanelRightClose from '~icons/tabler/layout-sidebar-right-collapse'
  import IconPencil from '~icons/tabler/pencil'
  import IconPlus from '~icons/tabler/plus'
  import IconSettings from '~icons/tabler/settings'
  import IconSparkles from '~icons/tabler/sparkles'
  import IconTrash from '~icons/tabler/trash'
  import BaseButton from '../../../components/BaseButton.vue'
  import BaseModal from '../../../components/BaseModal.vue'
  import Dropdown from '../../../components/Dropdown.vue'
  import type { AgentSessionView } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

  const props = defineProps<{
    sessions: AgentSessionView[]
    activeSessionId: string | null
    locale: AgentLocale
  }>()

  const emit = defineEmits<{
    create: []
    select: [sessionId: string]
    rename: [title: string]
    delete: []
    settings: []
    close: []
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  const sessionOptions = computed(() =>
    props.sessions.map((session) => ({ value: session.id, label: session.title })),
  )

  const renameFormId = useId()
  const renameInput = ref<HTMLInputElement | null>(null)
  const renameOpen = ref(false)
  const renameDraft = ref('')

  // 打开会话重命名弹窗，并预填当前会话名称。
  function openRenameDialog(): void {
    const session = props.sessions.find((item) => item.id === props.activeSessionId)
    renameDraft.value = session?.title ?? ''
    renameOpen.value = true
    void nextTick(() => {
      renameInput.value?.focus()
      renameInput.value?.select()
    })
  }

  // 关闭重命名弹窗并清空草稿。
  function closeRenameDialog(): void {
    renameOpen.value = false
    renameDraft.value = ''
  }

  // 提交有效的新名称，交由宿主执行重命名。
  function submitRename(): void {
    const title = renameDraft.value.trim()
    if (!title) return
    emit('rename', title)
    closeRenameDialog()
  }

  const deleteOpen = ref(false)

  // 打开删除会话确认弹窗。
  function openDeleteDialog(): void {
    deleteOpen.value = true
  }

  // 关闭删除会话确认弹窗。
  function closeDeleteDialog(): void {
    deleteOpen.value = false
  }

  // 用户确认后发出删除当前会话的请求。
  function confirmDelete(): void {
    emit('delete')
    closeDeleteDialog()
  }
</script>

<style scoped>
  .agent-header {
    display: grid;
    gap: 8px;
    padding: var(--agent-header-inset, 12px) var(--agent-header-inset, 12px) 10px;
    border-bottom: 1px solid var(--agent-border);
    background: var(--agent-surface);
  }

  .agent-header__top,
  .agent-header__identity,
  .agent-header__actions {
    display: flex;
    align-items: center;
  }

  .agent-header__top {
    min-width: 0;
    justify-content: space-between;
    gap: 8px;
  }

  .agent-header__identity {
    min-width: 0;
    gap: 7px;
    color: var(--agent-text);
    font-size: 14px;
  }

  .agent-header__identity svg {
    color: var(--agent-accent);
  }

  .agent-header__actions {
    flex: 0 0 auto;
    gap: 2px;
  }

  /* 只作用于头部操作按钮，避免影响弹窗内的 BaseButton。 */
  .agent-header__actions button {
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

  .agent-header__actions button:hover:not(:disabled),
  .agent-header__actions button:focus-visible {
    color: var(--agent-text);
    background: var(--agent-hover);
  }

  .agent-header__actions button:disabled {
    opacity: 0.38;
    cursor: default;
  }

  .agent-header__sessions {
    width: 100%;
    min-width: 0;
    --dropdown-trigger-background: var(--agent-input);
    --dropdown-trigger-color: var(--agent-text);
    --dropdown-trigger-chevron: var(--agent-muted);
    --dropdown-trigger-active-border: var(--agent-border-strong);
    --dropdown-trigger-active-background: var(--agent-hover);
    --dropdown-trigger-focus-border: var(--agent-accent);
    --dropdown-trigger-focus-background: var(--agent-hover);
    --dropdown-trigger-focus-shadow: 0 0 0 2px
      color-mix(in srgb, var(--agent-accent) 24%, transparent);
  }

  .agent-header__sessions :deep(.dropdown__trigger) {
    width: 100%;
    height: 32px;
    padding: 0 9px;
  }

  .agent-header__sessions :deep(.dropdown__value) {
    color: var(--agent-text);
    font-size: 12px;
    font-weight: 400;
  }

  .rename-field {
    display: grid;
    gap: 5px;
  }

  .rename-field__label {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .rename-field input {
    width: 100%;
    height: 34px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    outline: none;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-input);
    font: inherit;
    font-size: 12px;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .delete-confirm {
    margin: 0;
    color: var(--klc-color-ui-text);
    font-size: 13px;
    line-height: 1.5;
  }
</style>
