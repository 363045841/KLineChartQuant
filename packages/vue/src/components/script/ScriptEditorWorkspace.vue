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
      <nav class="script-files" :class="{ 'is-collapsed': !explorerOpen }" :inert="!explorerOpen" :aria-hidden="!explorerOpen" aria-label="脚本文件目录">
        <div class="script-files__heading">文件</div>
        <label class="script-files__search">
          <IconTablerSearch aria-hidden="true" />
          <input v-model="query" type="search" placeholder="搜索文件…" aria-label="搜索指标和库" />
        </label>
        <div class="script-files__tree">
          <div v-for="group in fileGroups" :key="group.kind" class="script-files__folder">
            <div class="script-files__folder-button">
              <button type="button" class="script-files__folder-toggle" :aria-expanded="group.expanded" @click="folders[group.kind] = !folders[group.kind]">
                <IconTablerChevronDown v-if="group.expanded" aria-hidden="true" /><IconTablerChevronRight v-else aria-hidden="true" />
                <IconTablerFolder aria-hidden="true" /><span>{{ group.label }}</span>
              </button>
              <button type="button" class="script-files__folder-add" :aria-label="`新建${group.label}`" :title="`新建${group.label}`" :disabled="saving" @click="emit('create-script', group.kind)">
                <IconTablerPlus aria-hidden="true" />
              </button>
            </div>
            <ul v-show="group.expanded" class="script-files__list">
              <li v-for="file in group.files" :key="file.id">
                <button type="button" class="script-files__file" :class="{ 'is-active': file.tabId === activeTabId }" :disabled="saving" :title="file.readonly ? `${file.name}.ts · 内置，只读` : `${file.name}.ts`" :aria-current="file.tabId === activeTabId ? 'page' : undefined" @click="file.tabId ? emit('select-tab', file.tabId) : emit('open-script', file.id)">
                  <IconTablerFileCode aria-hidden="true" /><span class="script-files__filename">{{ file.name }}.ts</span><span v-if="file.dirty" aria-label="未保存">●</span><IconTablerLock v-else-if="file.readonly" aria-label="只读" />
                </button>
              </li>
              <li v-if="!group.files.length" class="script-files__empty">暂无文件</li>
            </ul>
          </div>
          <p v-if="!fileGroups.length" class="script-files__empty" role="status">未找到匹配文件</p>
        </div>
      </nav>
      <div class="script-workspace__main">
        <div class="script-tabs-bar">
          <div ref="tabsHost" class="script-tabs" role="tablist" aria-label="已打开的脚本">
            <div v-for="tab in tabs" :key="tab.id" class="script-tabs__item" :class="{ 'is-active': tab.id === activeTabId }" @auxclick="onTabAuxClick($event, tab.id)">
              <button :id="`${workspaceId}-${tab.id}`" type="button" role="tab" :aria-controls="`${workspaceId}-code`" :aria-selected="tab.id === activeTabId" :tabindex="tab.id === activeTabId ? 0 : -1" :disabled="saving" class="script-tabs__select" @click="emit('select-tab', tab.id)" @keydown="onTabKeydown($event, tab.id)">
                <IconTablerFileCode aria-hidden="true" /><span>{{ tab.title }}.ts</span><span v-if="tab.dirty" aria-label="未保存">●</span>
              </button>
              <button type="button" class="script-tabs__close" :aria-label="`关闭 ${tab.title}`" :disabled="saving" @click="requestClose(tab.id)"><IconTablerX aria-hidden="true" /></button>
            </div>
          </div>
          <div v-if="closingTab" class="script-tabs__confirmation" role="alert">
            <div class="script-tabs__confirmation-header">
              <IconTablerAlertTriangle class="script-tabs__confirmation-icon" aria-hidden="true" />
              <span>未保存的更改</span>
            </div>
            <p class="script-tabs__confirmation-text"><strong>{{ closingTab.title }}.ts</strong> 尚未保存，关闭将丢失更改。</p>
            <div class="script-tabs__confirmation-actions">
              <button type="button" class="script-tabs__confirmation-action script-underline-action" @click="pendingClose = null">取消</button>
              <button type="button" class="script-tabs__confirmation-action script-tabs__discard script-underline-action" :disabled="saving" @click="discard">放弃更改</button>
            </div>
          </div>
        </div>
        <div v-if="activeTabId && identity === 'builtin'" class="script-workspace__readonly">
          内置{{ kind === 'library' ? '库' : '脚本' }}只读<template v-if="kind !== 'library'">，请<button type="button" class="script-workspace__readonly-link script-underline-action" @click="emit('create-copy')">创建副本</button>后编辑</template>
        </div>
        <div v-show="activeTabId" :id="`${workspaceId}-code`" ref="editorHost" class="script-editor" role="tabpanel" :aria-labelledby="activeTabId ? `${workspaceId}-${activeTabId}` : undefined" aria-label="脚本代码" />
        <div v-if="!activeTabId" class="script-workspace__empty">从左侧打开文件，或用目录行右侧的 + 新建指标和库</div>
        <ScriptEditorPanels v-show="activeTabId" :logs="logs" :problems="problems" :editor-host="editorHost" @clear="emit('clear-output')" @reveal-problem="revealProblem" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import LoadingSpinner from '@vue-src/components/common/LoadingSpinner.vue'
  import type {
    ScriptEditorProblem,
    ScriptIdentity,
  } from '@vue-src/composables/chart/scriptEditor/types.js'
  import { useCodeMirror } from '@vue-src/composables/chart/useCodeMirror.js'
  import { computed, useId, useTemplateRef } from 'vue'
  import IconTablerWindowMaximize from '~icons/tabler/window-maximize'
  import ScriptEditorPanels from './ScriptEditorPanels.vue'
  import IconTablerShield from '~icons/tabler/shield'
  import IconTablerDeviceFloppy from '~icons/tabler/device-floppy'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerPlus from '~icons/tabler/plus'
  import type { ScriptEditorDocument } from '@vue-src/composables/chart/scriptEditor/types.js'
  import type { ScriptEditorTab } from '@vue-src/composables/chart/scriptEditor/types.js'
  import { useScriptEditorNavigation } from '@vue-src/composables/chart/scriptEditor/impl/useScriptEditorNavigation.js'
  import IconTablerLayoutSidebar from '~icons/tabler/layout-sidebar'
  import IconTablerSearch from '~icons/tabler/search'
  import IconTablerFolder from '~icons/tabler/folder'
  import IconTablerFileCode from '~icons/tabler/file-code'
  import IconTablerChevronDown from '~icons/tabler/chevron-down'
  import IconTablerChevronRight from '~icons/tabler/chevron-right'
  import IconTablerLock from '~icons/tabler/lock'
  import IconTablerX from '~icons/tabler/x'
  import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'

  const props = withDefaults(
    defineProps<{
      /** 当前脚本源码，变更通过 update:source 回传。 */
      source: string
      tabs: readonly ScriptEditorTab[]
      activeTabId: string | null
      kind?: 'indicator' | 'library'
      documents?: readonly ScriptEditorDocument[]
      libraries?: readonly { name: string; source: string }[]
      logs?: readonly LogEvent[]
      trusted: boolean
      identity: ScriptIdentity
      saving?: boolean
      /** 最近一次保存是否成功；成功时保存按钮显示勾图标。 */
      saved?: boolean
      /** 宿主保存校验的错误；与语言服务的错误合并展示。 */
      error?: string | null
      /** 是否提供「在新窗口打开」入口；已在独立窗口内时为 false。 */
      detachable?: boolean
      /** 当前图表的有效主题，决定语法高亮配色。 */
      theme: 'light' | 'dark'
      /** 独立窗口中显示「返回标签页」入口。 */
      returnable?: boolean
    }>(),
    { kind: 'indicator', documents: () => [], libraries: () => [], error: null, detachable: false, saving: false, saved: false, returnable: false, logs: () => [] },
  )

  const emit = defineEmits<{
    'select-tab': [id: string]
    'close-tab': [id: string]
    'create-script': [kind: 'indicator' | 'library']
    'open-script': [id: string]
    'refresh-documents': []
    'update:source': [value: string]
    'update:trusted': [value: boolean]
    save: []
    'open-window': []
    'create-copy': []
    'clear-output': []
    return: []
  }>()

  const editorHost = useTemplateRef<HTMLElement>('editorHost')
  const workspaceId = useId()
  const tabsHost = useTemplateRef<HTMLElement>('tabsHost')
  const { explorerOpen, query, folders, groups: fileGroups, pendingClose, closingTab, requestClose, onTabAuxClick, discard, onTabKeydown } = useScriptEditorNavigation(() => props.documents, () => props.tabs, (id) => emit('select-tab', id), (id) => emit('close-tab', id), tabsHost, () => props.activeTabId)
  const source = computed({
    get: () => props.source,
    set: (value) => emit('update:source', value),
  })
  const editable = computed(() => props.activeTabId !== null && props.identity === 'user' && !props.saving)
  const {
    languageLoading,
    languageError,
    diagnostics,
    revealProblem,
    searchDocument,
  } = useCodeMirror(editorHost, source, (next) => emit('update:source', next), editable, computed(() => props.theme), computed(() => props.libraries), computed(() => props.activeTabId), computed(() => props.tabs.map((tab) => tab.id)))
  const problems = computed<readonly ScriptEditorProblem[]>(() => [
    ...diagnostics.value,
    ...[languageError.value, props.error].flatMap((message) =>
      message ? [{ severity: 'error', message, location: null } satisfies ScriptEditorProblem] : [],
    ),
  ])
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
  /* 与底部输出面板一致的宽度折叠动画；收起后仍保留 DOM 以便过渡。 */
  .script-files {
    display: flex;
    flex-direction: column;
    width: clamp(140px, 22%, 230px);
    flex-shrink: 0;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid var(--klc-color-ui-border);
    background: var(--klc-color-ui-card);
    font-size: var(--klc-text-label-12-font-size, 12px);
    transition:
      width var(--klc-motion-duration-moderate) ease,
      opacity var(--klc-motion-duration-moderate) ease,
      border-right-color var(--klc-motion-duration-moderate) ease;
  }
  .script-files.is-collapsed {
    width: 0;
    opacity: 0;
    border-right-color: transparent;
    pointer-events: none;
  }
  .script-files__heading { padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px); color: var(--klc-color-ui-muted); }
  .script-files__search { display: flex; align-items: center; gap: var(--klc-space-4, 4px); margin: 0 var(--klc-space-8, 8px) var(--klc-space-8, 8px); padding: var(--klc-space-4, 4px); border: 1px solid var(--klc-color-ui-border); border-radius: var(--klc-radius-sm, 4px); color: var(--klc-color-ui-muted); }
  .script-files__search:focus-within { border-color: var(--klc-color-ui-focus); }
  .script-files__search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--klc-color-ui-text); font: inherit; }
  .script-files__tree { flex: 1; overflow: auto; }
  .script-files__list { margin: 0; padding: 0; list-style: none; }
  /* 文件行与目录行共用同一套行基础样式，差异只保留宽度和缩进。 */
  .script-files__folder-button { display: flex; align-items: center; padding-right: var(--klc-space-4, 4px); }
  .script-files__folder-toggle,
  .script-files__file { display: flex; align-items: center; gap: var(--klc-space-4, 4px); min-height: 28px; padding: var(--klc-space-4, 4px) var(--klc-space-8, 8px); border: 0; background: transparent; color: var(--klc-color-ui-text); font: inherit; text-align: left; cursor: pointer; }
  .script-files__folder-toggle { flex: 1; min-width: 0; }
  .script-files__file { width: 100%; padding-left: var(--klc-space-24, 24px); }
  .script-files__folder-toggle:hover, .script-files__file:hover, .script-files__file.is-active { background: var(--klc-color-ui-hover); }
  .script-files__filename { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* 每类目录右侧直接新建，替代数量展示；入口常驻，不依赖悬浮。 */
  .script-files__folder-add { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 20px; height: 20px; padding: 0; border: 0; border-radius: var(--klc-radius-sm, 4px); background: transparent; color: var(--klc-color-ui-muted); cursor: pointer; }
  .script-files__folder-add:hover { background: var(--klc-color-ui-hover); color: var(--klc-color-ui-text); }
  .script-files__folder-add:focus-visible { outline: 2px solid var(--klc-color-ui-focus); outline-offset: -2px; }
  .script-files__folder-add:disabled { opacity: 0.4; cursor: default; }
  .script-files__empty { padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px); color: var(--klc-color-ui-muted); text-align: center; }
  .script-files svg, .script-tabs svg { width: 14px; height: 14px; flex-shrink: 0; }
  /* 标签栏之外的浮层定位基准，避免 100% 落在整个编辑区高度上。 */
  .script-tabs-bar {
    position: relative;
    z-index: 10;
    flex-shrink: 0;
  }
  .script-tabs { display: flex; min-height: 32px; overflow-x: auto; border-bottom: 1px solid var(--klc-color-ui-border); background: var(--klc-color-ui-card); }
  .script-tabs__item { display: flex; flex-shrink: 0; max-width: 240px; border-right: 1px solid var(--klc-color-ui-border); border-bottom: 2px solid transparent; }
  .script-tabs__item.is-active { border-bottom-color: var(--klc-brand-accent-text); background: var(--klc-color-ui-surface); }
  .script-tabs__select, .script-tabs__close { display: flex; align-items: center; justify-content: center; gap: var(--klc-space-8, 8px); border: 0; background: transparent; color: var(--klc-color-ui-muted); font: inherit; font-size: var(--klc-text-label-12-font-size, 12px); cursor: pointer; }
  .script-tabs__select { min-width: 0; padding: var(--klc-space-8, 8px); }
  .script-tabs__select span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .script-tabs__item.is-active .script-tabs__select { color: var(--klc-color-ui-text); }
  .script-tabs__close { padding: var(--klc-space-4, 4px); }
  .script-tabs__close:hover { background: var(--klc-color-ui-hover); color: var(--klc-color-ui-text); }
  .script-tabs__confirmation {
    position: absolute;
    top: calc(100% + var(--klc-space-4, 4px));
    right: var(--klc-space-8, 8px);
    z-index: 10;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-8, 8px);
    width: max-content;
    max-width: min(320px, calc(100% - 2 * var(--klc-space-8, 8px)));
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--klc-radius-md, 8px);
    background: var(--klc-color-ui-input);
    box-shadow: var(--klc-elevation-2, 0 6px 12px rgb(0 0 0 / 0.18));
    color: var(--klc-color-ui-text);
    font-size: var(--klc-text-label-12-font-size, 12px);
  }

  .script-tabs__confirmation-header {
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    color: var(--klc-color-ui-text);
    font-weight: 500;
  }

  .script-tabs__confirmation-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--klc-color-ui-muted);
  }

  .script-tabs__confirmation-text {
    margin: 0;
    line-height: 1.5;
  }

  .script-tabs__confirmation-text strong {
    font-weight: 500;
  }

  .script-tabs__confirmation-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--klc-space-16, 16px);
  }

  /* 文字操作共用下划线动画：下划线从中间展开，不做按钮容器式 hover/focus。 */
  .script-underline-action {
    position: relative;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  .script-underline-action::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 1px;
    background: currentColor;
    transform: scaleX(0);
    transition: transform var(--klc-motion-dur-fast, 160ms) ease;
  }

  .script-underline-action:hover::after,
  .script-underline-action:focus-visible::after {
    transform: scaleX(1);
  }

  @media (prefers-reduced-motion: reduce) {
    .script-underline-action::after {
      transition: none;
    }
  }

  .script-tabs__confirmation-action {
    color: var(--klc-color-ui-muted);
  }

  .script-tabs__confirmation-action:focus-visible {
    outline: 0;
    color: var(--klc-color-ui-text);
  }

  .script-tabs__confirmation-action:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .script-tabs__discard {
    color: var(--klc-color-ui-danger-text);
  }
  .script-files button:focus-visible, .script-tabs button:focus-visible, .script-tabs__confirmation button:not(.script-underline-action):focus-visible { outline: 2px solid var(--klc-color-ui-focus); outline-offset: -2px; }
  @media (max-width: 600px) { .script-files { width: 140px; } }
  @media (prefers-reduced-motion: reduce) { .script-files { transition: none; } }

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

  /* 内置文件提示归当前标签编辑区，操作栏只放控件。 */
  .script-workspace__readonly {
    flex-shrink: 0;
    min-width: 0;
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px);
    border-bottom: 1px solid var(--klc-color-ui-border);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-label-12-font-size, 12px);
  }

  /* 创建副本是行内链接：字号、字重、行高全部继承提示文字，只换成链接蓝且默认不加下划线。 */
  .script-workspace__readonly-link {
    /* 与「请」「后编辑」之间留出间距，避免文字粘连。 */
    margin: 0 var(--klc-spacing-xs, 4px);
    color: var(--klc-brand-accent-text);
    text-decoration: none;
  }

  .script-workspace__readonly-link:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 1px;
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
