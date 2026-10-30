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
        <ModalSearchBar
          :model-value="searchQuery"
          placeholder="搜索指标名称..."
          aria-label="搜索指标"
          autofocus
          @update:model-value="controller.setSearchQuery"
        >
          <BaseButton v-if="scriptsEnabled !== false && section === INDICATOR_SELECTOR_SECTIONS.scripts" @click="createScript">
            新建脚本
          </BaseButton>
        </ModalSearchBar>
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
          <button
            type="button"
            class="selector-nav-item"
            :class="{ selected: section === INDICATOR_SELECTOR_SECTIONS.scripts }"
            v-if="scriptsEnabled !== false"
            :aria-current="section === INDICATOR_SELECTOR_SECTIONS.scripts ? 'page' : undefined"
            @click="section = INDICATOR_SELECTOR_SECTIONS.scripts"
          >
            <IconTablerMathFunction aria-hidden="true" />用户自定义脚本
          </button>
        </nav>
        <p v-if="removalError" role="alert">{{ removalError }}</p>
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
                    <BasePopover
                      v-if="indicator.description"
                      :label="`${indicator.name} 指标说明`"
                      role="note"
                      placement="auto"
                      trigger="hover"
                    >
                      <template #trigger="{ props: triggerProps }">
                        <button
                          type="button"
                          class="item-info-btn"
                          :aria-label="`查看指标说明：${indicator.name}`"
                          v-bind="triggerProps"
                        >
                          <IconTablerInfoCircle aria-hidden="true" />
                        </button>
                      </template>
                      <p class="indicator-description__title">{{ indicator.name }}</p>
                      <p class="indicator-description">{{ indicator.description }}</p>
                    </BasePopover>
                  </span>
                  <span class="item-tags">
                    <span class="type-badge">{{ indicator.role === 'main' ? '主图' : '副图' }}</span>
                  </span>
                </div>
              </button>
              <!-- 自定义脚本与图例的编辑脚本共用同一入口，打开代码编辑器。 -->
              <BaseTooltip v-if="scriptsEnabled !== false" content="编辑脚本" placement="top">
                <button
                  type="button"
                  class="item-action-btn"
                  :disabled="indicator.source !== 'script'"
                  :aria-label="`编辑脚本：${indicator.name}`"
                  @click="editScript(indicator.id)"
                >
                  <IconTablerCode aria-hidden="true" />
                </button>
              </BaseTooltip>
              <BaseTooltip v-if="indicator.source === 'script' && canRemove(indicator.id)" content="删除脚本" placement="top">
                <button
                  type="button"
                  class="item-action-btn"
                  :aria-label="`删除脚本：${indicator.name}`"
                  :disabled="removing !== null"
                  @click="removeScript(indicator.id)"
                >
                  <IconTablerTrash aria-hidden="true" />
                </button>
              </BaseTooltip>
              <BaseTooltip content="编辑参数" placement="top">
                <button
                  type="button"
                  class="item-action-btn"
                  :disabled="!indicator.params?.length"
                  :aria-label="`编辑参数：${indicator.name}`"
                  @click="showParams(indicator.id)"
                >
                  <IconTablerSettings aria-hidden="true" />
                </button>
              </BaseTooltip>
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
            <template v-else-if="section === INDICATOR_SELECTOR_SECTIONS.scripts && !searchQuery.trim()">
              <p>暂无用户自定义脚本</p>
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
    type ChartController,
    createIndicatorSelectorController,
    findIndicator,
  } from '@363045841yyt/klinechart-core/controllers'
  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import BasePopover from '@vue-src/components/common/BasePopover.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import ModalSearchBar from '@vue-src/components/common/ModalSearchBar.vue'
  import OverlayScrollArea from '@vue-src/components/common/OverlayScrollArea.vue'
  import IndicatorParams from '@vue-src/components/indicator/params/impl/IndicatorParams.vue'
  import { SCRIPT_SOURCE_STORE_KEY } from '@vue-src/composables/chart/scriptEditor/types.js'
  import { useIndicatorCatalog } from '@vue-src/composables/indicator/useIndicatorCatalog.js'
  import {
    INDICATOR_SELECTOR_SECTIONS,
    useIndicatorFavorites,
  } from '@vue-src/composables/indicator/useIndicatorFavorites.js'
  import { useScriptRemoval } from '@vue-src/composables/indicator/useScriptRemoval.js'
  import { coreSignalToVueRef } from '@vue-src/utils/signalBridge.js'
  import { computed, inject, ref } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerCode from '~icons/tabler/code'
  import IconTablerInfoCircle from '~icons/tabler/info-circle'
  import IconTablerMathFunction from '~icons/tabler/math-function'
  import IconTablerSearch from '~icons/tabler/search'
  import IconTablerSettings from '~icons/tabler/settings'
  import IconTablerStar from '~icons/tabler/star'
  import IconTablerStarFilled from '~icons/tabler/star-filled'
  import IconTablerTrash from '~icons/tabler/trash'

  const props = defineProps<{
    chartController?: ChartController | null
    scriptsEnabled?: boolean
    activeIndicators?: string[]
    indicatorParams?: Record<string, Record<string, unknown>>
    replacePaneId?: string | null
    /** 替换目标所在位置；与 replacePaneId 同时提供。 */
    replaceRole: 'main' | 'sub'
  }>()

  const emit = defineEmits<{
    toggle: [indicatorId: string, active: boolean]
    updateParams: [indicatorId: string, params: Record<string, number | string | boolean>]
    replace: [paneId: string, indicatorId: string]
    /** 请求打开该脚本指标的代码编辑器，由宿主图表组件负责弹窗。 */
    editCode: [indicatorId: string]
    createScript: []
    close: []
  }>()

  // 目录来自编译期静态元数据，打开选择器不加载任何指标实现。
  const controller = createIndicatorSelectorController()
  useIndicatorCatalog(controller)
  const { removing, removalError, canRemove, removeScript } = useScriptRemoval(
    inject(SCRIPT_SOURCE_STORE_KEY, undefined),
  )

  const menuOpen = coreSignalToVueRef(controller.menuOpen)
  const searchQuery = coreSignalToVueRef(controller.searchQuery)
  const filteredMain = coreSignalToVueRef(controller.filteredMain)
  const filteredSub = coreSignalToVueRef(controller.filteredSub)

  const paramsVisible = ref(false)
  const currentIndicatorId = ref<string | null>(null)
  /** 打开设置时快照定义，保证编辑脚本后重新打开能读到最新参数。 */
  const currentIndicator = ref<ReturnType<typeof findIndicator>>()
  /** 更换指标时只展示目标位置，其余情况合并为 Compact 列表。 */
  const availableIndicators = computed(() => {
    const indicators = props.replacePaneId
      ? props.replaceRole === 'main' ? filteredMain.value : filteredSub.value
      : [...filteredMain.value, ...filteredSub.value]
    return props.scriptsEnabled === false ? indicators.filter((item) => item.source !== 'script') : indicators
  })
  const { section, favoriteSet, filteredIndicators, toggleFavorite } = useIndicatorFavorites(
    computed(() => props.chartController ?? null),
    availableIndicators,
  )

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
    const indicator = findIndicator(indicatorId)
    // 没有可设置项时不打开空弹窗；入口按钮保持可见并置灰。
    if (!indicator?.params?.length) return
    currentIndicatorId.value = indicatorId
    currentIndicator.value = indicator
    paramsVisible.value = true
  }

  /** 请求宿主打开脚本代码编辑器；打开动作与图例的编辑脚本共用同一会话。 */
  function createScript() {
    closeMenu()
    emit('createScript')
  }

  /** 打开当前脚本文档，官方身份由编辑器提供只读展示。 */
  function editScript(indicatorId: string) {
    const indicator = findIndicator(indicatorId)
    // 原生指标没有脚本可编辑；入口按钮保持可见并置灰。
    if (indicator?.source !== 'script') return
    closeMenu()
    emit('editCode', indicatorId)
  }

  /** 关闭选择器，并通知父组件清除一次性的 Pane 替换目标。 */
  function closeMenu() {
    controller.closeMenu()
    emit('close')
  }

  function getParamValues(indicatorId: string): Record<string, number | string | boolean> {
    const indicator = findIndicator(indicatorId)
    if (!indicator?.params) return {}

    const defaultParams: Record<string, number | string | boolean> = {}
    for (const p of indicator.params) {
      // 选项参数缺少默认值时回退到首个选项，避免非数值默认写入枚举参数。
      defaultParams[p.key] = p.default ?? p.options?.[0]?.value ?? p.min ?? 1
    }

    const userParams = props.indicatorParams?.[indicatorId] || {}
    const result: Record<string, number | string | boolean> = { ...defaultParams }

    // 数字与选项参数都可回填；其他类型暂由定义默认值表达。
    for (const [key, value] of Object.entries(userParams)) {
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        result[key] = value
      }
    }

    return result
  }

  function onParamsConfirm(values: Record<string, number | string | boolean>) {
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
    flex: 0 0 140px;
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
  .item-info-btn:focus-visible,
  .selector-nav-item:focus-visible {
    outline: 2px solid var(--klc-color-ui-text);
    outline-offset: -2px;
  }

  .indicator-item:hover {
    background: var(--klc-color-ui-hover);
  }

  .item-label {
    display: inline-flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    color: var(--klc-color-foreground);
  }

  .item-info-btn {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-axis-text);
    cursor: pointer;
  }

  .item-info-btn:hover {
    color: var(--klc-color-foreground);
  }

  .item-info-btn svg {
    width: 14px;
    height: 14px;
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

  /* 图标方块：勾号与操作按钮共用居中布局，尺寸由各自规则覆盖。 */
  .item-check,
  .item-action-btn,
  .item-favorite-btn {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
  }

  /* 勾号仅开启时参与布局，保持在所有操作按钮的最右侧。 */
  .item-check {
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

  .item-action-btn:hover:not(:disabled),
  .item-favorite-btn:hover:not(:disabled) {
    background: var(--klc-color-tag-bg-hover);
    color: var(--klc-color-foreground);
  }

  .item-favorite-btn[aria-pressed='true'] {
    color: var(--klc-color-ui-text);
  }

  .item-action-btn:disabled,
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

<style scoped src="../common/header-row.css"></style>
