<!-- 脚本编辑器对话框：BaseModal + CodeMirror，只编辑文本，不执行脚本。 -->
<template>
  <BaseModal
    :open="open"
    :title="title"
    width="min(92vw, 880px)"
    :body-scrollable="false"
    body-padding="0"
    @update:open="emit('update:open', $event)"
  >
    <div class="script-workspace">
      <div class="script-workspace__toolbar">
        <div class="script-workspace__toolbar-info">
          <span class="script-workspace__language">JavaScript</span>
          <LoadingSpinner v-if="languageLoading" :size="12" class="script-workspace__spinner" />
        </div>
        <div class="script-workspace__toolbar-actions">
          <BaseTooltip content="设置" placement="bottom">
            <button type="button" class="script-workspace__icon-button" aria-label="设置">
              <IconTablerSettings aria-hidden="true" />
            </button>
          </BaseTooltip>
          <BaseTooltip content="更多" placement="bottom">
            <button type="button" class="script-workspace__icon-button" aria-label="更多">
              <IconTablerDots aria-hidden="true" />
            </button>
          </BaseTooltip>
        </div>
      </div>
      <div ref="editorHost" class="script-editor" />
      <p v-if="editorError" class="script-workspace__error" role="alert">{{ editorError }}</p>
    </div>
    <template #footer>
      <BaseButton @click="emit('update:open', false)">关闭</BaseButton>
      <BaseButton
        variant="primary"
        :aria-label="saved ? '已保存' : '保存'"
        @click="emit('save')"
      >
        <IconTablerCheck v-if="saved" class="script-save-icon" aria-hidden="true" />
        <span v-else>保存</span>
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, useTemplateRef } from 'vue'

  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerDots from '~icons/tabler/dots'
  import IconTablerSettings from '~icons/tabler/settings'

  import { useCodeMirror } from '../composables/chart/useCodeMirror.js'
  import BaseButton from './BaseButton.vue'
  import BaseModal from './BaseModal.vue'
  import BaseTooltip from './common/BaseTooltip.vue'
  import LoadingSpinner from './LoadingSpinner.vue'

  const props = withDefaults(
    defineProps<{
      /** 由父组件控制的开关状态。 */
      open: boolean
      /** 当前脚本源码，变更通过 update:source 回传。 */
      source: string
      /** 完整脚本保存校验的错误，由宿主返回。 */
      error?: string | null
      /** 最近一次保存是否成功；成功时确认按钮显示勾图标。 */
      saved?: boolean
      /** 对话框标题。 */
      title?: string
    }>(),
    { title: '编辑脚本', saved: false },
  )

  const emit = defineEmits<{
    'update:open': [value: boolean]
    'update:source': [value: string]
    save: []
  }>()

  const editorHost = useTemplateRef<HTMLElement>('editorHost')
  const source = computed({
    get: () => props.source,
    set: (value) => emit('update:source', value),
  })
  const { languageLoading, languageError } = useCodeMirror(editorHost, source, (next) =>
    emit('update:source', next),
  )
  const editorError = computed(() => props.error || languageError.value)
</script>

<style scoped>
  .script-workspace {
    overflow: hidden;
    border-top: 1px solid var(--klc-color-ui-border);
    border-bottom: 1px solid var(--klc-color-ui-border);
  }

  .script-workspace__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-space-12, 12px);
    padding: var(--klc-space-4, 4px) var(--klc-space-16, 16px);
    background: var(--klc-color-ui-control-background);
    border-bottom: 1px solid var(--klc-color-ui-border);
    font-size: var(--klc-text-label-12-font-size, 12px);
  }

  .script-workspace__language {
    color: var(--klc-color-ui-text);
    font-weight: 500;
  }

  .script-workspace__spinner {
    color: var(--klc-color-ui-muted);
  }

  .script-workspace__toolbar-info {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    min-width: 0;
  }

  .script-workspace__toolbar-actions {
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
  }

  .script-workspace__icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--klc-radius-sm, 4px);
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    transition:
      color var(--klc-motion-dur-fast, 160ms) ease,
      background-color var(--klc-motion-dur-fast, 160ms) ease;
  }

  .script-workspace__icon-button:hover {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .script-workspace__icon-button:focus-visible {
    outline: 2px solid var(--klc-color-ui-text);
    outline-offset: -2px;
  }

  .script-workspace__icon-button svg {
    width: 16px;
    height: 16px;
  }

  .script-editor {
    height: clamp(200px, 52dvh, 480px);
    max-height: calc(100dvh - 180px);
    overflow: hidden;
  }

  .script-workspace__error {
    margin: 0;
    padding: var(--klc-space-8, 8px) var(--klc-space-16, 16px);
    color: var(--klc-color-performance-negative);
    border-top: 1px solid var(--klc-color-ui-border);
    font-size: var(--klc-text-label-12-font-size, 12px);
    max-height: 80px;
    overflow: auto;
  }

  .script-save-icon {
    width: 16px;
    height: 16px;
  }
</style>
