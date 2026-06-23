<template>
  <div class="indicator-selector">
    <BaseModal
      :show="menuOpen"
      title="添加指标"
      subtitle=""
      width="90vw"
      max-width="860px"
      max-height="85vh"
      transition-variant="compact"
      footer-align="space-between"
      @close="controller.closeMenu()"
    >
      <template #header>
        <div class="header-title">
          <span class="title-text">添加指标</span>
          <span class="title-sub">{{ catalogLen }} 个可用指标</span>
        </div>
      </template>

      <template #header-extra>
        <button
          class="view-toggle-btn"
          :class="{ active: isCompactView }"
          @click="isCompactView = !isCompactView"
          title="简洁模式"
        >
          <svg v-if="!isCompactView" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path
              d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h4v4H7V7zm0 6h4v4H7v-4zm6-6h4v4h-4V7zm0 6h4v4h-4v-4z"
            />
          </svg>
        </button>
      </template>

      <template #subheader>
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
          <input
            :value="searchQuery"
            @input="controller.setSearchQuery(($event.target as HTMLInputElement).value)"
            type="text"
            class="search-input"
            placeholder="搜索指标名称..."
          />
        </div>
      </template>

      <!-- 主图指标 -->
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
              isActive(indicator.id) ? removeIndicator(indicator.id) : addIndicator(indicator.id)
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

      <!-- 无匹配 -->
      <div v-if="!hasSearchResults && searchQuery.trim()" class="no-results">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <p>未找到匹配的指标</p>
        <span class="no-results-hint">请尝试其他关键词</span>
      </div>

      <!-- 副图指标 -->
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
              isActive(indicator.id) ? removeIndicator(indicator.id) : addIndicator(indicator.id)
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

      <template #footer>
        <div class="footer-info">
          <span class="info-text">已激活 {{ activeCount }} 个指标</span>
        </div>
        <button class="btn btn-confirm" @click="controller.closeMenu()">确认</button>
      </template>
    </BaseModal>

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
import BaseModal from './BaseModal.vue'
import IndicatorParams from './IndicatorParams.vue'
import { coreSignalToVueRef } from '../utils/signalBridge'
import {
  createIndicatorSelectorController,
  type IndicatorDefinition,
  allIndicators,
  findIndicator,
  type Indicator,
  loadBuiltinIndicators,
  isBuiltinIndicatorsLoaded,
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

function toIndicatorDefinitions(source: Indicator[]): IndicatorDefinition[] {
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

const controller = createIndicatorSelectorController()

const menuOpen = coreSignalToVueRef(controller.menuOpen)
const searchQuery = coreSignalToVueRef(controller.searchQuery)
const filteredMain = coreSignalToVueRef(controller.filteredMain)
const filteredSub = coreSignalToVueRef(controller.filteredSub)

const hasSearchResults = computed(
  () => filteredMain.value.length > 0 || filteredSub.value.length > 0,
)

const catalog = coreSignalToVueRef(controller.catalog)
const catalogLen = computed(() => catalog.value.length)

onMounted(async () => {
  if (!isBuiltinIndicatorsLoaded()) {
    await loadBuiltinIndicators()
  }
  controller.catalog.set(toIndicatorDefinitions(allIndicators()))
})

const paramsVisible = ref(false)
const currentIndicatorId = ref<string | null>(null)
const isCompactView = ref(false)

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

function onParamsConfirm(values: Record<string, number>) {
  if (currentIndicatorId.value) {
    emit('updateParams', currentIndicatorId.value, values)
  }
  paramsVisible.value = false
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

defineExpose({
  openMenu: () => controller.openMenu(),
  closeMenu: () => controller.closeMenu(),
  toggleMenu: () => controller.toggleMenu(),
})
</script>

<style scoped>
.indicator-selector {
  display: none;
}

/* ── 头部 ── */
.header-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--klc-color-foreground);
  line-height: 1.3;
}

.title-sub {
  font-size: 12px;
  color: var(--klc-color-axis-text);
  font-weight: 400;
  line-height: 1.3;
}

.view-toggle-btn {
  background: var(--klc-color-background);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 6px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--klc-color-axis-text);
  transition: all 0.15s ease;
  padding: 0;
}

.view-toggle-btn:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-line);
}

/* ── 搜索 ── */
.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 6px;
  background: var(--klc-color-background);
  transition: all 0.2s ease;
}

.search-box:focus-within {
  background: var(--klc-color-background);
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

/* ── 无匹配 ── */
.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  color: var(--klc-color-axis-text);
  gap: 10px;
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

/* ── 指标区域 ── */
.indicator-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.indicator-section + .indicator-section {
  margin-top: 18px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.section-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--klc-color-foreground);
  letter-spacing: 0.3px;
  line-height: 1;
}

.section-count {
  font-size: 11px;
  color: var(--klc-color-axis-text);
  background: var(--klc-color-grid-minor);
  padding: 2px 8px;
  border-radius: 10px;
}

.indicator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px;
}

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

.indicator-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--klc-color-border-chart);
  border-radius: 6px;
  background: var(--klc-color-background);
  cursor: pointer;
  transition: all 0.15s ease;
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

/* ── 底部 ── */
.footer-info {
  font-size: 12px;
  color: var(--klc-color-axis-text);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 68px;
  height: 34px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
  line-height: 1;
  white-space: nowrap;
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

/* ── 响应式 ── */
@media (max-width: 640px) {
  .indicator-grid {
    grid-template-columns: 1fr;
  }
}
</style>
