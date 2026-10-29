<!-- 脚本编辑器工作区：左侧操作栏、文件目录与标签编辑区，弹窗和独立窗口共用。 -->
<template>
  <div class="script-workspace" @keydown="onWorkspaceKeydown">
    <aside class="script-workspace__activity" aria-label="编辑器操作">
      <div class="script-workspace__activity-actions">
        <button type="button" class="script-workspace__icon-button" :class="{ 'is-active': explorerOpen }" :title="explorerOpen ? '收起文件目录' : '展开文件目录'" :aria-label="explorerOpen ? '收起文件目录' : '展开文件目录'" :aria-expanded="explorerOpen" @click="explorerOpen = !explorerOpen; emit('refresh-documents')">
          <IconTablerLayoutSidebar aria-hidden="true" />
        </button>
        <BaseTooltip content="搜索代码（Ctrl+F / ⌘F）" placement="right">
          <button type="button" class="script-workspace__icon-button" aria-label="搜索代码" :disabled="!activeTabId" @click="searchDocument"><IconTablerSearch aria-hidden="true" /></button>
        </BaseTooltip>
        <BaseTooltip :content="trusted ? '已信任：使用原生执行，点击取消' : '信任脚本可使用原生执行，跳过 QuickJS 层以提升计算速度'" placement="right">
          <button
            type="button"
            class="script-workspace__icon-button script-workspace__trust-button"
            :class="{ 'is-trusted': trusted }"
            :aria-label="trusted ? '取消信任脚本' : '信任脚本'"
            :aria-pressed="trusted"
            :disabled="!editable"
            @click="emit('update:trusted', !trusted)"
          >
            <IconTablerShield aria-hidden="true" />
            <IconTablerCheck v-if="trusted" class="script-workspace__trust-check" aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip v-if="detachable" content="在新窗口打开" placement="right">
          <button
            type="button"
            class="script-workspace__icon-button"
            aria-label="在新窗口打开"
            @click="emit('open-window')"
          >
            <IconTablerWindowMaximize aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip v-else-if="returnable" content="返回标签页" placement="right">
          <button
            type="button"
            class="script-workspace__icon-button"
            aria-label="返回标签页"
            @click="emit('return')"
          >
            <IconTablerWindowMaximize aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
      <div class="script-workspace__activity-bottom">
        <BaseTooltip v-if="identity === 'user'" :content="saved ? '已保存' : '保存（Ctrl+S / ⌘S）'" placement="right">
          <button type="button" class="script-workspace__icon-button" :aria-label="saved ? '已保存' : '保存'" :disabled="saving" @click="emit('save')">
            <IconTablerCheck v-if="saved" aria-hidden="true" />
            <IconTablerDeviceFloppy v-else aria-hidden="true" />
          </button>
        </BaseTooltip>
        <LoadingSpinner v-if="languageLoading" :size="12" class="script-workspace__spinner" aria-label="语言服务加载中" />
      </div>
    </aside>
    <div class="script-workspace__body">
      <ScriptFileTree
        :documents="documents"
        :folders="folders"
        :tabs="tabs"
        :active-tab-id="activeTabId"
        :saving="saving"
        :executing="executing"
        :tree-error="treeError"
        :open="explorerOpen"
        @select-tab="emit('select-tab', $event)"
        @open-script="emit('open-script', $event)"
        @tree-action="emit('tree-action', $event)"
      />
      <div class="script-workspace__main">
        <ScriptTabsBar
          :id-prefix="workspaceId"
          :tabs="tabs"
          :active-tab-id="activeTabId"
          :kind="kind"
          :identity="identity"
          :saving="saving"
          @select-tab="emit('select-tab', $event)"
          @close-tab="emit('close-tab', $event)"
          @move-tab="(id, targetId) => emit('move-tab', id, targetId)"
          @create-copy="emit('create-copy')"
        >
          <div class="script-quick-actions" role="group" aria-label="脚本快捷操作">
            <BaseTooltip :content="executing === 'run' ? '运行中…' : '运行代码'" placement="bottom">
              <button type="button" class="script-workspace__icon-button" aria-label="运行代码" :disabled="!activeTabId || kind !== 'indicator' || saving || !!executing" :aria-busy="executing === 'run'" @click="emit('run')"><LoadingSpinner v-if="executing === 'run'" :size="16" /><IconTablerPlayerPlay v-else aria-hidden="true" /></button>
            </BaseTooltip>
            <BaseTooltip content="添加到图表" placement="bottom">
              <button type="button" class="script-workspace__icon-button" aria-label="添加到图表" :disabled="!activeTabId || kind !== 'indicator' || saving || !!executing" :aria-busy="executing === 'add-to-chart'" @click="emit('add-to-chart')"><LoadingSpinner v-if="executing === 'add-to-chart'" :size="16" /><IconTablerPlus v-else aria-hidden="true" /></button>
            </BaseTooltip>
          </div>
        </ScriptTabsBar>
        <div v-show="activeTabId" :id="`${workspaceId}-code`" ref="editorHost" class="script-editor" role="tabpanel" :aria-labelledby="activeTabId ? `${workspaceId}-${activeTabId}` : undefined" aria-label="脚本代码" />
        <div v-if="!activeTabId" class="script-workspace__empty">从左侧打开文件，或用目录行右侧的 + 新建指标和库</div>
        <ScriptEditorPanels v-show="activeTabId" :logs="logs" :problems="problems" :editor-host="editorHost" :running="executing === 'run'" :document-error="documentError" @clear="emit('clear-output')" @reveal-problem="revealProblem" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import LoadingSpinner from '@vue-src/components/common/LoadingSpinner.vue'
  import type {
    ScriptEditorDocument,
    ScriptEditorFolder,
    ScriptEditorProblem,
    ScriptEditorTab,
    ScriptIdentity,
    ScriptTreeAction,
  } from '@vue-src/composables/chart/scriptEditor/types.js'
  import { useCodeMirror } from '@vue-src/composables/chart/useCodeMirror.js'
  import { computed, ref, useId, useTemplateRef } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerDeviceFloppy from '~icons/tabler/device-floppy'
  import IconTablerLayoutSidebar from '~icons/tabler/layout-sidebar'
  import IconTablerPlayerPlay from '~icons/tabler/player-play'
  import IconTablerPlus from '~icons/tabler/plus'
  import IconTablerSearch from '~icons/tabler/search'
  import IconTablerShield from '~icons/tabler/shield'
  import IconTablerWindowMaximize from '~icons/tabler/window-maximize'
  import ScriptEditorPanels from './ScriptEditorPanels.vue'
  import ScriptFileTree from './ScriptFileTree.vue'
  import ScriptTabsBar from './ScriptTabsBar.vue'

  const props = withDefaults(
    defineProps<{
      /** 当前脚本源码，变更通过 update:source 回传。 */
      source: string
      tabs: readonly ScriptEditorTab[]
      activeTabId: string | null
      kind?: 'indicator' | 'library'
      documents?: readonly ScriptEditorDocument[]
      folders?: readonly ScriptEditorFolder[]
      libraries?: readonly { name: string; source: string }[]
      logs?: readonly LogEvent[]
      trusted: boolean
      identity: ScriptIdentity
      saving?: boolean
      executing?: 'run' | 'add-to-chart' | null
      /** 最近一次保存是否成功；成功时保存按钮显示勾图标。 */
      saved?: boolean
      /** 宿主保存校验的错误；与语言服务的错误合并展示。 */
      error?: string | null
      /** 调试或添加到图表的失败；底部面板据此切换问题页。 */
      executionError?: string | null
      /** 文件树操作失败；只展示在目录区域。 */
      treeError?: string | null
      /** 是否提供「在新窗口打开」入口；已在独立窗口内时为 false。 */
      detachable?: boolean
      /** 当前图表的有效主题，决定语法高亮配色。 */
      theme: 'light' | 'dark'
      /** 独立窗口中显示「返回标签页」入口。 */
      returnable?: boolean
    }>(),
    {
      kind: 'indicator',
      documents: () => [],
      folders: () => [],
      libraries: () => [],
      error: null,
      executionError: null,
      treeError: null,
      detachable: false,
      saving: false,
      saved: false,
      returnable: false,
      logs: () => [],
    },
  )

  const emit = defineEmits<{
    'select-tab': [id: string]
    'close-tab': [id: string]
    'move-tab': [id: string, targetId: string]
    'tree-action': [action: ScriptTreeAction]
    'open-script': [id: string]
    'refresh-documents': []
    'update:source': [value: string]
    'update:trusted': [value: boolean]
    save: []
    run: []
    'add-to-chart': []
    'open-window': []
    'create-copy': []
    'clear-output': []
    return: []
  }>()

  const editorHost = useTemplateRef<HTMLElement>('editorHost')
  const workspaceId = useId()
  /** 目录展开是布局状态，与文件树内部搜索状态分开。 */
  const explorerOpen = ref(true)
  const source = computed({
    get: () => props.source,
    set: (value) => emit('update:source', value),
  })
  const editable = computed(
    () => props.activeTabId !== null && props.identity === 'user' && !props.saving,
  )
  const { languageLoading, languageError, diagnostics, revealProblem, searchDocument } =
    useCodeMirror(
      editorHost,
      source,
      (next) => emit('update:source', next),
      editable,
      computed(() => props.theme),
      computed(() => props.libraries),
      computed(() => props.activeTabId),
      computed(() => props.tabs.map((tab) => tab.id)),
    )
  const problems = computed<readonly ScriptEditorProblem[]>(() => [
    ...diagnostics.value,
    ...[languageError.value, props.error, props.executionError].flatMap((message) =>
      message ? [{ severity: 'error', message, location: null } satisfies ScriptEditorProblem] : [],
    ),
  ])
  /** 面板只按当前文档的失败展开；运行失败的优先级高于保存失败。 */
  const documentError = computed(() => props.executionError ?? props.error)
  /** 编辑器内 Ctrl/⌘+S 与工具栏保存共用同一提交入口。 */
  function onWorkspaceKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (props.identity === 'user' && !props.saving) emit('save')
    }
  }
</script>

<style scoped>
  .script-workspace {
    display: flex;
    flex-direction: row;
    max-height: calc(100dvh - 160px);
    overflow: hidden;
    border-top: 1px solid var(--klc-color-ui-border);
    border-bottom: 1px solid var(--klc-color-ui-border);
  }
  .script-workspace__body { display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
  .script-workspace__main { position: relative; display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
  .script-workspace__empty { display: grid; flex: 1; place-content: center; padding: var(--klc-space-16, 16px); color: var(--klc-color-ui-muted); text-align: center; }
  .script-quick-actions { display: flex; flex-shrink: 0; align-items: center; gap: var(--klc-space-4); padding: 0 var(--klc-space-4); border-bottom: 1px solid var(--klc-color-ui-border); background: var(--klc-color-ui-card); }
  .script-quick-actions .script-workspace__icon-button { width: 24px; height: 24px; }
  .script-quick-actions .script-workspace__icon-button svg { width: 16px; height: 16px; }

  /* 操作栏固定在目录左侧，收起目录后仍保留全部入口。 */
  .script-workspace__activity {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 48px;
    min-height: 0;
    gap: var(--klc-space-8, 8px);
    padding-block: var(--klc-space-8, 8px);
    overflow-y: auto;
    background: var(--klc-color-ui-card);
    border-right: 1px solid var(--klc-color-ui-border);
  }

  .script-workspace__activity-actions,
  .script-workspace__activity-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--klc-space-8, 8px);
  }

  .script-workspace__activity-bottom {
    margin-top: auto;
  }

  .script-workspace__spinner {
    color: var(--klc-color-ui-muted);
  }

  /* 信任按钮：盾牌为底，已信任时在右下角叠加小勾。 */
  .script-workspace__trust-button {
    position: relative;
  }

  .script-workspace__trust-button.is-trusted {
    color: var(--klc-brand-accent-text);
  }

  .script-workspace__icon-button .script-workspace__trust-check {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 10px;
    height: 10px;
    padding: 1px;
    border-radius: 50%;
    background: var(--klc-color-ui-card);
    color: var(--klc-brand-accent-text);
    box-sizing: content-box;
  }

  .script-workspace__icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
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

  .script-workspace__icon-button:hover,
  .script-workspace__icon-button.is-active {
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
    width: 20px;
    height: 20px;
  }

  .script-editor {
    min-height: 80px;
    flex: 1 1 auto;
    height: clamp(200px, 52dvh, 480px);
    max-height: calc(100dvh - 180px);
    overflow: hidden;
  }
</style>
