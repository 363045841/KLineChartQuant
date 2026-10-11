<!-- 单个会话行：展示、重命名及删除确认，编辑模式由抽屉统一控制。 -->
<template>
  <li
    class="agent-session-drawer__item"
    :class="{ 'is-active': active, 'is-editing': mode !== 'idle' }"
  >
    <form
      v-if="mode === 'rename'"
      class="agent-session-drawer__rename"
      @submit.prevent="submitRename"
    >
      <input
        ref="renameInput"
        v-model="draft"
        class="form-control-inline-name"
        type="text"
        autocomplete="off"
        :aria-label="text.sessionNamePrompt"
        @keydown.escape.stop.prevent="emit('cancel')"
      />
      <BaseTooltip :content="text.confirm" placement="bottom">
        <button
          type="submit"
          class="agent-session-drawer__icon-button"
          :aria-label="text.confirm"
          :disabled="!draft.trim()"
        >
          <IconCheck aria-hidden="true" />
        </button>
      </BaseTooltip>
      <BaseTooltip :content="text.cancel" placement="bottom">
        <button
          type="button"
          class="agent-session-drawer__icon-button"
          :aria-label="text.cancel"
          @click="emit('cancel')"
        >
          <IconX aria-hidden="true" />
        </button>
      </BaseTooltip>
    </form>
    <div
      v-else-if="mode === 'delete'"
      class="agent-session-drawer__confirm"
      role="group"
      :aria-label="text.deleteSession"
      @keydown.escape.stop.prevent="emit('cancel')"
    >
      <span class="agent-session-drawer__confirm-text">{{ text.deleteSessionConfirm }}</span>
      <button
        ref="deleteCancel"
        type="button"
        class="agent-session-drawer__text-button"
        @click="emit('cancel')"
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
        :aria-current="active ? 'true' : undefined"
        @click="emit('select')"
      >
        <span class="agent-session-drawer__item-title">{{ session.title }}</span>
      </button>
      <div class="agent-session-drawer__item-actions">
        <BaseTooltip :content="text.renameSession" placement="bottom">
          <button
            type="button"
            class="agent-session-drawer__icon-button"
            :aria-label="`${text.renameSession}: ${session.title}`"
            @click="emit('requestRename')"
          >
            <IconPencil aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip :content="text.deleteSession" placement="bottom">
          <button
            type="button"
            class="agent-session-drawer__icon-button"
            :aria-label="`${text.deleteSession}: ${session.title}`"
            @click="emit('requestDelete')"
          >
            <IconTrash aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
    </template>
  </li>
</template>

<script setup lang="ts">
  import IconCheck from '~icons/tabler/check'
  import IconPencil from '~icons/tabler/pencil'
  import IconTrash from '~icons/tabler/trash'
  import IconX from '~icons/tabler/x'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import type { AgentSessionView } from '../agent-contracts.js'
  import type { AgentLocale } from '../agent-copy.js'
  import { useAgentSessionRow } from './agent-session/impl/useAgentSessionRow.js'
  import type { AgentSessionRowMode } from './agent-session/types.js'

  const props = defineProps<{
    session: AgentSessionView
    active: boolean
    mode: AgentSessionRowMode
    locale: AgentLocale
  }>()
  const draft = defineModel<string>('draft', { required: true })
  const emit = defineEmits<{
    select: []
    requestRename: []
    requestDelete: []
    rename: [title: string]
    delete: []
    cancel: []
  }>()
  const { text, submitRename, confirmDelete } = useAgentSessionRow(props, draft, {
    rename: (title) => emit('rename', title),
    delete: () => emit('delete'),
    cancel: () => emit('cancel'),
  })
</script>

<style scoped src="../../../components/common/form-control.css"></style>
<style scoped src="./agent-icon-button.css"></style>
<style scoped src="./agent-session/impl/agent-session-row.css"></style>
