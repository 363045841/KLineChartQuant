<!-- 脚本编辑器工作区：语言栏、CodeMirror 编辑区与错误提示，弹窗和独立窗口共用。 -->
<template>
  <div class="script-workspace">
    <div class="script-workspace__toolbar">
      <div class="script-workspace__toolbar-info">
        <span class="script-workspace__language">TypeScript</span>
        <LoadingSpinner v-if="languageLoading" :size="12" class="script-workspace__spinner" />
      </div>
      <span v-if="identity === 'builtin'" class="script-workspace__readonly">
        内置脚本只读，请创建副本后编辑
      </span>
      <div class="script-workspace__toolbar-actions">
        <BaseTooltip content="格式化" placement="bottom">
          <button
            type="button"
            class="script-workspace__icon-button"
            aria-label="格式化"
            :disabled="!editable || languageLoading || !!languageError"
            @click="formatDocument"
          >
            <IconTablerAlignLeft aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseButton v-if="identity === 'builtin'" @click="emit('create-copy')">创建副本</BaseButton>
        <BaseTooltip content="更多" placement="bottom">
          <button type="button" class="script-workspace__icon-button" aria-label="更多">
            <IconTablerDots aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip v-if="detachable" content="在新窗口打开" placement="bottom">
          <button
            type="button"
            class="script-workspace__icon-button"
            aria-label="在新窗口打开"
            @click="emit('open-window')"
          >
            <IconTablerWindowMaximize aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip content="设置" placement="bottom">
          <button type="button" class="script-workspace__icon-button" aria-label="设置">
            <IconTablerSettings aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
    </div>
    <div ref="editorHost" class="script-editor" />
    <p v-if="editorError" class="script-workspace__error" role="alert">{{ editorError }}</p>
  </div>
</template>

<script setup lang="ts">
  import { computed, useTemplateRef } from 'vue'

  import IconTablerAlignLeft from '~icons/tabler/align-left'
  import IconTablerDots from '~icons/tabler/dots'
  import IconTablerSettings from '~icons/tabler/settings'
  import IconTablerWindowMaximize from '~icons/tabler/window-maximize'
  import type { ScriptIdentity } from '../composables/chart/scriptEditor/types.js'
  import { useCodeMirror } from '../composables/chart/useCodeMirror.js'
  import BaseButton from './BaseButton.vue'
  import BaseTooltip from './common/BaseTooltip.vue'
  import LoadingSpinner from './LoadingSpinner.vue'

  const props = withDefaults(
    defineProps<{
      /** 当前脚本源码，变更通过 update:source 回传。 */
      source: string
      identity: ScriptIdentity
      saving?: boolean
      /** 宿主保存校验的错误；与语言服务的错误合并展示。 */
      error?: string | null
      /** 是否提供「在新窗口打开」入口；已在独立窗口内时为 false。 */
      detachable?: boolean
    }>(),
    { error: null, detachable: false, saving: false },
  )

  const emit = defineEmits<{
    'update:source': [value: string]
    'open-window': []
    'create-copy': []
  }>()

  const editorHost = useTemplateRef<HTMLElement>('editorHost')
  const source = computed({
    get: () => props.source,
    set: (value) => emit('update:source', value),
  })
  const editable = computed(() => props.identity === 'user' && !props.saving)
  const { languageLoading, languageError, formatDocument } = useCodeMirror(
    editorHost,
    source,
    (next) => emit('update:source', next),
    editable,
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
    display: grid;
    grid-template-columns: 1fr auto 1fr;
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
    grid-column: 3;
    justify-self: end;
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

  .script-workspace__readonly {
    grid-column: 2;
    text-align: center;
    color: var(--klc-color-ui-muted);
  }

  .script-workspace__icon-button:hover {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .script-workspace__icon-button:focus-visible {
    outline: 2px solid var(--klc-color-ui-text);
    outline-offset: -2px;
  }

  .script-workspace__icon-button:disabled {
    opacity: 0.4;
    cursor: default;
    background: transparent;
    color: var(--klc-color-ui-muted);
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
</style>
