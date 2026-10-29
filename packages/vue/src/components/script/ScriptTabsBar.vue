<!-- 脚本标签栏：标签、关闭确认与内置只读提示；快捷操作由父级通过插槽提供。 -->
<template>
  <div class="script-tabs-bar">
    <div ref="tabsHost" class="script-tabs" role="tablist" aria-label="已打开的脚本">
      <div v-for="tab in tabs" :key="tab.id" class="script-tabs__item" :class="{ 'is-active': tab.id === activeTabId, 'is-dragging': tab.id === draggedTabId, 'is-drop-target': tab.id === dropTargetId }" :draggable="!saving" @dragstart="onTabDragStart($event, tab.id)" @dragover="onTabDragOver($event, tab.id)" @drop="onTabDrop($event, tab.id)" @dragend="endTabDrag" @auxclick="onTabAuxClick($event, tab.id)">
        <button :id="`${idPrefix}-${tab.id}`" type="button" role="tab" :aria-controls="`${idPrefix}-code`" :aria-selected="tab.id === activeTabId" :tabindex="tab.id === activeTabId ? 0 : -1" :disabled="saving" class="script-tabs__select" @click="emit('select-tab', tab.id)" @keydown="onTabKeydown($event, tab.id)">
          <ScriptDirtyIndicator v-if="tab.dirty" class="script-tabs__dirty" /><span class="script-tabs__title">{{ tab.title }}.ts</span>
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
    <slot />
  </div>
  <div v-if="activeTabId && identity === 'builtin'" class="script-workspace__readonly">
    内置{{ kind === 'library' ? '库' : '脚本' }}只读<template v-if="kind !== 'library'">，请<button type="button" class="script-workspace__readonly-link script-underline-action" @click="emit('create-copy')">创建副本</button>后编辑</template>
  </div>
</template>

<script setup lang="ts">
  import { useScriptTabs } from '@vue-src/composables/chart/scriptEditor/impl/useScriptTabs.js'
  import type {
    ScriptEditorTab,
    ScriptIdentity,
  } from '@vue-src/composables/chart/scriptEditor/types.js'
  import { useTemplateRef } from 'vue'
  import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'
  import IconTablerX from '~icons/tabler/x'
  import ScriptDirtyIndicator from './ScriptDirtyIndicator.vue'

  const props = withDefaults(
    defineProps<{
      /** 标签与编辑区的共同前缀，保证 aria-controls/labelledby 指向同一面板。 */
      idPrefix: string
      tabs: readonly ScriptEditorTab[]
      activeTabId: string | null
      kind?: 'indicator' | 'library'
      identity: ScriptIdentity
      saving?: boolean
    }>(),
    { kind: 'indicator', saving: false },
  )

  const emit = defineEmits<{
    'select-tab': [id: string]
    'close-tab': [id: string]
    'move-tab': [id: string, targetId: string]
    'create-copy': []
  }>()

  const tabsHost = useTemplateRef<HTMLElement>('tabsHost')
  const {
    pendingClose,
    closingTab,
    requestClose,
    discard,
    onTabAuxClick,
    onTabKeydown,
    draggedTabId,
    dropTargetId,
    onTabDragStart,
    onTabDragOver,
    onTabDrop,
    endTabDrag,
  } = useScriptTabs({
    tabs: () => props.tabs,
    activeTabId: () => props.activeTabId,
    select: (id) => emit('select-tab', id),
    close: (id) => emit('close-tab', id),
    move: (id, targetId) => emit('move-tab', id, targetId),
    tabsHost,
  })
</script>

<style scoped>
  /* 标签栏之外的浮层定位基准，避免 100% 落在整个编辑区高度上。 */
  .script-tabs-bar {
    display: flex;
    position: relative;
    z-index: 10;
    flex-shrink: 0;
  }
  .script-tabs { display: flex; flex: 1; min-width: 0; min-height: 32px; overflow-x: auto; border-bottom: 1px solid var(--klc-color-ui-border); background: var(--klc-color-ui-card); }
  .script-tabs svg { width: 14px; height: 14px; flex-shrink: 0; }
  .script-tabs__item { --script-tab-gutter: 20px; position: relative; display: flex; flex-shrink: 0; max-width: 240px; border-right: 1px solid var(--klc-color-ui-border); border-bottom: 2px solid transparent; }
  .script-tabs__item.is-active { border-bottom-color: var(--klc-brand-accent-text); background: var(--klc-color-ui-surface); }
  .script-tabs__item.is-dragging { opacity: 0.5; }
  .script-tabs__item.is-drop-target { box-shadow: inset 2px 0 var(--klc-brand-accent-text); }
  .script-tabs__select, .script-tabs__close { display: flex; align-items: center; justify-content: center; gap: var(--klc-space-8, 8px); border: 0; background: transparent; color: var(--klc-color-ui-muted); font: inherit; font-size: var(--klc-text-label-12-font-size, 12px); cursor: pointer; }
  /* 两侧操作脱离文字布局，对称留白保证文件名始终在整个标签内居中；操作图标居中于各自的留白区。 */
  .script-tabs__select { flex: 1; min-width: 0; padding: var(--klc-space-8, 8px) var(--script-tab-gutter); }
  .script-tabs__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
  .script-tabs__dirty { position: absolute; left: calc((var(--script-tab-gutter) - 8px) / 2); top: 50%; transform: translateY(-50%); }
  .script-tabs__item.is-active .script-tabs__select { color: var(--klc-color-ui-text); }
  .script-tabs__close { position: absolute; right: 0; top: 50%; transform: translateY(-50%); width: var(--script-tab-gutter); height: 100%; padding: 0; opacity: 0; pointer-events: none; }
  .script-tabs__item:hover .script-tabs__close,
  .script-tabs__item:has(:focus-visible) .script-tabs__close { opacity: 1; pointer-events: auto; }
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

  .script-tabs button:focus-visible,
  .script-tabs__confirmation button:not(.script-underline-action):focus-visible { outline: 2px solid var(--klc-color-ui-focus); outline-offset: -2px; }

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
</style>
