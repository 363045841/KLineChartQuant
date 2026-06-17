<template>
  <nav class="left-toolbar" aria-label="图表工具栏">
    <div class="left-toolbar__group">
      <div v-for="tool in primaryTools" :key="tool.id" class="tool-item">
        <button
          type="button"
          class="left-toolbar__button"
          :class="{ active: isActive(tool) }"
          :title="tool.title"
          :aria-label="tool.title"
          @click="selectTool(tool)"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <component :is="tool.icon" class="tool-icon" aria-hidden="true" />
          <span
            v-if="tool.children && tool.children.length"
            class="corner-indicator"
            :class="{ open: openGroupId === tool.id }"
            @click.stop="toggleExpand(tool.id)"
            aria-label="展开子菜单"
          ></span>
        </button>

        <Transition name="dropdown">
          <div
            v-if="openGroupId === tool.id && tool.children && tool.children.length"
            class="tool-dropdown"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <button
              v-for="child in tool.children"
              :key="child.id"
              type="button"
              class="left-toolbar__button"
              :class="{ active: selectedToolId === child.id }"
              :title="child.title"
              :aria-label="child.title"
              @click="selectChild(child)"
            >
              <component :is="child.icon" class="tool-icon" aria-hidden="true" />
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <button
        type="button"
        class="left-toolbar__button"
        title="放大"
        aria-label="放大"
        @click="$emit('zoomIn')"
        @pointerdown.stop
        @pointermove.stop
        @pointerup.stop
      >
        <IconTablerZoomIn class="tool-icon" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="left-toolbar__button"
        title="缩小"
        aria-label="缩小"
        @click="$emit('zoomOut')"
        @pointerdown.stop
        @pointermove.stop
        @pointerup.stop
      >
        <IconTablerZoomOut class="tool-icon" aria-hidden="true" />
      </button>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <button
        type="button"
        class="left-toolbar__button"
        :title="isFullscreen ? '退出全屏' : '全屏显示'"
        :aria-label="isFullscreen ? '退出全屏' : '全屏显示'"
        @click="$emit('toggleFullscreen')"
        @pointerdown.stop
        @pointermove.stop
        @pointerup.stop
      >
        <IconTablerMinimize v-if="isFullscreen" class="tool-icon" aria-hidden="true" />
        <IconTablerMaximize v-else class="tool-icon" aria-hidden="true" />
      </button>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <button
        type="button"
        class="left-toolbar__button"
        title="设置"
        aria-label="设置"
        @click="openSettings"
        @pointerdown.stop
        @pointermove.stop
        @pointerup.stop
      >
        <IconTablerSettings class="tool-icon" aria-hidden="true" />
      </button>
    </div>
  </nav>

  <ChartSettingsDialog
    :show="showSettings"
    @close="showSettings = false"
    @confirm="handleConfirmSettings"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import IconTablerPointer from '~icons/tabler/pointer'
import IconTablerChartLine from '~icons/tabler/chart-line'
import IconTablerArrowUpRight from '~icons/tabler/arrow-up-right'
import IconTablerArrowRight from '~icons/tabler/arrow-right'
import IconTablerMinus from '~icons/tabler/minus'
import IconTablerSeparator from '~icons/tabler/separator'
import IconTablerCrosshair from '~icons/tabler/crosshair'
import IconTablerInfoCircle from '~icons/tabler/info-circle'
import IconTablerZoomIn from '~icons/tabler/zoom-in'
import IconTablerZoomOut from '~icons/tabler/zoom-out'
import IconTablerMaximize from '~icons/tabler/maximize'
import IconTablerMinimize from '~icons/tabler/minimize'
import IconTablerSettings from '~icons/tabler/settings'
import IconTablerShape from '~icons/tabler/shape'
import IconTablerChartDots3 from '~icons/tabler/chart-dots-3'
import IconTablerCaretUpDown from '~icons/tabler/caret-up-down'
import IconTablerBrackets from '~icons/tabler/brackets'
import IconTablerArrowsHorizontal from '~icons/tabler/arrows-horizontal'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type ChartSettings,
} from '@363045841yyt/klinechart-core/config'
import { setCanvasProfilerEnabled } from '../debug/canvasProfiler'
import ChartSettingsDialog from './ChartSettingsDialog.vue'

export interface ToolDef {
  id: string
  title: string
  icon: unknown
  children?: ToolDef[]
}

const primaryTools: ToolDef[] = [
  { id: 'cursor', title: '光标', icon: IconTablerPointer },
  {
    id: 'lines',
    title: '线条',
    icon: IconTablerChartLine,
    children: [
      { id: 'trend-line', title: '线段', icon: IconTablerChartLine },
      { id: 'ray', title: '射线', icon: IconTablerArrowUpRight },
      { id: 'h-line', title: '水平线', icon: IconTablerMinus },
      { id: 'h-ray', title: '水平射线', icon: IconTablerArrowRight },
      { id: 'v-line', title: '垂直线', icon: IconTablerSeparator },
      { id: 'crosshair-line', title: '十字线', icon: IconTablerCrosshair },
      { id: 'info-line', title: '信息线', icon: IconTablerInfoCircle },
    ],
  },
  {
    id: 'channels',
    title: '通道',
    icon: IconTablerShape,
    children: [
      { id: 'parallel-channel', title: '平行通道', icon: IconTablerShape },
      { id: 'regression-channel', title: '回归趋势', icon: IconTablerChartDots3 },
      { id: 'flat-line', title: '平滑顶底', icon: IconTablerCaretUpDown },
      { id: 'disjoint-channel', title: '不相交通道', icon: IconTablerBrackets },
    ],
  },
  { id: 'range-select', title: '区间选择', icon: IconTablerArrowsHorizontal },
]

defineProps<{
  isFullscreen?: boolean
}>()

const emit = defineEmits<{
  (e: 'selectTool', toolId: string): void
  (e: 'toggleFullscreen'): void
  (e: 'zoomIn'): void
  (e: 'zoomOut'): void
  (e: 'settingsChange', settings: ChartSettings): void
}>()

const selectedToolId = ref('cursor')
const openGroupId = ref<string | null>(null)
const showSettings = ref(false)

function loadSettings(): ChartSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      const result: ChartSettings = { ...parsed }
      DEFAULT_SETTINGS.forEach((item) => {
        result[item.key] = parsed[item.key] ?? item.default
      })
      return result
    }
  } catch {}
  const defaults: ChartSettings = {}
  DEFAULT_SETTINGS.forEach((item) => {
    defaults[item.key] = item.default
  })
  return defaults
}

function saveSettings(settings: ChartSettings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {}
}

const appliedSettings = ref<ChartSettings>(loadSettings())

function isActive(tool: ToolDef): boolean {
  if (selectedToolId.value === tool.id) return true
  if (tool.children) {
    return tool.children.some((c) => c.id === selectedToolId.value)
  }
  return false
}

function selectTool(tool: ToolDef) {
  if (tool.children?.length) {
    const hasActiveChild = tool.children.some((c) => c.id === selectedToolId.value)
    if (!hasActiveChild) {
      const first = tool.children[0]!
      selectedToolId.value = first.id
      emit('selectTool', first.id)
    }
    toggleExpand(tool.id)
    return
  }
  selectedToolId.value = tool.id
  emit('selectTool', tool.id)
  openGroupId.value = null
}

function selectChild(child: ToolDef) {
  selectedToolId.value = child.id
  emit('selectTool', child.id)
  openGroupId.value = null
}

function toggleExpand(groupId: string) {
  openGroupId.value = openGroupId.value === groupId ? null : groupId
}

function openSettings() {
  showSettings.value = true
}

function getCurrentSettings(): ChartSettings {
  return { ...appliedSettings.value }
}

defineExpose({
  getSettings: getCurrentSettings,
})

function handleConfirmSettings(draft: ChartSettings) {
  appliedSettings.value = { ...draft }
  saveSettings(appliedSettings.value)
  setCanvasProfilerEnabled(!!appliedSettings.value['enableCanvasProfiler'])
  emit('settingsChange', { ...appliedSettings.value })
  showSettings.value = false
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.tool-item')) {
    openGroupId.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true)
  emit('settingsChange', { ...appliedSettings.value })
  setCanvasProfilerEnabled(!!appliedSettings.value['enableCanvasProfiler'])
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<style scoped>
.left-toolbar {
  flex: 0 0 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 5px;
  border: 1px solid var(--klc-color-border-chart);
  border-radius: 3px;
  background: var(--klc-color-background);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  user-select: none;
}

.left-toolbar__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.left-toolbar__divider {
  width: 18px;
  height: 1px;
  background: var(--klc-color-border-chart);
}

/* --- 工具按钮 --- */
.left-toolbar__button {
  position: relative;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: var(--klc-color-axis-text);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.left-toolbar__button:hover {
  border-color: var(--klc-color-axis-line);
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
}

.left-toolbar__button.active {
  border-color: var(--klc-color-border-chart);
  background: var(--klc-color-grid-major);
  color: var(--klc-color-foreground);
}

.left-toolbar__button:focus-visible {
  outline: none;
  border-color: var(--klc-color-axis-text);
}

.tool-icon {
  width: 16px;
  height: 16px;
}

/* --- 角标三角（TradingView 风格） --- */
.corner-indicator {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 8px;
  height: 8px;
  cursor: pointer;
  overflow: hidden;
}

.corner-indicator::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-bottom: 5px solid currentColor;
  opacity: 0.45;
  transition: opacity 0.15s ease;
}

.left-toolbar__button:hover .corner-indicator::after {
  opacity: 0.7;
}

.left-toolbar__button.active .corner-indicator::after {
  opacity: 0.7;
}

.corner-indicator.open::after {
  opacity: 0.8;
}

/* --- 下拉菜单（与工具栏同配色、同按钮样式，高度对齐工具栏宽度） --- */
.tool-dropdown {
  position: absolute;
  left: calc(100% + 13px);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 0 5px;
  height: 40px;
  background: var(--klc-color-tag-bg-white);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--klc-color-border-chart);
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  z-index: 100;
}

/* --- 工具项容器 --- */
.tool-item {
  position: relative;
}

/* --- 下拉动画 --- */
.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-6px);
}

/* --- 响应式 --- */
@media (max-width: 768px), (max-height: 640px) {
  .left-toolbar {
    flex-basis: 36px;
    padding: 6px 4px;
    gap: 5px;
    border-radius: 3px;
  }

  .left-toolbar__group {
    gap: 3px;
  }

  .left-toolbar__button {
    width: 26px;
    height: 26px;
    border-radius: 3px;
  }

  .left-toolbar__divider {
    width: 16px;
  }

  .corner-indicator {
    width: 7px;
    height: 7px;
  }

  .corner-indicator::after {
    border-left-width: 4px;
    border-bottom-width: 4px;
  }

  .tool-dropdown {
    height: 36px;
  }
}

</style>
