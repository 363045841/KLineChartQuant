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
      <BaseTabs
        :model-value="activePanel"
        :tabs="panelTabs"
        variant="compact"
        aria-label="编辑器面板"
        @update:model-value="selectPanel"
      />
      <div class="script-output__actions">
        <BaseTooltip v-if="activePanel === 'output'" content="清空输出" placement="top">
          <BaseIconButton
            label="清空输出"
            :disabled="!logs.length"
            @click="emit('clear')"
          >
            <IconTablerTrash aria-hidden="true" />
          </BaseIconButton>
        </BaseTooltip>
        <BaseTooltip :content="expanded ? '折叠面板' : '展开面板'" placement="top">
          <BaseIconButton
            :label="expanded ? '折叠面板' : '展开面板'"
            :aria-expanded="expanded"
            :aria-controls="panelId"
            @click="expanded = !expanded"
          >
            <IconTablerChevronDown v-if="expanded" aria-hidden="true" />
            <IconTablerChevronUp v-else aria-hidden="true" />
          </BaseIconButton>
        </BaseTooltip>
      </div>
    </div>
    <OverlayScrollArea persistent :id="panelId" ref="scrollArea" role="tabpanel" aria-label="编辑器面板内容" tabindex="0" class="script-output__content" :class="{ 'is-collapsed': !expanded }" :inert="!expanded" :style="{ height: expanded ? `${height}px` : '0px' }" @scroll="onScroll" @transitionend="onPanelTransitionEnd">
      <template v-if="activePanel === 'output'">
      <BaseEmptyState v-if="!logs.length" size="compact">暂无输出</BaseEmptyState>
      <ScriptOutputEntry
        v-for="entry in logEntries"
        :key="entry.key"
        :level="entry.level"
        :bar="entry.bar"
        :message="entry.message"
        :date-time="entry.dateTime"
        :time-text="entry.timeText"
      />
      <p v-if="logs.length >= SCRIPT_OUTPUT_LIMIT" class="script-output__empty">仅保留最近 {{ SCRIPT_OUTPUT_LIMIT }} 条输出。</p>
      </template>
      <template v-else>
        <BaseEmptyState v-if="!problems.length" size="compact">未发现问题</BaseEmptyState>
        <ScriptProblemItem v-for="(problem, index) in problems" :key="index" :problem="problem" @reveal="emit('reveal-problem', $event)" />
      </template>
    </OverlayScrollArea>
  </section>
</template>

<script setup lang="ts">
  import { type LogEvent, SCRIPT_OUTPUT_LIMIT } from '@363045841yyt/klinechart-plot-contracts'
  import BaseEmptyState from '@vue-src/components/common/BaseEmptyState.vue'
  import BaseIconButton from '@vue-src/components/common/BaseIconButton.vue'
  import BaseTabs from '@vue-src/components/common/BaseTabs.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import OverlayScrollArea from '@vue-src/components/common/OverlayScrollArea.vue'
  import { useScriptEditorPanels } from '@vue-src/composables/chart/scriptEditor/impl/useScriptEditorPanels.js'
  import type { ScriptEditorProblem } from '@vue-src/composables/chart/scriptEditor/types.js'
  import { computed, useId, useTemplateRef } from 'vue'
  import IconTablerChevronDown from '~icons/tabler/chevron-down'
  import IconTablerChevronUp from '~icons/tabler/chevron-up'
  import IconTablerTrash from '~icons/tabler/trash'
  import ScriptOutputEntry from './ScriptOutputEntry.vue'
  import ScriptProblemItem from './ScriptProblemItem.vue'

  const props = withDefaults(
    defineProps<{
      logs: readonly LogEvent[]
      problems?: readonly ScriptEditorProblem[]
      /** 编辑区元素；输出面板据此预留高度，不再按 CSS 类名识别兄弟节点。 */
      editorHost?: HTMLElement | null
      running?: boolean
      /** 当前标签的保存或执行失败；只有它能切换问题页，目录错误不在此列。 */
      documentError?: string | null
    }>(),
    { problems: () => [], editorHost: null, running: false, documentError: null },
  )
  const emit = defineEmits<{ clear: []; 'reveal-problem': [problem: ScriptEditorProblem] }>()
  /** 日志一次性算好展示字段，模板不再重复解析时间。 */
  const logEntries = computed(() =>
    props.logs.map((entry, index) => {
      const time = new Date(entry.time)
      return {
        key: `${entry.time}-${index}`,
        level: entry.level,
        bar: entry.barIndex < 0 ? '—' : `#${entry.barIndex}`,
        message: entry.message,
        dateTime: time.toISOString(),
        timeText: time.toLocaleTimeString(),
      }
    }),
  )
  const id = useId()
  const panelId = `${id}-output-panel`
  const panelHost = useTemplateRef<HTMLElement>('panelHost')
  const scrollArea = useTemplateRef<InstanceType<typeof OverlayScrollArea>>('scrollArea')
  const outputHost = computed(() => scrollArea.value?.viewport ?? null)
  const resizeHandle = useTemplateRef<HTMLElement>('resizeHandle')
  const {
    expanded,
    activePanel,
    selectPanel,
    height,
    minHeight,
    maxHeight,
    dragging,
    onScroll,
    startResize,
    resize,
    stopResize,
    resizeWithKeyboard,
    updateBounds,
  } = useScriptEditorPanels(
    outputHost,
    resizeHandle,
    panelHost,
    () => props.logs,
    () => props.editorHost,
    () => props.running,
    () => props.documentError,
  )

  /** 页签文案带条数；渲染与键盘切换交给 BaseTabs。 */
  const panelTabs = computed(() => [
    {
      id: 'output' as const,
      label: `输出${props.logs.length ? ` (${props.logs.length})` : ''}`,
    },
    {
      id: 'problems' as const,
      label: `问题${props.problems.length ? ` (${props.problems.length})` : ''}`,
    },
  ])

  /** 展开/收起动画结束后按最终尺寸重算可拖拽上限。 */
  function onPanelTransitionEnd(event: TransitionEvent): void {
    if (event.propertyName === 'height') updateBounds()
  }
</script>

<style scoped>
  .script-output { position: relative; flex-shrink: 0; min-height: 0; border-top: 1px solid var(--klc-color-ui-border); background: var(--klc-color-ui-surface); color: var(--klc-color-ui-text); font-size: var(--klc-text-label-12-font-size, 12px); }
  /* 手柄覆盖面板顶边，不参与高度分配。 */
  .script-output__resize-handle { position: absolute; inset: -1px 0 auto; z-index: 1; height: 2px; cursor: ns-resize; touch-action: none; user-select: none; background: transparent; }
  .script-output__resize-handle:hover { background: var(--klc-brand-accent-text); }
  .script-output__resize-handle:focus-visible { outline: 2px solid var(--klc-color-ui-focus); outline-offset: 0; background: var(--klc-color-ui-focus); }
  .script-output__toolbar, .script-output__actions { display: flex; align-items: center; }
  .script-output__toolbar { justify-content: space-between; gap: var(--klc-space-8, 8px); min-height: 32px; padding: 0 var(--klc-space-16, 16px); background: var(--klc-color-ui-card); }
  .script-output__actions { gap: var(--klc-space-4, 4px); }
  /* 高度由用户拖拽决定，收起动画只过渡高度与内边距；拖拽时关闭过渡避免跟手滞后。 */
  .script-output__content {
    box-sizing: border-box;
    padding: var(--klc-space-8, 8px) var(--klc-space-16, 16px);
    font-family: 'JetBrains Mono', monospace;
    transition:
      height var(--klc-motion-dur-base) var(--klc-motion-ease-standard),
      padding var(--klc-motion-dur-base) var(--klc-motion-ease-standard),
      opacity var(--klc-motion-dur-base) var(--klc-motion-ease-standard);
  }
  .script-output__content.is-collapsed { padding-top: 0; padding-bottom: 0; opacity: 0; pointer-events: none; }
  .script-output--dragging .script-output__content { transition: none; }
  .script-output__empty { color: var(--klc-color-ui-muted); margin: var(--klc-space-8, 8px) 0; text-align: center; }
</style>
