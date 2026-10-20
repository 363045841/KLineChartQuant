<!-- 脚本编辑器工作区：语言栏、CodeMirror 编辑区与错误提示，弹窗和独立窗口共用。 -->
<template>
  <div class="script-workspace">
    <div class="script-workspace__toolbar">
      <div class="script-workspace__toolbar-info">
        <span class="script-workspace__language">TypeScript</span>
        <LoadingSpinner v-if="languageLoading" :size="12" class="script-workspace__spinner" />
      </div>
      <span v-if="identity === 'builtin'" class="script-workspace__readonly">
        内置脚本只读，请<button type="button" class="script-workspace__readonly-link" @click="emit('create-copy')">创建副本</button>后编辑
      </span>
      <div class="script-workspace__toolbar-actions">
        <BaseTooltip
          content="信任脚本可使用原生执行，跳过 QuickJS 层以提升计算速度。仅对你信任的脚本开启。内置脚本默认信任。原生执行不受 QuickJS 的内存限制和超时中断保护。"
          placement="bottom"
        >
          <div class="script-workspace__trust">
            <span>信任脚本</span>
            <ToggleSwitch
              :model-value="trusted"
              :disabled="!editable"
              size="compact"
              aria-label="信任脚本"
              @update:model-value="emit('update:trusted', $event)"
            />
          </div>
        </BaseTooltip>
        <BaseTooltip content="格式化" placement="bottom">
          <button
            type="button"
            class="script-workspace__icon-button"
            aria-label="格式化"
            :disabled="!formatAvailable"
            @click="formatDocument"
          >
            <IconTablerAlignLeft aria-hidden="true" />
          </button>
        </BaseTooltip>
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
    <ScriptEditorPanels :logs="logs" :problems="problems" @clear="emit('clear-output')" @reveal-problem="revealProblem" />
  </div>
</template>

<script setup lang="ts">
  import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import LoadingSpinner from '@vue-src/components/common/LoadingSpinner.vue'
  import ToggleSwitch from '@vue-src/components/common/ToggleSwitch.vue'
  import type {
    ScriptEditorProblem,
    ScriptIdentity,
  } from '@vue-src/composables/chart/scriptEditor/types.js'
  import { useCodeMirror } from '@vue-src/composables/chart/useCodeMirror.js'
  import { computed, useTemplateRef } from 'vue'
  import IconTablerAlignLeft from '~icons/tabler/align-left'
  import IconTablerDots from '~icons/tabler/dots'
  import IconTablerSettings from '~icons/tabler/settings'
  import IconTablerWindowMaximize from '~icons/tabler/window-maximize'
  import ScriptEditorPanels from './ScriptEditorPanels.vue'

  const props = withDefaults(
    defineProps<{
      /** 当前脚本源码，变更通过 update:source 回传。 */
      source: string
      logs?: readonly LogEvent[]
      trusted: boolean
      identity: ScriptIdentity
      saving?: boolean
      /** 宿主保存校验的错误；与语言服务的错误合并展示。 */
      error?: string | null
      /** 是否提供「在新窗口打开」入口；已在独立窗口内时为 false。 */
      detachable?: boolean
    }>(),
    { error: null, detachable: false, saving: false, logs: () => [] },
  )

  const emit = defineEmits<{
    'update:source': [value: string]
    'update:trusted': [value: boolean]
    'open-window': []
    'create-copy': []
    'clear-output': []
  }>()

  const editorHost = useTemplateRef<HTMLElement>('editorHost')
  const source = computed({
    get: () => props.source,
    set: (value) => emit('update:source', value),
  })
  const editable = computed(() => props.identity === 'user' && !props.saving)
  const {
    languageLoading,
    languageError,
    diagnostics,
    revealProblem,
    formatAvailable,
    formatDocument,
  } = useCodeMirror(editorHost, source, (next) => emit('update:source', next), editable)
  const problems = computed<readonly ScriptEditorProblem[]>(() => [
    ...diagnostics.value,
    ...[languageError.value, props.error].flatMap((message) =>
      message ? [{ severity: 'error', message, location: null } satisfies ScriptEditorProblem] : [],
    ),
  ])
</script>

<style scoped>
  .script-workspace {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 160px);
    overflow: hidden;
    border-top: 1px solid var(--klc-color-ui-border);
    border-bottom: 1px solid var(--klc-color-ui-border);
  }

  /* 工具栏三列：左侧按钮组 / 中间提示 / 右侧按钮组，两列按内容撑开，中列吃掉剩余宽度。 */
  .script-workspace__toolbar {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) max-content;
    align-items: center;
    gap: var(--klc-space-12, 12px);
    padding: var(--klc-space-4, 4px) var(--klc-space-16, 16px);
    background: var(--klc-color-ui-control-background);
    border-bottom: 1px solid var(--klc-color-ui-border);
    font-size: var(--klc-text-label-12-font-size, 12px);
  }

  .script-workspace__toolbar-info {
    grid-column: 1;
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    min-width: 0;
  }

  .script-workspace__language {
    color: var(--klc-color-ui-text);
    font-weight: 500;
  }

  .script-workspace__spinner {
    color: var(--klc-color-ui-muted);
  }

  /* 提示在剩余空间内居中；容器变窄时换行，保证创建副本入口始终可见。 */
  .script-workspace__readonly {
    grid-column: 2;
    min-width: 0;
    text-align: center;
    color: var(--klc-color-ui-muted);
  }

  /* 创建副本是行内链接：字号、字重、行高全部继承提示文字，只换成链接蓝且默认不加下划线。 */
  .script-workspace__readonly-link {
    position: relative;
    /* 与「请」「后编辑」之间留出间距，避免文字粘连。 */
    margin: 0 var(--klc-spacing-xs, 4px);
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    color: var(--klc-brand-accent-text);
    text-decoration: none;
    cursor: pointer;
  }

  /* 下划线由伪元素从中间向两侧展开；text-decoration 本身无法参与过渡。 */
  .script-workspace__readonly-link::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 1px;
    background: currentColor;
    transform: scaleX(0);
    transition: transform var(--klc-motion-dur-fast, 160ms) ease;
  }

  .script-workspace__readonly-link:hover::after,
  .script-workspace__readonly-link:focus-visible::after {
    transform: scaleX(1);
  }

  .script-workspace__readonly-link:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    .script-workspace__readonly-link::after {
      transition: none;
    }
  }

  .script-workspace__toolbar-actions {
    grid-column: 3;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--klc-space-4, 4px);
  }

  .script-workspace__trust {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    margin-right: var(--klc-space-8, 8px);
    white-space: nowrap;
    color: var(--klc-color-ui-text);
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
    min-height: 80px;
    flex: 1 1 auto;
    height: clamp(200px, 52dvh, 480px);
    max-height: calc(100dvh - 180px);
    overflow: hidden;
  }

</style>
