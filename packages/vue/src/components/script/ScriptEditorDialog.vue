<!-- 脚本编辑器对话框：BaseModal + 工作区，只编辑文本，不执行脚本。 -->
<template>
  <BaseModal
    :open="open"
    :title="title"
    width="min(94vw, 1040px)"
    max-height="calc(100dvh - 48px)"
    :body-scrollable="false"
    body-padding="0"
    @update:open="emit('update:open', $event)"
  >
    <div class="script-editor-dialog__body">
      <ScriptEditorWorkspace
      :source="source"
      :logs="logs"
      @clear-output="emit('clear-output')"
      :trusted="trusted"
      :identity="identity"
      :saving="saving"
      :error="error"
      :detachable="detachable"
      @update:source="emit('update:source', $event)"
      @update:trusted="emit('update:trusted', $event)"
      @open-window="emit('open-window')"
      @create-copy="emit('create-copy')"
      />
    </div>
    <template #footer>
      <BaseButton @click="emit('update:open', false)">关闭</BaseButton>
      <BaseButton v-if="identity === 'user'" variant="primary" :disabled="saving" :aria-label="saved ? '已保存' : '保存'" @click="emit('save')">
        <IconTablerCheck v-if="saved" class="script-save-icon" aria-hidden="true" />
        <span v-else>保存</span>
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import type { ScriptIdentity } from '@vue-src/composables/chart/scriptEditor/types.js'
  import IconTablerCheck from '~icons/tabler/check'
  import ScriptEditorWorkspace from './ScriptEditorWorkspace.vue'

  withDefaults(
    defineProps<{
      /** 由父组件控制的开关状态。 */
      open: boolean
      /** 当前脚本源码，变更通过 update:source 回传。 */
      source: string
      logs?: readonly LogEvent[]
      trusted: boolean
      identity: ScriptIdentity
      saving?: boolean
      /** 完整脚本保存校验的错误，由宿主返回。 */
      error?: string | null
      /** 最近一次保存是否成功；成功时确认按钮显示勾图标。 */
      saved?: boolean
      /** 对话框标题。 */
      title?: string
      /** 是否提供「在新窗口打开」入口。 */
      detachable?: boolean
    }>(),
    { title: '编辑脚本', saved: false, error: null, detachable: false, saving: false },
  )

  const emit = defineEmits<{
    'update:open': [value: boolean]
    'update:source': [value: string]
    'update:trusted': [value: boolean]
    save: []
    'open-window': []
    'create-copy': []
    'clear-output': []
  }>()
</script>

<style scoped>
  /* Teleport 不转发 class；用 slot 内的真实容器约束工作区，为标题和页脚预留高度。 */
  .script-editor-dialog__body {
    display: flex;
    flex-direction: column;
    height: min(80dvh, 780px);
    max-height: calc(100dvh - 128px);
    min-height: 0;
  }

  .script-editor-dialog__body :deep(.script-workspace) {
    flex: 1;
    min-height: 0;
    max-height: none;
  }

  .script-editor-dialog__body :deep(.script-editor) {
    flex: 1;
    height: auto;
    min-height: 0;
  }

  .script-save-icon {
    width: 16px;
    height: 16px;
  }
</style>
