<!-- 指标选择弹窗：贴边搜索与 Compact 条目列表，类型通过胶囊标注。 -->
<template>
  <div class="indicator-selector">
    <BaseModal
      :open="menuOpen"
      :title="modalTitle"
      width="min(640px, calc(100vw - 32px))"
      max-height="min(560px, 75dvh)"
      overlay-padding="var(--klc-space-16, 16px)"
      body-padding="0"
      :body-scrollable="false"
      @update:open="!$event && closeMenu()"
    >
      <template #tabs>
        <div class="selector-toolbar">
          <SearchField
            class="selector-search"
            :model-value="searchQuery"
            placeholder="搜索指标名称..."
            aria-label="搜索指标"
            autofocus
            variant="flush"
            @update:model-value="controller.setSearchQuery"
          />
        </div>
      </template>

      <div class="selector-content">
        <nav class="selector-nav" aria-label="指标分类">
          <button
            type="button"
            class="selector-nav-item"
            :class="{ selected: section === INDICATOR_SELECTOR_SECTIONS.favorites }"
            :aria-current="section === INDICATOR_SELECTOR_SECTIONS.favorites ? 'page' : undefined"
            @click="section = INDICATOR_SELECTOR_SECTIONS.favorites"
          >
            <IconTablerStar aria-hidden="true" />收藏
          </button>
          <button
            type="button"
            class="selector-nav-item"
            :class="{ selected: section === INDICATOR_SELECTOR_SECTIONS.indicators }"
            :aria-current="section === INDICATOR_SELECTOR_SECTIONS.indicators ? 'page' : undefined"
            @click="section = INDICATOR_SELECTOR_SECTIONS.indicators"
          >
            <IconTablerMathFunction aria-hidden="true" />指标
          </button>
        </nav>
        <OverlayScrollArea class="selector-results">
          <div class="indicator-list" role="list" aria-label="指标列表">
            <div
              v-for="indicator in filteredIndicators"
              :key="indicator.id"
              class="indicator-item"
              role="listitem"
            >
              <button
                type="button"
                class="item-select"
                :aria-pressed="isActive(indicator.id)"
                @click="toggleIndicator(indicator.id)"
              >
                <div class="item-header">
                  <span class="item-label">
                    {{ indicator.label }}
                    <span v-if="indicator.name && indicator.name !== indicator.label" class="item-name">
                      {{ indicator.name }}
                    </span>
                  </span>
                  <span class="item-tags">
                    <span class="type-badge">
                      {{ indicator.indicatorTypeLabel ?? indicator.indicatorType }}
                    </span>
                    <span class="type-badge">{{ indicator.role === 'main' ? '主图' : '副图' }}</span>
                  </span>
                </div>
              </button>
              <BaseTooltip v-if="indicator.params?.length" content="编辑参数" placement="top">
                <button
                  type="button"
                  class="item-action-btn"
                  :aria-label="`编辑参数：${indicator.name}`"
                  @click="showParams(indicator.id)"
                >
                  <IconTablerSettings aria-hidden="true" />
                </button>
              </BaseTooltip>
              <!-- 说明用锚定气泡，避免在选择器上叠加第二个弹窗。 -->
              <BasePopover
                v-else-if="indicator.description"
                :label="`${indicator.name} 指标说明`"
                role="note"
                placement="auto"
              >
                <template #trigger="{ props: triggerProps }">
                  <button
                    type="button"
                    class="item-action-btn"
                    :aria-label="`查看指标说明：${indicator.name}`"
                    v-bind="triggerProps"
                  >
                    <IconTablerInfoCircle aria-hidden="true" />
                  </button>
                </template>
                <p class="indicator-description__title">{{ indicator.name }}</p>
                <p class="indicator-description">{{ indicator.description }}</p>
              </BasePopover>
              <button
                type="button"
                class="item-favorite-btn"
                :aria-label="`${favoriteSet.has(indicator.id) ? '取消收藏' : '收藏'}：${indicator.label}`"
                :aria-pressed="favoriteSet.has(indicator.id)"
                :disabled="!chartController"
                @click="toggleFavorite(indicator.id)"
              >
                <IconTablerStarFilled v-if="favoriteSet.has(indicator.id)" aria-hidden="true" />
                <IconTablerStar v-else aria-hidden="true" />
              </button>
              <span v-if="isActive(indicator.id)" class="item-check" aria-hidden="true">
                <IconTablerCheck />
              </span>
            </div>
          </div>

          <div v-if="filteredIndicators.length === 0" class="no-results">
            <template v-if="section === INDICATOR_SELECTOR_SECTIONS.favorites && !searchQuery.trim()">
              <p>暂无收藏指标</p>
            </template>
            <template v-else>
              <IconTablerSearch class="no-results-icon" aria-hidden="true" />
              <p>未找到匹配的指标</p>
              <span class="no-results-hint">请尝试其他关键词</span>
            </template>
          </div>
        </OverlayScrollArea>
      </div>
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
  import {
    allIndicatorDefinitions,
    type ChartController,
    createIndicatorSelectorController,
    findIndicator,
  } from '@363045841yyt/klinechart-core/controllers'
  import { computed, ref } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerInfoCircle from '~icons/tabler/info-circle'
  import IconTablerMathFunction from '~icons/tabler/math-function'
  import IconTablerSearch from '~icons/tabler/search'
  import IconTablerSettings from '~icons/tabler/settings'
  import IconTablerStar from '~icons/tabler/star'
  import IconTablerStarFilled from '~icons/tabler/star-filled'
  import {
    INDICATOR_SELECTOR_SECTIONS,
    useIndicatorFavorites,
  } from '../composables/useIndicatorFavorites.js'
  import { coreSignalToVueRef } from '../utils/signalBridge.js'

  import BaseModal from './BaseModal.vue'
  import BasePopover from './common/BasePopover.vue'
  import BaseTooltip from './common/BaseTooltip.vue'
  import OverlayScrollArea from './common/OverlayScrollArea.vue'
  import SearchField from './common/SearchField.vue'
  import IndicatorParams from './IndicatorParams.vue'

  const props = defineProps<{
    chartController?: ChartController | null
    activeIndicators?: string[]
    indicatorParams?: Record<string, Record<string, unknown>>
    replacePaneId?: string | null
    /** 替换目标所在位置；与 replacePaneId 同时提供。 */
    replaceRole: 'main' | 'sub'
  }>()

  const emit = defineEmits<{
    toggle: [indicatorId: string, active: boolean]
    updateParams: [indicatorId: string, params: Record<string, number | string>]
    replace: [paneId: string, indicatorId: string]
    close: []
  }>()

  // 目录来自编译期静态元数据，打开选择器不加载任何指标实现。
  const controller = createIndicatorSelectorController({ catalog: allIndicatorDefinitions() })

  const menuOpen = coreSignalToVueRef(controller.menuOpen)
  const searchQuery = coreSignalToVueRef(controller.searchQuery)
  const filteredMain = coreSignalToVueRef(controller.filteredMain)
  const filteredSub = coreSignalToVueRef(controller.filteredSub)

  const paramsVisible = ref(false)
  const currentIndicatorId = ref<string | null>(null)
  /** 更换指标时只展示目标位置，其余情况合并为 Compact 列表。 */
  const availableIndicators = computed(() => {
    if (props.replacePaneId) {
      return props.replaceRole === 'main' ? filteredMain.value : filteredSub.value
    }
    return [...filteredMain.value, ...filteredSub.value]
  })
  const { section, favoriteSet, filteredIndicators, toggleFavorite } = useIndicatorFavorites(
    computed(() => props.chartController ?? null),
    availableIndicators,
  )

  const currentIndicator = computed(() => {
    if (!currentIndicatorId.value) return null
    return findIndicator(currentIndicatorId.value)
  })

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
      if (!indicator || indicator.pane !== props.replaceRole) return
      // 替换源本身不允许再次选中；主图和副图同一规则，避免出现重复指标。
      if (isActive(indicatorId)) return
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

  /** 关闭选择器，并通知父组件清除一次性的 Pane 替换目标。 */
  function closeMenu() {
    controller.closeMenu()
    emit('close')
  }

  function getParamValues(indicatorId: string): Record<string, number | string> {
    const indicator = findIndicator(indicatorId)
    if (!indicator?.params) return {}

    const defaultParams: Record<string, number | string> = {}
    for (const p of indicator.params) {
      // 选项参数缺少默认值时回退到首个选项，避免非数值默认写入枚举参数。
      defaultParams[p.key] = p.default ?? p.options?.[0]?.value ?? p.min ?? 1
    }

    const userParams = props.indicatorParams?.[indicatorId] || {}
    const result: Record<string, number | string> = { ...defaultParams }

    // 数字与选项参数都可回填；其他类型暂由定义默认值表达。
    for (const [key, value] of Object.entries(userParams)) {
      if (typeof value === 'number' || typeof value === 'string') {
        result[key] = value
      }
    }

    return result
  }

  function onParamsConfirm(values: Record<string, number | string>) {
    if (currentIndicatorId.value) {
      emit('updateParams', currentIndicatorId.value, values)
    }
    paramsVisible.value = false
  }

  defineExpose({
    openMenu: () => controller.openMenu(),
    closeMenu,
    toggleMenu: () => controller.toggleMenu(),
    /** 直接打开指定指标的参数设置，供 Legend 悬浮工具条复用。 */
    openParams: showParams,
  })
</script>

<style scoped>
  .indicator-selector {
    display: none;
  }

  .selector-content {
    display: flex;
    height: min(420px, calc(75dvh - 82px));
    min-height: 0;
  }

  .selector-nav {
    display: flex;
    flex: 0 0 92px;
    flex-direction: column;
    border-right: 1px solid var(--klc-color-ui-border);
  }

  .selector-nav-item {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    min-height: 36px;
    padding: 0 var(--klc-space-12, 12px);
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-muted);
    font: inherit;
    font-size: var(--klc-text-label-13-font-size, 13px);
    text-align: left;
    cursor: pointer;
  }

  .selector-nav-item:hover,
  .selector-nav-item.selected {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .selector-nav-item svg {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }

  .selector-results {
    flex: 1;
    min-width: 0;
  }

  .selector-toolbar {
    display: flex;
    align-items: center;
    min-height: 42px;
    border-top: 1px solid var(--klc-color-ui-border);
    border-bottom: 1px solid var(--klc-color-ui-border);
    background: var(--klc-color-ui-surface);
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

  /* 紧凑条目铺满内容区，类型标注与操作按钮共用一行。 */
  .indicator-list {
    display: flex;
    flex-direction: column;
  }

  .indicator-item {
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    min-width: 0;
    min-height: 36px;
    padding-right: var(--klc-space-8, 8px);
    background: transparent;
    transition: background-color var(--klc-motion-dur-fast, 160ms) ease;
    text-align: left;
  }

  .item-select {
    display: flex;
    flex: 1;
    min-width: 0;
    justify-content: center;
    min-height: 36px;
    padding: 6px var(--klc-space-4, 4px) 6px var(--klc-space-12, 12px);
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .item-select:focus-visible,
  .item-action-btn:focus-visible,
  .item-favorite-btn:focus-visible,
  .selector-nav-item:focus-visible {
    outline: 2px solid var(--klc-color-ui-text);
    outline-offset: -2px;
  }

  .indicator-item:hover {
    background: var(--klc-color-ui-hover);
  }

  .item-header {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .item-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    color: var(--klc-color-foreground);
  }

  .item-name {
    margin-left: var(--klc-space-8, 8px);
    color: var(--klc-color-ui-muted);
    font-weight: 400;
  }

  .item-tags {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--klc-space-4, 4px);
  }

  /* 勾号仅开启时参与布局，保持在所有操作按钮的最右侧。 */
  .item-check {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: var(--klc-color-ui-text);
    pointer-events: none;
  }

  .type-badge {
    flex: 0 0 auto;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-muted);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
  }

  .item-action-btn,
  .item-favorite-btn {
    display: flex;
    flex: 0 0 auto;
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
    transition:
      color var(--klc-motion-dur-fast, 160ms) ease,
      background-color var(--klc-motion-dur-fast, 160ms) ease;
  }

  .item-action-btn:hover,
  .item-favorite-btn:hover:not(:disabled) {
    background: var(--klc-color-tag-bg-hover);
    color: var(--klc-color-foreground);
  }

  .item-favorite-btn[aria-pressed='true'] {
    color: var(--klc-color-ui-text);
  }

  .item-favorite-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .item-favorite-btn svg {
    width: 15px;
    height: 15px;
  }

  @media (max-width: 480px) {
    .selector-nav {
      flex-basis: 76px;
    }

    .selector-nav-item {
      gap: var(--klc-space-4, 4px);
      padding: 0 var(--klc-space-8, 8px);
    }

    .item-header {
      flex-wrap: wrap;
      gap: var(--klc-space-4, 4px);
    }
  }

  .indicator-description__title {
    margin: 0 0 var(--klc-space-4, 4px);
    font-size: var(--klc-text-label-13-font-size, 13px);
    font-weight: 600;
    color: var(--klc-color-ui-text);
  }

  .indicator-description {
    margin: 0;
    font-size: var(--klc-text-copy-13-font-size, 13px);
    line-height: 1.65;
    color: var(--klc-color-axis-text);
  }

</style>
