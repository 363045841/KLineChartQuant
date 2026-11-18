<!--
  可编辑列表行：空闲、重命名、删除确认三态共用同一行结构与行高。
  行的展示模式由调用方统一维护，本组件只负责渲染、校验与受控聚焦。
-->
<template>
  <li class="agent-list-row" :class="{ 'is-active': active, 'is-editing': mode !== 'idle' }">
    <form v-if="mode === 'rename'" class="agent-list-row__editor" @submit.prevent="submitRename">
      <BaseInput
        ref="renameInput"
        v-model="draft"
        variant="inline"
        autocomplete="off"
        :placeholder="renamePlaceholder"
        :aria-label="renameLabel"
        :aria-invalid="invalid ? 'true' : undefined"
        @keydown.escape.stop.prevent="emit('cancel')"
      />
      <BaseTooltip :content="text.confirm" placement="bottom">
        <BaseIconButton type="submit" :label="text.confirm" :disabled="!canSubmit">
          <IconCheck aria-hidden="true" />
        </BaseIconButton>
      </BaseTooltip>
      <BaseTooltip :content="text.cancel" placement="bottom">
        <BaseIconButton :label="text.cancel" @click="emit('cancel')">
          <IconX aria-hidden="true" />
        </BaseIconButton>
      </BaseTooltip>
    </form>

    <div
      v-else-if="mode === 'delete'"
      class="agent-list-row__confirm"
      role="group"
      :aria-label="confirmLabel"
      @keydown.escape.stop.prevent="emit('cancel')"
    >
      <BaseButton ref="cancelButton" size="sm" @click="emit('cancel')">
        {{ text.cancel }}
      </BaseButton>
      <BaseButton size="sm" class="agent-list-row__danger" @click="confirmDelete">
        {{ confirmLabel }}
      </BaseButton>
    </div>

    <template v-else>
      <button
        type="button"
        class="agent-list-row__select"
        :aria-current="active ? 'true' : undefined"
        @click="emit('select')"
      >
        <span class="agent-list-row__label"><slot /></span>
      </button>
      <div v-if="$slots.actions" class="agent-list-row__actions">
        <slot name="actions" />
      </div>
    </template>
  </li>
</template>

<script setup lang="ts">
  import './agent-row/impl/agent-list-row.css'

  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseIconButton from '@vue-src/components/common/BaseIconButton.vue'
  import BaseInput from '@vue-src/components/common/BaseInput.vue'
  import IconCheck from '~icons/tabler/check'
  import IconX from '~icons/tabler/x'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import type { AgentLocale } from '../agent-copy.js'
  import { useAgentListRow } from './agent-row/impl/useAgentListRow.js'
  import type { AgentListRowMode } from './agent-row/types.js'

  const props = withDefaults(
    defineProps<{
      /** 当前展示模式；编辑态由调用方的唯一编辑目标驱动。 */
      mode: AgentListRowMode
      /** 是否为列表的当前选中项。 */
      active?: boolean
      /** 界面语言，决定行内按钮文案。 */
      locale: AgentLocale
      /** 重命名输入的可访问名称。 */
      renameLabel: string
      /** 重命名输入的空态提示。 */
      renamePlaceholder?: string
      /** 重命名是否处于校验失败态。 */
      invalid?: boolean
      /** 删除操作的名称，同时作为确认按钮文案。 */
      confirmLabel: string
    }>(),
    { active: false, renamePlaceholder: '', invalid: false },
  )

  const draft = defineModel<string>('draft', { required: true })
  const emit = defineEmits<{
    select: []
    submit: [title: string]
    delete: []
    cancel: []
  }>()

  const { text, canSubmit, submitRename, confirmDelete } = useAgentListRow(props, draft, {
    submit: (title) => emit('submit', title),
    delete: () => emit('delete'),
    cancel: () => emit('cancel'),
  })
</script>
