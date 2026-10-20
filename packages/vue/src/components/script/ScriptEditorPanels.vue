<!-- 编辑器底部输出与问题工具页，共用高度调整、折叠和项目滚动条。 -->
<template>
  <section ref="panelHost" class="script-output" :class="{ 'script-output--dragging': dragging }">
    <div
      v-show="expanded"
      ref="resizeHandle"
      class="script-output__resize-handle"
      role="separator"
      aria-label="调整底部面板高度"
      aria-orientation="horizontal"
      :aria-controls="panelId"
      :aria-valuemin="minHeight"
      :aria-valuemax="maxHeight"
      :aria-valuenow="height"
      tabindex="0"
      @pointerdown="startResize"
      @pointermove="resize"
      @pointerup="stopResize"
      @pointercancel="stopResize"
      @lostpointercapture="stopResize"
      @keydown="resizeWithKeyboard"
    />
    <div class="script-output__toolbar">
      <div role="tablist" aria-label="编辑器面板" class="script-output__tabs">
        <button :id="tabId" class="script-output__tab" data-panel="output" type="button" role="tab" :aria-selected="activePanel === 'output'" :tabindex="activePanel === 'output' ? 0 : -1" :aria-controls="panelId" @click="selectPanel('output')" @keydown="onTabKeyDown">输出 <span v-if="logs.length">({{ logs.length }})</span></button>
        <button :id="problemsTabId" class="script-output__tab" data-panel="problems" type="button" role="tab" :aria-selected="activePanel === 'problems'" :tabindex="activePanel === 'problems' ? 0 : -1" :aria-controls="panelId" @click="selectPanel('problems')" @keydown="onTabKeyDown">问题 <span v-if="problems.length">({{ problems.length }})</span></button>
      </div>
      <div class="script-output__actions">
        <BaseTooltip v-if="activePanel === 'output'" content="清空输出" placement="top">
          <button class="script-output__icon-button" type="button" aria-label="清空输出" :disabled="!logs.length" @click="emit('clear')">
            <IconTablerTrash aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip :content="expanded ? '折叠面板' : '展开面板'" placement="top">
          <button class="script-output__icon-button" type="button" :aria-label="expanded ? '折叠面板' : '展开面板'" :aria-expanded="expanded" :aria-controls="panelId" @click="expanded = !expanded">
            <IconTablerChevronDown v-if="expanded" aria-hidden="true" />
            <IconTablerChevronUp v-else aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
    </div>
    <OverlayScrollArea v-show="expanded" persistent :id="panelId" ref="scrollArea" role="tabpanel" :aria-labelledby="activePanel === 'output' ? tabId : problemsTabId" tabindex="0" class="script-output__content" :style="{ height: `${height}px` }" @scroll="onScroll">
      <template v-if="activePanel === 'output'">
      <p v-if="!logs.length" class="script-output__empty">暂无输出。脚本运行时的 console 输出将显示在这里。</p>
      <div v-for="(entry, index) in logs" :key="index" class="script-output__entry" :data-level="entry.level">
        <time :datetime="new Date(entry.time).toISOString()">{{ new Date(entry.time).toLocaleTimeString() }}</time>
        <span class="script-output__level">{{ entry.level }}</span>
        <span class="script-output__bar">{{ entry.barIndex < 0 ? '—' : `#${entry.barIndex}` }}</span>
        <span class="script-output__message">{{ entry.message }}</span>
      </div>
      <p v-if="logs.length >= SCRIPT_OUTPUT_LIMIT" class="script-output__empty">仅保留最近 {{ SCRIPT_OUTPUT_LIMIT }} 条输出。</p>
      </template>
      <template v-else>
        <p v-if="!problems.length" class="script-output__empty">未发现问题。</p>
        <button v-for="(problem, index) in problems" :key="index" type="button" class="script-problems__item" :data-severity="problem.severity" :disabled="!problem.location" @click="emit('reveal-problem', problem)">
          <IconTablerAlertCircle v-if="problem.severity === 'error'" class="script-problems__icon" aria-label="错误" />
          <IconTablerAlertTriangle v-else-if="problem.severity === 'warning'" class="script-problems__icon" aria-label="警告" />
          <IconTablerInfoCircle v-else class="script-problems__icon" aria-label="提示" />
          <span class="script-problems__message">{{ problem.message }}</span>
          <span class="script-problems__location">{{ problem.source }}<template v-if="problem.location"> [{{ problem.location.line }}:{{ problem.location.column }}]</template></span>
        </button>
      </template>
    </OverlayScrollArea>
  </section>
</template>

<script setup lang="ts">
  import { type LogEvent, SCRIPT_OUTPUT_LIMIT } from '@363045841yyt/klinechart-plot-contracts'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import OverlayScrollArea from '@vue-src/components/common/OverlayScrollArea.vue'
  import { useScriptEditorPanels } from '@vue-src/composables/chart/scriptEditor/impl/useScriptEditorPanels.js'
  import type { ScriptEditorProblem } from '@vue-src/composables/chart/scriptEditor/types.js'
  import { computed, useId, useTemplateRef } from 'vue'
  import IconTablerAlertCircle from '~icons/tabler/alert-circle'
  import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'
  import IconTablerChevronDown from '~icons/tabler/chevron-down'
  import IconTablerChevronUp from '~icons/tabler/chevron-up'
  import IconTablerInfoCircle from '~icons/tabler/info-circle'
  import IconTablerTrash from '~icons/tabler/trash'

  const props = withDefaults(
    defineProps<{ logs: readonly LogEvent[]; problems?: readonly ScriptEditorProblem[] }>(),
    { problems: () => [] },
  )
  const emit = defineEmits<{ clear: []; 'reveal-problem': [problem: ScriptEditorProblem] }>()
  const id = useId()
  const tabId = `${id}-output-tab`
  const problemsTabId = `${id}-problems-tab`
  const panelId = `${id}-output-panel`
  const panelHost = useTemplateRef<HTMLElement>('panelHost')
  const scrollArea = useTemplateRef<InstanceType<typeof OverlayScrollArea>>('scrollArea')
  const outputHost = computed(() => scrollArea.value?.viewport ?? null)
  const resizeHandle = useTemplateRef<HTMLElement>('resizeHandle')
  const {
    expanded,
    activePanel,
    selectPanel,
    onTabKeyDown,
    height,
    minHeight,
    maxHeight,
    dragging,
    onScroll,
    startResize,
    resize,
    stopResize,
    resizeWithKeyboard,
  } = useScriptEditorPanels(outputHost, resizeHandle, panelHost, () => props.logs)
</script>

<style scoped>
  .script-output { position: relative; flex-shrink: 0; min-height: 0; border-top: 1px solid var(--klc-color-ui-border); background: var(--klc-color-ui-surface); color: var(--klc-color-ui-text); font-size: var(--klc-text-label-12-font-size, 12px); }
  /* 手柄覆盖面板顶边，不参与高度分配。 */
  .script-output__resize-handle { position: absolute; inset: -1px 0 auto; z-index: 1; height: 2px; cursor: ns-resize; touch-action: none; user-select: none; background: transparent; }
  .script-output__resize-handle:hover { background: var(--klc-brand-accent-text); }
  .script-output__resize-handle:focus-visible { outline: none; }
  .script-output__toolbar, .script-output__actions { display: flex; align-items: center; }
  .script-output__toolbar { justify-content: space-between; min-height: 32px; padding: 0 var(--klc-space-16, 16px); background: var(--klc-color-ui-control-background); }
  .script-output__actions { gap: var(--klc-space-4, 4px); }
  .script-output button { display: inline-flex; align-items: center; justify-content: center; border: 0; padding: 0; background: transparent; color: var(--klc-color-ui-muted); font: inherit; cursor: pointer; }
  .script-output__tabs { display: flex; gap: var(--klc-space-16, 16px); }
  .script-output .script-output__tab { min-height: 32px; gap: var(--klc-space-4, 4px); }
  .script-output .script-output__tab[aria-selected='true'] { color: var(--klc-color-ui-text); box-shadow: inset 0 -2px var(--klc-brand-accent-text); }
  .script-output .script-problems__item { display: grid; grid-template-columns: 16px minmax(0, 1fr) max-content; gap: var(--klc-space-8, 8px); width: 100%; padding: var(--klc-space-8, 8px) 0; text-align: left; align-items: start; color: var(--klc-color-ui-text); }
  .script-output .script-problems__item:disabled { opacity: 1; }
  .script-problems__icon { width: 16px; height: 16px; }
  .script-problems__item[data-severity='error'] .script-problems__icon { color: var(--klc-color-performance-negative); }
  .script-problems__item[data-severity='warning'] .script-problems__icon { color: var(--klc-brand-accent-text); }
  .script-problems__message { white-space: pre-wrap; overflow-wrap: anywhere; }
  .script-problems__location { color: var(--klc-color-ui-muted); font-size: inherit; }
  .script-output__icon-button { width: 24px; height: 24px; border-radius: var(--klc-radius-sm, 4px); }
  .script-output__icon-button svg { width: 16px; height: 16px; }
  .script-output button:hover { background: var(--klc-color-ui-hover); }
  .script-output button:disabled { opacity: 0.4; cursor: default; }
  .script-output button:focus-visible { outline: 2px solid var(--klc-color-ui-focus); outline-offset: -2px; }
  .script-output__content { box-sizing: border-box; padding: var(--klc-space-8, 8px) var(--klc-space-16, 16px); font-family: 'JetBrains Mono', monospace; }
  .script-output__entry { display: grid; grid-template-columns: max-content 5ch 6ch minmax(0, 1fr); gap: var(--klc-space-8, 8px); padding: var(--klc-space-4, 4px) 0; align-items: baseline; }
  .script-output__entry time, .script-output__bar, .script-output__level, .script-output__empty { color: var(--klc-color-ui-muted); }
  .script-output__entry[data-level='error'] .script-output__message, .script-output__entry[data-level='error'] .script-output__level { color: var(--klc-color-performance-negative); }
  .script-output__entry[data-level='warn'] .script-output__level { color: var(--klc-brand-accent-text); }
  .script-output__message { white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
  .script-output__empty { margin: var(--klc-space-8, 8px) 0; text-align: center; }
  @media (max-width: 480px) { .script-output__entry { grid-template-columns: 5ch 5ch minmax(0, 1fr); } .script-output__entry time { display: none; } }
</style>
