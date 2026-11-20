<!-- 会话行：把会话字段适配到共享可编辑行，结构、样式与行内交互全部由 AgentListRow 提供。 -->
<template>
  <AgentListRow
    v-model:draft="draft"
    :mode="mode"
    :active="active"
    :locale="locale"
    :rename-label="text.sessionNamePrompt"
    :confirm-label="text.deleteSession"
    @select="emit('select')"
    @submit="submitRename"
    @delete="confirmDelete"
    @cancel="emit('cancel')"
  >
    {{ session.title }}
    <template #actions>
      <BaseTooltip :content="text.renameSession" placement="bottom">
        <BaseIconButton
          :label="`${text.renameSession}: ${session.title}`"
          @click="emit('requestRename')"
        >
          <IconPencil aria-hidden="true" />
        </BaseIconButton>
      </BaseTooltip>
      <BaseTooltip :content="text.deleteSession" placement="bottom">
        <BaseIconButton
          tone="danger"
          :label="`${text.deleteSession}: ${session.title}`"
          @click="emit('requestDelete')"
        >
          <IconTrash aria-hidden="true" />
        </BaseIconButton>
      </BaseTooltip>
    </template>
  </AgentListRow>
</template>

<script setup lang="ts">
  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import IconPencil from '~icons/tabler/pencil'
  import IconTrash from '~icons/tabler/trash'
  import type { AgentSessionView } from '../agent-contracts.js'
  import type { AgentLocale } from '../agent-copy/index.js'
  import AgentListRow from './AgentListRow.vue'
  import type { AgentListRowMode } from './agent-row/types.js'
  import { useAgentSessionRow } from './agent-session/impl/useAgentSessionRow.js'

  const props = defineProps<{
    session: AgentSessionView
    active: boolean
    mode: AgentListRowMode
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
  const { text, submitRename, confirmDelete } = useAgentSessionRow(props, {
    rename: (title) => emit('rename', title),
    delete: () => emit('delete'),
    cancel: () => emit('cancel'),
  })
</script>
