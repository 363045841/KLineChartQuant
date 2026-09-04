<template>
  <div class="indicator-selector">
    <BaseModal
      :show="menuOpen"
      :title="modalTitle"
      subtitle=""
      width="90vw"
      max-width="860px"
      max-height="85vh"
      transition-variant="compact"
      footer-align="space-between"
      @close="closeMenu"
    >
      <template #header>
        <div class="header-title">
          <span class="title-text">{{ modalTitle }}</span>
          <span class="title-sub">{{ catalogLen }} 个可用指标</span>
        </div>
      </template>

      <template #subheader>
        <div class="selector-toolbar">
          <div class="search-box">
            <IconTablerSearch class="search-icon" aria-hidden="true" />
            <input
              :value="searchQuery"
              type="text"
              class="search-input"
              placeholder="搜索指标名称..."
              @input="controller.setSearchQuery(($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="view-tabs" role="tablist" aria-label="指标视图">
            <button
              v-for="option in viewOptions"
              :key="option.value"
              class="view-tab"
              :class="{ active: indicatorView === option.value }"
              role="tab"
              :aria-selected="indicatorView === option.value"
              @click="indicatorView = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </template>

      <div v-for="group in indicatorGroups" :key="group.key" class="indicator-section">
        <div class="section-header">
          <span class="section-title">{{ group.label }}</span>
          <span class="section-count">{{ group.items.length }}</span>
        </div>
        <div class="indicator-grid" :class="{ compact: indicatorView === 'compact' }">
          <div
            v-for="indicator in group.items"
            :key="indicator.id"
            class="indicator-card"
            :class="{ active: isActive(indicator.id) }"
          >
            <button class="card-select" @click="toggleIndicator(indicator.id)">
              <div class="card-header">
                <span class="card-label">{{ indicator.label }}</span>
                <span v-if="indicatorView === 'type'" class="pane-badge">
                  {{ indicator.role === 'main' ? '主' : '副' }}
                </span>
              </div>
              <div v-if="indicatorView !== 'compact'" class="card-name">{{ indicator.name }}</div>
              <span v-else class="card-tooltip">{{ indicator.name }}</span>
            </button>
            <button
              v-if="indicator.params?.length"
              class="card-action-btn"
              title="编辑参数"
              aria-label="编辑参数"
              @click="showParams(indicator.id)"
            >
              <IconTablerSettings aria-hidden="true" />
            </button>
            <button
              v-else-if="indicator.description"
              class="card-action-btn"
              title="查看指标说明"
              aria-label="查看指标说明"
              @click="showDescription(indicator.id)"
            >
              <IconTablerInfoCircle aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <!-- 无匹配 -->
      <div v-if="!hasSearchResults && searchQuery.trim()" class="no-results">
        <IconTablerSearch class="no-results-icon" aria-hidden="true" />
        <p>未找到匹配的指标</p>
        <span class="no-results-hint">请尝试其他关键词</span>
      </div>

      <template #footer>
        <div class="footer-info">
          <span class="info-text">已激活 {{ activeCount }} 个指标</span>
        </div>
        <button class="btn btn-confirm" @click="closeMenu">确认</button>
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

    <!-- z-index 高于指标选择弹窗(1000)，避免被其 Teleport 重排后遮挡 -->
    <BaseModal
      v-if="descriptionIndicator"
      :show="descriptionVisible"
      :title="descriptionIndicator.name"
      subtitle="指标说明"
      width="90vw"
      max-width="420px"
      transition-variant="compact"
      :z-index="1100"
      @close="descriptionVisible = false"
    >
      <p class="indicator-description">{{ descriptionIndicator.description }}</p>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import {
    createIndicatorSelectorController,
    type IndicatorDefinition,
    allIndicators,
    findIndicator,
    type Indicator,
    loadBuiltinIndicators,
    isBuiltinIndicatorsLoaded,
  } from '@363045841yyt/klinechart-core/controllers'
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import IconTablerInfoCircle from '~icons/tabler/info-circle'
  import IconTablerSearch from '~icons/tabler/search'
  import IconTablerSettings from '~icons/tabler/settings'

  import { coreSignalToVueRef } from '../utils/signalBridge'

  import BaseModal from './BaseModal.vue'
  import IndicatorParams from './IndicatorParams.vue'

  const props = defineProps<{
    activeIndicators?: string[]
    indicatorParams?: Record<string, Record<string, unknown>>
    replacePaneId?: string | null
  }>()

  const emit = defineEmits<{
    toggle: [indicatorId: string, active: boolean]
    updateParams: [indicatorId: string, params: Record<string, number>]
    reorderSubIndicators: [orderedIndicatorIds: string[]]
    replace: [paneId: string, indicatorId: string]
    close: []
  }>()

  function toIndicatorDefinitions(source: Indicator[]): IndicatorDefinition[] {
    return source.map((i) => ({
      id: i.id,
      label: i.label,
      name: i.name,
      description: i.description,
      role: i.pane,
      indicatorType: i.indicatorType,
      indicatorTypeLabel: i.indicatorTypeLabel,
      indicatorTypeOrder: i.indicatorTypeOrder,
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
  const descriptionVisible = ref(false)
  const descriptionIndicatorId = ref<string | null>(null)
  type IndicatorView = 'position' | 'compact' | 'type'

  interface IndicatorGroup {
    key: string
    label: string
    items: ReadonlyArray<IndicatorDefinition>
  }

  const indicatorView = ref<IndicatorView>('position')
  const viewOptions: ReadonlyArray<{ value: IndicatorView; label: string }> = [
    { value: 'position', label: '按位置' },
    { value: 'compact', label: '简洁' },
    { value: 'type', label: '按类型' },
  ]

  /** 按当前视图组织搜索后的指标，所有分组始终保持展开。 */
  const indicatorGroups = computed<IndicatorGroup[]>(() => {
    if (props.replacePaneId) {
      return filteredSub.value.length > 0
        ? [{ key: 'sub', label: '副图指标', items: filteredSub.value }]
        : []
    }

    if (indicatorView.value === 'position') {
      return [
        { key: 'main', label: '主图指标', items: filteredMain.value },
        { key: 'sub', label: '副图指标', items: filteredSub.value },
      ].filter((group) => group.items.length > 0)
    }

    const indicators = [...filteredMain.value, ...filteredSub.value]
    if (indicatorView.value === 'compact') {
      return indicators.length > 0 ? [{ key: 'all', label: '全部指标', items: indicators }] : []
    }

    const groups = new Map<string, IndicatorGroup & { order: number }>()
    for (const indicator of indicators) {
      const existing = groups.get(indicator.indicatorType)
      if (existing) {
        existing.items = [...existing.items, indicator]
      } else {
        groups.set(indicator.indicatorType, {
          key: indicator.indicatorType,
          label: indicator.indicatorTypeLabel ?? indicator.indicatorType,
          order: indicator.indicatorTypeOrder ?? 900,
          items: [indicator],
        })
      }
    }
    return [...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  })

  const currentIndicator = computed(() => {
    if (!currentIndicatorId.value) return null
    return findIndicator(currentIndicatorId.value)
  })

  const descriptionIndicator = computed(() => {
    if (!descriptionIndicatorId.value) return null
    return findIndicator(descriptionIndicatorId.value)
  })

  const activeCount = computed(() => props.activeIndicators?.length ?? 0)
  const modalTitle = computed(() => (props.replacePaneId ? '更换指标' : '添加指标'))

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

  /** 切换指标启用状态。 */
  function toggleIndicator(indicatorId: string) {
    if (props.replacePaneId) {
      const indicator = findIndicator(indicatorId)
      if (!indicator || indicator.pane !== 'sub') return
      emit('replace', props.replacePaneId, indicatorId)
      closeMenu()
      return
    }
    if (isActive(indicatorId)) {
      removeIndicator(indicatorId)
    } else {
      addIndicator(indicatorId)
    }
  }

  function showParams(indicatorId: string) {
    currentIndicatorId.value = indicatorId
    paramsVisible.value = true
  }

  /** 显示无参数指标的用途说明。 */
  function showDescription(indicatorId: string) {
    descriptionIndicatorId.value = indicatorId
    descriptionVisible.value = true
  }

  /** 关闭选择器，并通知父组件清除一次性的 Pane 替换目标。 */
  function closeMenu() {
    controller.closeMenu()
    emit('close')
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
      closeMenu()
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
    closeMenu,
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

  .selector-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .view-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(64px, 1fr));
    flex: 0 0 auto;
    padding: 2px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 6px;
    background: var(--klc-color-grid-minor);
  }

  .view-tab {
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-axis-text);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .view-tab:hover {
    color: var(--klc-color-foreground);
  }

  .view-tab.active {
    background: var(--klc-color-background);
    color: var(--klc-color-foreground);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  /* ── 搜索 ── */
  .search-box {
    display: flex;
    flex: 1;
    min-width: 0;
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
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(116px, 1fr));
    gap: 8px;
  }

  .indicator-grid.compact .indicator-card {
    min-height: 32px;
  }

  .indicator-grid.compact .card-select {
    justify-content: center;
    padding: 6px 32px 6px 10px;
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

  .indicator-grid.compact .indicator-card:hover .card-tooltip,
  .indicator-grid.compact .indicator-card:focus-within .card-tooltip {
    opacity: 1;
  }

  .indicator-grid.compact .indicator-card .card-label {
    font-size: 12px;
    font-weight: 500;
  }

  .indicator-card {
    display: flex;
    position: relative;
    min-width: 0;
    min-height: 58px;
    padding: 0;
    border: 1px solid var(--klc-color-border-chart);
    border-radius: 6px;
    background: var(--klc-color-background);
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .card-select {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 10px 38px 10px 12px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .card-select:focus-visible,
  .card-action-btn:focus-visible,
  .view-tab:focus-visible {
    outline: 2px solid var(--klc-color-foreground);
    outline-offset: -2px;
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
    justify-content: flex-start;
    gap: 8px;
  }

  .card-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--klc-color-foreground);
  }

  .pane-badge {
    flex: 0 0 auto;
    padding: 1px 4px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 3px;
    color: var(--klc-color-axis-text);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
  }

  .card-action-btn {
    display: flex;
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-axis-text);
    cursor: pointer;
    transition: all 0.15s;
  }

  .card-action-btn:hover {
    background: var(--klc-color-tag-bg-hover);
    color: var(--klc-color-foreground);
  }

  .card-name {
    overflow: hidden;
    font-size: 11px;
    color: var(--klc-color-axis-text);
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .indicator-description {
    margin: 0;
    font-size: 13px;
    line-height: 1.65;
    color: var(--klc-color-axis-text);
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
    border: 0;
    transition: all 0.15s;
    line-height: 1;
    white-space: nowrap;
  }

  .btn-confirm {
    background: color-mix(
      in srgb,
      var(--klc-color-foreground) 80%,
      var(--klc-color-chart-background)
    );
    color: var(--klc-color-background);
  }

  .btn-confirm:hover {
    background: var(--klc-color-foreground);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  /* ── 响应式 ── */
  @media (max-width: 640px) {
    .selector-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
    }

    .view-tabs {
      width: 100%;
    }

    .indicator-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .indicator-grid.compact {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
