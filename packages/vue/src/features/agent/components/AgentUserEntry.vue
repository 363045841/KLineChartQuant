<!-- 用户条目：气泡展示、复制与原地编辑；编辑能力只存在于这里。 -->
<template>
  <article class="agent-entry agent-entry--user" :class="{ 'agent-entry--editing': editing }">
    <div class="agent-entry__bubble">
      <form v-if="editing" class="agent-entry__editor" @submit.prevent="saveEdit">
        <BaseTextarea
          :ref="bindEditInput"
          v-model="editDraft"
          class="agent-entry__edit-input"
          :min-rows="1"
          :max-rows="12"
          :aria-label="text.editMessage"
          :disabled="editPending"
          @keydown="editKeydown"
        />
        <p v-if="editError" class="agent-entry__edit-error" role="alert">{{ editError }}</p>
        <div class="agent-entry__editor-actions">
          <BaseTooltip :content="text.cancel" placement="top">
            <button
              type="button"
              class="agent-entry__icon-button"
              :disabled="editPending"
              :aria-label="text.cancel"
              @click="cancelEdit"
            >
              <IconX aria-hidden="true" />
            </button>
          </BaseTooltip>
          <BaseTooltip :content="text.saveAndSend" placement="top">
            <BaseIconButton
              shape="circle"
              type="submit"
              class="agent-entry__edit-send agent-primary-button"
              :label="text.saveAndSend"
              :disabled="!canSaveEdit"
              :aria-busy="editPending"
            >
              <IconLoader2
                v-if="editPending"
                class="agent-entry__spinner klc-spin"
                aria-hidden="true"
              />
              <IconArrowUp v-else aria-hidden="true" />
            </BaseIconButton>
          </BaseTooltip>
        </div>
      </form>
      <p v-else class="agent-entry__content">{{ userText }}</p>
    </div>

    <div v-if="!editing" class="agent-entry__actions">
      <BaseTooltip :content="copyLabel" placement="bottom">
        <button type="button" :data-status="copyStatus" :aria-label="copyLabel" @click="copy">
          <IconCheck v-if="copyStatus === 'copied'" aria-hidden="true" />
          <IconAlertTriangle v-else-if="copyStatus === 'failed'" aria-hidden="true" />
          <IconCopy v-else aria-hidden="true" />
        </button>
      </BaseTooltip>
      <BaseTooltip v-if="canEdit" :content="text.editMessage" placement="bottom">
        <button
          type="button"
          :disabled="actionsDisabled"
          :aria-label="text.editMessage"
          @click="beginEdit"
        >
          <IconPencil aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>
  </article>
</template>

<script setup lang="ts">
  import './agent-entry.css'
  import './agent-primary-button.css'

  import BaseIconButton from '@vue-src/components/common/BaseIconButton.vue'
  import { computed } from 'vue'
  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconArrowUp from '~icons/tabler/arrow-up'
  import IconCheck from '~icons/tabler/check'
  import IconCopy from '~icons/tabler/copy'
  import IconLoader2 from '~icons/tabler/loader-2'
  import IconPencil from '~icons/tabler/pencil'
  import IconX from '~icons/tabler/x'
  import BaseTextarea from '../../../components/common/BaseTextarea.vue'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import type { EntryRecord } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import { useMessageEdit } from '../message-edit/impl/use-message-edit.js'
  import type { EditMessageAction } from '../message-edit/types.js'
  import { useMessageCopy } from './use-message-copy.js'

  const props = defineProps<{
    entry: EntryRecord
    locale: AgentLocale
    actionsDisabled: boolean
    editAction?: EditMessageAction
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  const userText = computed(() => {
    const message = props.entry.model?.[0]
    if (props.entry.kind !== 'pi.user' || message?.role !== 'user') return ''
    return typeof message.content === 'string'
      ? message.content
      : message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
  })
  const { status: copyStatus, copy } = useMessageCopy(() => userText.value)
  const {
    editing,
    draft: editDraft,
    pending: editPending,
    error: editError,
    input: editInput,
    canEdit,
    canSave: canSaveEdit,
    begin: beginEdit,
    cancel: cancelEdit,
    save: saveEdit,
    keydown: editKeydown,
  } = useMessageEdit({
    target: () => ({ entryId: props.entry.id, content: userText.value }),
    disabled: () => props.actionsDisabled,
    action: () => props.editAction,
    failureText: () => text.value.editFailed,
  })

  /** BaseTextarea 暴露原生元素（el），供编辑逻辑聚焦与选区操作。 */
  function bindEditInput(instance: unknown): void {
    const el = (instance as { el?: HTMLTextAreaElement | null } | null)?.el
    editInput.value = el instanceof HTMLTextAreaElement ? el : null
  }

  // 图标按钮的无障碍名称随复制反馈状态变化。
  const copyLabel = computed(() =>
    copyStatus.value === 'copied'
      ? text.value.copiedMessage
      : copyStatus.value === 'failed'
        ? text.value.copyFailed
        : text.value.copyMessage,
  )
</script>
