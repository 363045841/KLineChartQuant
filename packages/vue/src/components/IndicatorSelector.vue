<template>
  <div class="indicator-selector">
    <div class="indicator-scroll-container">
      <div class="indicator-list">
        <!-- 已激活的指标 -->
        <template v-for="indicator in activeIndicatorsList" :key="indicator.id">
          <div
            v-if="indicator.id === firstActiveSubIndicatorId"
            class="indicator-divider"
            aria-hidden="true"
          ></div>

          <div
            class="indicator-item"
            :class="{
              draggable: isSubIndicatorId(indicator.id),
              'drag-over': dragOverIndicatorId === indicator.id,
              'is-dragging': draggingIndicatorId === indicator.id,
            }"
            :draggable="isSubIndicatorId(indicator.id)"
            @dragstart="onDragStart($event, indicator.id)"
            @dragover.prevent="onDragOver($event, indicator.id)"
            @drop.prevent="onDrop($event, indicator.id)"
            @dragend="onDragEnd"
          >
            <div
              class="indicator-btn-wrapper"
              @mouseenter="hoveredIndicator = indicator.id"
              @mouseleave="hoveredIndicator = null"
            >
              <button
                class="indicator-btn"
                :class="{ active: true, hovering: hoveredIndicator === indicator.id }"
              >
                <span class="btn-content">
                  {{ indicator.label }}
                  <span v-if="indicator.params?.length" class="param-hint">
                    ({{ getParamDisplay(indicator) }})
                  </span>
                </span>
                <!-- 悬浮操作层 -->
                <Transition name="fade">
                  <div v-if="hoveredIndicator === indicator.id" class="hover-overlay">
                    <button
                      v-if="indicator.params?.length"
                      class="action-btn settings-btn"
                      @click.stop="showParams(indicator.id)"
                      title="编辑参数"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path
                          d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                        />
                      </svg>
                    </button>
                    <span v-if="indicator.params?.length" class="divider"></span>
                    <button
                      class="action-btn remove-btn"
                      @click.stop="removeIndicator(indicator.id)"
                      title="移除指标"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path
                          d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                        />
                      </svg>
                    </button>
                  </div>
                </Transition>
              </button>
            </div>
          </div>
        </template>

        <!-- 添加按钮 -->
        <div class="indicator-item">
          <button ref="addBtnRef" class="add-btn" @click.stop="controller.toggleMenu()" title="添加指标">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 添加指标弹窗 -->
    <Teleport :to="teleportTarget">
      <Transition name="overlay">
        <div v-if="menuOpen" class="selector-overlay" @click="controller.closeMenu()">
          <Transition name="modal">
            <div v-if="menuOpen" class="selector-modal" @click.stop>
              <!-- 弹窗头部 -->
              <div class="modal-header">
                <div class="header-title">
                  <span class="title-text">添加指标</span>
                  <span class="title-sub">{{ catalogLen }} 个可用指标</span>
                </div>
                <div class="header-actions">
                  <button
                    class="view-toggle-btn"
                    :class="{ active: isCompactView }"
                    @click="isCompactView = !isCompactView"
                    title="简洁模式"
                  >
                    <svg
                      v-if="!isCompactView"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="currentColor"
                    >
                      <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path
                        d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h4v4H7V7zm0 6h4v4H7v-4zm6-6h4v4h-4V7zm0 6h4v4h-4v-4z"
                      />
                    </svg>
                  </button>
                  <button class="modal-close" @click="controller.closeMenu()" title="关闭">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path
                        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- 弹窗主体 -->
              <div class="modal-body">
                <!-- 搜索框 -->
                <div class="search-box">
                  <svg
                    class="search-icon"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                  >
                    <path
                      d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                    />
                  </svg>
                  <input
                    :value="searchQuery" @input="controller.setSearchQuery(($event.target as HTMLInputElement).value)"
                    type="text"
                    class="search-input"
                    placeholder="搜索指标名称..."
                  />
                </div>
                <!-- 主图指标区域 -->
                <div v-if="filteredMain.length > 0" class="indicator-section">
                  <div class="section-header">
                    <span class="section-title">主图指标</span>
                    <span class="section-count">{{ filteredMain.length }}</span>
                  </div>
                  <div class="indicator-grid" :class="{ compact: isCompactView }">
                    <button
                      v-for="indicator in filteredMain"
                      :key="indicator.id"
                      class="indicator-card"
                      :class="{ active: isActive(indicator.id), compact: isCompactView }"
                      @click="
                        isActive(indicator.id)
                          ? removeIndicator(indicator.id)
                          : addIndicator(indicator.id)
                      "
                    >
                      <template v-if="isCompactView">
                        <span class="card-label">{{ indicator.label }}</span>
                        <span class="card-tooltip">{{ indicator.name }}</span>
                      </template>
                      <template v-else>
                        <div class="card-header">
                          <span class="card-label">{{ indicator.label }}</span>
                          <div class="card-header-actions">
                            <button
                              v-if="indicator.params?.length"
                              class="card-settings-btn"
                              @click.stop="showParams(indicator.id)"
                              title="编辑参数"
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <path
                                  d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div class="card-name">{{ indicator.name }}</div>
                      </template>
                    </button>
                  </div>
                </div>

                <!-- 分隔线 -->
                <div
                  v-if="filteredMain.length > 0 && filteredSub.length > 0"
                  class="section-divider"
                ></div>

                <!-- 无匹配结果提示 -->
                <div v-if="!hasSearchResults && searchQuery.trim()" class="no-results">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                    <path
                      d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                    />
                  </svg>
                  <p>未找到匹配的指标</p>
                  <span class="no-results-hint">请尝试其他关键词</span>
                </div>

                <!-- 副图指标区域 -->
                <div v-if="filteredSub.length > 0" class="indicator-section">
                  <div class="section-header">
                    <span class="section-title">副图指标</span>
                    <span class="section-count">{{ filteredSub.length }}</span>
                  </div>
                  <div class="indicator-grid" :class="{ compact: isCompactView }">
                    <button
                      v-for="indicator in filteredSub"
                      :key="indicator.id"
                      class="indicator-card"
                      :class="{ active: isActive(indicator.id), compact: isCompactView }"
                      @click="
                        isActive(indicator.id)
                          ? removeIndicator(indicator.id)
                          : addIndicator(indicator.id)
                      "
                    >
                      <template v-if="isCompactView">
                        <span class="card-label">{{ indicator.label }}</span>
                        <span class="card-tooltip">{{ indicator.name }}</span>
                      </template>
                      <template v-else>
                        <div class="card-header">
                          <span class="card-label">{{ indicator.label }}</span>
                          <div class="card-header-actions">
                            <button
                              v-if="indicator.params?.length"
                              class="card-settings-btn"
                              @click.stop="showParams(indicator.id)"
                              title="编辑参数"
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <path
                                  d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div class="card-name">{{ indicator.name }}</div>
                      </template>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 弹窗底部 -->
              <div class="modal-footer">
                <div class="footer-info">
                  <span class="info-text">已激活 {{ activeCount }} 个指标</span>
                </div>
                <button class="btn btn-confirm" @click="controller.closeMenu()">确认</button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>

    <!-- 参数编辑弹窗 -->
    <IndicatorParams
      v-if="currentIndicator"
      :visible="paramsVisible"
      :indicator-id="currentIndicator.id"
      :indicator-name="currentIndicator.name"
      :indicator-description="currentIndicator.description"
      :params="currentIndicator.params || []"
      :values="getParamValues(currentIndicator.id)"
      @close="paramsVisible = false"
      @confirm="onParamsConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import IndicatorParams from './IndicatorParams.vue'
import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'
import { coreSignalToVueRef } from '../index'
import {
  createIndicatorSelectorController,
  type IndicatorDefinition,
  allIndicators,
  findIndicator,
  isSubIndicatorId,
  type Indicator,
} from '@363045841yyt/klinechart-core/controllers'

const props = defineProps<{
  activeIndicators?: string[]
  indicatorParams?: Record<string, Record<string, unknown>>
}>()

const emit = defineEmits<{
  toggle: [indicatorId: string, active: boolean]
  updateParams: [indicatorId: string, params: Record<string, number>]
  reorderSubIndicators: [orderedIndicatorIds: string[]]
}>()

// ── 将 Indicator[] 转换为 IndicatorDefinition[] ──
function toIndicatorDefinitions(source: typeof allIndicators): IndicatorDefinition[] {
  return source.map((i) => ({
    id: i.id,
    label: i.label,
    name: i.name,
    description: i.description,
    role: i.pane,
    params: (i.params ?? []).map((p) => ({
      key: p.key,
      label: p.label,
      type: p.type,
      default: p.default ?? (p.type === 'number' ? 0 : ''),
      min: p.min,
      max: p.max,
      step: p.step,
    })),
  }))
}

// ── Controller ──
const controller = createIndicatorSelectorController({
  catalog: toIndicatorDefinitions(allIndicators),
})

// ── 从 Controller Signal 桥接的 Vue 响应式状态 ──
const menuOpen = coreSignalToVueRef(controller.menuOpen)
const searchQuery = coreSignalToVueRef(controller.searchQuery)
const filteredMain = coreSignalToVueRef(controller.filteredMain)
const filteredSub = coreSignalToVueRef(controller.filteredSub)

const hasSearchResults = computed(
  () => filteredMain.value.length > 0 || filteredSub.value.length > 0,
)

const catalogLen = controller.catalog.peek().length

// ── 本地 UI 状态（非 Controller 管理的纯 UI 状态） ──
const addBtnRef = ref<HTMLButtonElement | null>(null)
const paramsVisible = ref(false)
const currentIndicatorId = ref<string | null>(null)
const hoveredIndicator = ref<string | null>(null)
const dragOverIndicatorId = ref<string | null>(null)
const draggingIndicatorId = ref<string | null>(null)
const isCompactView = ref(false)

// Teleport target for fullscreen modal visibility
const teleportTarget = useFullscreenTeleportTarget()

const activeIndicatorsList = computed(() => {
  if (!props.activeIndicators?.length) return []
  return props.activeIndicators
    .map((id) => findIndicator(id))
    .filter((i): i is Indicator => i !== undefined)
    .sort((a, b) => {
      if (a.pane === b.pane) return 0
      return a.pane === 'main' ? -1 : 1
    })
})

const firstActiveSubIndicatorId = computed(() => {
  const hasMain = activeIndicatorsList.value.some((indicator) => indicator.pane === 'main')
  if (!hasMain) return null
  const firstSub = activeIndicatorsList.value.find((indicator) => indicator.pane === 'sub')
  return firstSub?.id ?? null
})

const currentIndicator = computed(() => {
  if (!currentIndicatorId.value) return null
  return findIndicator(currentIndicatorId.value)
})

const activeCount = computed(() => props.activeIndicators?.length ?? 0)

function isActive(indicatorId: string): boolean {
  return props.activeIndicators?.includes(indicatorId) ?? false
}

function addIndicator(indicatorId: string) {
  if (isActive(indicatorId)) return

  const indicator = findIndicator(indicatorId)
  if (!indicator) return

  if (indicator.pane === 'main') {
    const allItems = allIndicators
    allItems
      .filter((i) => i.id !== indicatorId && isActive(i.id) && i.pane === 'main')
      .forEach((i) => emit('toggle', i.id, false))
  }

  emit('toggle', indicatorId, true)
}

function removeIndicator(indicatorId: string) {
  emit('toggle', indicatorId, false)
}

function showParams(indicatorId: string) {
  currentIndicatorId.value = indicatorId
  paramsVisible.value = true
}

function getParamValues(indicatorId: string): Record<string, number> {
  const indicator = findIndicator(indicatorId)
  if (!indicator?.params) return {}

  const defaultParams: Record<string, number> = {}
  for (const p of indicator.params) {
    defaultParams[p.key] = p.default ?? p.min ?? 1
  }

  const userParams = props.indicatorParams?.[indicatorId] || {}
  const result: Record<string, number> = { ...defaultParams }

  for (const [key, value] of Object.entries(userParams)) {
    if (typeof value === 'number') {
      result[key] = value
    }
  }

  return result
}

function getParamDisplay(indicator: Indicator): string {
  const values = getParamValues(indicator.id)
  if (!indicator.params) return ''
  return indicator.params.map((p) => values[p.key] ?? '').join(',')
}

function onParamsConfirm(values: Record<string, number>) {
  if (currentIndicatorId.value) {
    emit('updateParams', currentIndicatorId.value, values)
  }
  paramsVisible.value = false
}

function onDragStart(event: DragEvent, indicatorId: string) {
  if (!isSubIndicatorId(indicatorId)) {
    event.preventDefault()
    return
  }
  draggingIndicatorId.value = indicatorId
  dragOverIndicatorId.value = null
  event.dataTransfer?.setData('text/plain', indicatorId)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(event: DragEvent, indicatorId: string) {
  if (
    !draggingIndicatorId.value ||
    !isSubIndicatorId(indicatorId) ||
    draggingIndicatorId.value === indicatorId
  )
    return
  dragOverIndicatorId.value = indicatorId
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onDrop(event: DragEvent, targetIndicatorId: string) {
  const sourceIndicatorId =
    draggingIndicatorId.value || event.dataTransfer?.getData('text/plain') || ''
  if (!sourceIndicatorId || sourceIndicatorId === targetIndicatorId) {
    onDragEnd()
    return
  }
  if (!isSubIndicatorId(sourceIndicatorId) || !isSubIndicatorId(targetIndicatorId)) {
    onDragEnd()
    return
  }

  const sourceIndex = activeIndicatorsList.value.findIndex((i) => i.id === sourceIndicatorId)
  const targetIndex = activeIndicatorsList.value.findIndex((i) => i.id === targetIndicatorId)
  if (sourceIndex < 0 || targetIndex < 0) {
    onDragEnd()
    return
  }

  const next = [...activeIndicatorsList.value.map((i) => i.id)]
  const [moved] = next.splice(sourceIndex, 1)
  if (!moved) {
    onDragEnd()
    return
  }
  next.splice(targetIndex, 0, moved)

  emit(
    'reorderSubIndicators',
    next.filter((id) => isSubIndicatorId(id)),
  )
  onDragEnd()
}

function onDragEnd() {
  dragOverIndicatorId.value = null
  draggingIndicatorId.value = null
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && controller.menuOpen.peek()) {
    controller.closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.indicator-selector {
  margin: 20px;
  width: 80%;
  position: relative;
}

.indicator-scroll-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  text-align: center;
}

.indicator-scroll-container::-webkit-scrollbar {
  display: none;
}

.indicator-list {
  display: inline-flex;
  gap: 8px;
  padding: 2px;
  margin: 0 auto;
}

.indicator-divider {
  width: 1px;
  height: 20px;
  align-self: center;
  background: var(--klc-color-axis-line);
}

.indicator-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.indicator-item.draggable,
.indicator-item.draggable .indicator-btn,
.indicator-item.draggable:hover,
.indicator-item.draggable:hover .indicator-btn {
  cursor: move;
}

.indicator-item.is-dragging {
  opacity: 0.6;
}

.indicator-item.drag-over .indicator-btn {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-foreground) 12%, transparent);
}

.indicator-btn-wrapper {
  position: relative;
}

.indicator-btn {
  position: relative;
  flex-shrink: 0;
  padding: 6px 16px;
  border: none;
  border-radius: 16px;
  background: var(--klc-color-tag-bg-white);
  color: var(--klc-color-axis-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  overflow: hidden;
}

.indicator-btn:hover:not(.hovering) {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
}

.indicator-btn.active {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
}

.indicator-btn.active:hover:not(.hovering) {
  background: var(--klc-color-tag-bg-hover);
}

.btn-content {
  position: relative;
  z-index: 1;
}

.param-hint {
  font-size: 11px;
  opacity: 0.85;
}

/* 悬浮操作层 */
.hover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: color-mix(in srgb, var(--klc-color-background) 85%, transparent);
  backdrop-filter: blur(4px);
  border-radius: 16px;
  z-index: 2;
}

.action-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--klc-color-axis-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
}

.settings-btn:hover {
  color: var(--klc-color-foreground);
}

.remove-btn:hover {
  color: #ff4d4f;
}

.divider {
  width: 1px;
  height: 14px;
  background: var(--klc-color-border-button);
}

/* 添加按钮 */
.add-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--klc-color-axis-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.add-btn:hover {
  color: var(--klc-color-foreground);
  background: var(--klc-color-tag-bg-hover);
}

/* ─────────────────────────────────────────────────────────────────
   弹窗样式 - 与其他弹窗保持一致
   ───────────────────────────────────────────────────────────────── */

/* 遮罩层 */
.selector-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* 弹窗容器 */
.selector-modal {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-axis-line);
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
  width: 90vw;
  max-width: 860px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 弹窗头部 */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--klc-color-background);
  border-bottom: 1px solid var(--klc-color-border-chart);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--klc-color-foreground);
  letter-spacing: 0.2px;
}

.title-sub {
  font-size: 11px;
  color: var(--klc-color-axis-text);
}

.modal-close {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--klc-color-axis-text);
  transition: all 0.15s;
  padding: 0;
}

.modal-close:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-line);
}

.modal-close svg {
  width: 14px;
  height: 14px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-toggle-btn {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--klc-color-axis-text);
  transition: all 0.15s;
  padding: 0;
}

.view-toggle-btn:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-line);
}

.view-toggle-btn.active {
  background: var(--klc-color-tag-bg-white);
  border-color: var(--klc-color-border-button);
  color: var(--klc-color-foreground);
}

/* 弹窗主体 */
.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.modal-body::-webkit-scrollbar {
  width: 8px;
}

.modal-body::-webkit-scrollbar-thumb {
  background: var(--klc-color-axis-line);
  border: 2px solid var(--klc-color-tag-bg-white);
  border-radius: 999px;
}

/* 搜索框 */
.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.search-box:focus-within {
  background: var(--klc-color-tag-bg-white);
  border-color: var(--klc-color-foreground);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-foreground) 8%, transparent);
}

.search-icon {
  flex-shrink: 0;
  color: var(--klc-color-axis-text);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--klc-color-foreground);
  outline: none;
}

.search-input::placeholder {
  color: var(--klc-color-axis-text);
}

/* 无结果提示 */
.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  color: var(--klc-color-axis-text);
  gap: 12px;
}

.no-results svg {
  opacity: 0.5;
}

.no-results p {
  margin: 0;
  font-size: 14px;
  color: var(--klc-color-axis-text);
  font-weight: 500;
}

.no-results-hint {
  font-size: 12px;
  color: var(--klc-color-axis-text);
}

/* 指标区域 */
.indicator-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--klc-color-foreground);
}

.section-count {
  font-size: 11px;
  color: var(--klc-color-axis-text);
  background: var(--klc-color-grid-minor);
  padding: 2px 8px;
  border-radius: 10px;
}

/* 自适应列数网格 */
.indicator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(195px, 1fr));
  gap: 10px;
}

/* 紧凑模式 - 标签形式 */
.indicator-grid.compact {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.indicator-grid.compact .indicator-card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 14px;
  border-radius: 16px;
  min-height: 32px;
  white-space: nowrap;
  position: relative;
}

.indicator-grid.compact .indicator-card .card-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--klc-color-foreground);
  color: var(--klc-color-background);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 10;
}

.indicator-grid.compact .indicator-card:hover .card-tooltip {
  opacity: 1;
}

.indicator-grid.compact .indicator-card .card-label {
  font-size: 12px;
  font-weight: 500;
}

/* 指标卡片 */
.indicator-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--klc-color-border-chart);
  border-radius: 8px;
  background: var(--klc-color-tag-bg-white);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.indicator-card:hover:not(.disabled) {
  border-color: var(--klc-color-foreground);
  background: var(--klc-color-background);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.indicator-card.active {
  border-color: var(--klc-color-foreground);
  background: var(--klc-color-tag-bg-hover);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--klc-color-foreground);
}

.card-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.card-settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--klc-color-axis-text);
  cursor: pointer;
  transition: all 0.15s;
}

.card-settings-btn:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
}

.card-name {
  font-size: 11px;
  color: var(--klc-color-axis-text);
  line-height: 1.4;
}

.card-params {
  font-size: 10px;
  color: var(--klc-color-axis-text);
  margin-top: 2px;
}

/* 区域分隔线 */
.section-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--klc-color-border-button), transparent);
  margin: 4px 0;
}

/* 弹窗底部 */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--klc-color-background);
  border-top: 1px solid var(--klc-color-border-chart);
  flex-shrink: 0;
}

.footer-info {
  font-size: 12px;
  color: var(--klc-color-axis-text);
}

.info-text {
  color: var(--klc-color-axis-text);
}

/* 按钮样式 */
.btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 16px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
  line-height: 1.4;
}

.btn-confirm {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  color: var(--klc-color-background);
}

.btn-confirm:hover {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 遮罩层动画 */
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

/* 弹窗动画 */
.modal-enter-active {
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active {
  transition: all 0.16s ease-in;
}

.modal-enter-from {
  opacity: 0;
  transform: scale(0.88) translateY(-16px);
}

.modal-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(8px);
}

/* 响应式适配 */
@media (max-width: 640px) {
  .selector-modal {
    width: 95vw;
    max-height: 90vh;
  }

  .indicator-grid {
    grid-template-columns: 1fr;
  }

  .modal-body {
    padding: 16px;
  }
}
</style>
