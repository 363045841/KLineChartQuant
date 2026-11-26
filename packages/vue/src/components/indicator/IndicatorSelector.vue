<!-- 指标选择弹窗：贴边搜索与 Compact 条目列表，类型通过胶囊标注。 -->
<template>
  <div class="indicator-selector">
    <BaseModal body="list"
      :open="menuOpen"
      :title="modalTitle"
      size="lg"
      @update:open="!$event && closeMenu()"
    >
      <template #tabs>
        <ModalSearchBar
          :model-value="searchQuery"
          placeholder="搜索指标名称..."
          aria-label="搜索指标"
          @update:model-value="controller.setSearchQuery"
        >
          <BaseButton v-if="scriptsEnabled !== false && section === INDICATOR_SELECTOR_SECTIONS.scripts" @click="createScript">
            新建脚本
          </BaseButton>
        </ModalSearchBar>
      </template>

      <div class="selector-content">
        <nav
          class="selector-nav"
          aria-label="指标分类"
          @pointerover="onNavPointerOver"
          @pointerleave="hideNavHighlight"
          @focusin="onNavFocusIn"
          @focusout="hideNavHighlight"
        >
          <SlidingHighlight ref="navHighlight" class="selector-nav__highlight" />
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
        <p v-if="removalError" class="selector-error modal-list-item" role="alert">{{ removalError }}</p>
        <ModalScrollArea>
          <div
            class="modal-list"
            role="list"
            aria-label="指标列表"
            @pointerover="onListPointerOver"
            @pointerleave="hideListHighlight"
            @focusin="onListFocusIn"
            @focusout="hideListHighlight"
          >
            <SlidingHighlight ref="listHighlight" class="modal-list__highlight" />
            <div
              v-for="indicator in filteredIndicators"
              :key="indicator.id"
              class="modal-list-entry modal-list-row"
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
                    <!-- 文本单独一层：省略号只裁文本。 -->
                    <span class="item-label__text">
                      {{ indicator.label }}
                      <span v-if="indicator.name && indicator.name !== indicator.label" class="item-name">
                        {{ indicator.name }}
                      </span>
                    </span>
                  </span>
                  <span class="item-tags">
                    <BaseChip>{{ indicator.role === INDICATOR_ROLE.MAIN ? '主图' : '副图' }}</BaseChip>
                  </span>
                </div>
              </button>
              <!-- 说明入口是整行的兄弟节点，不能嵌在选择按钮里。 -->
              <BasePopover
                v-if="indicator.description"
                :label="`${indicator.name} 指标说明`"
                role="note"
                placement="auto"
                trigger="hover"
              >
                <template #trigger="{ props: triggerProps }">
                  <BaseIconButton
                    size="xs"
                    class="item-info-btn"
                    :label="`查看指标说明：${indicator.name}`"
                    v-bind="triggerProps"
                  >
                    <IconTablerInfoCircle aria-hidden="true" />
                  </BaseIconButton>
                </template>
                <p class="modal-list-description__title">{{ indicator.name }}</p>
                <p class="modal-list-description">{{ indicator.description }}</p>
              </BasePopover>
              <!-- 自定义脚本与图例的编辑脚本共用同一入口，打开代码编辑器。 -->
              <BaseTooltip v-if="scriptsEnabled !== false" content="编辑脚本" placement="top">
                <BaseIconButton
                  class="item-action-btn"
                  :label="`编辑脚本：${indicator.name}`"
                  :disabled="indicator.source !== 'script'"
                  @click="editScript(indicator.id)"
                >
                  <IconTablerCode aria-hidden="true" />
                </BaseIconButton>
              </BaseTooltip>
              <BaseTooltip v-if="indicator.source === 'script' && canRemove(indicator.id)" content="删除脚本" placement="top">
                <BaseIconButton
                  class="item-action-btn"
                  tone="danger"
                  :label="`删除脚本：${indicator.name}`"
                  :disabled="removing !== null"
                  @click="removeScript(indicator.id)"
                >
                  <IconTablerTrash aria-hidden="true" />
                </BaseIconButton>
              </BaseTooltip>
              <BaseTooltip content="编辑参数" placement="top">
                <BaseIconButton
                  class="item-action-btn"
                  :label="`编辑参数：${indicator.name}`"
                  :disabled="!indicator.inputs?.length"
                  @click="showParams(indicator.id)"
                >
                  <IconTablerSettings aria-hidden="true" />
                </BaseIconButton>
              </BaseTooltip>
              <BaseIconButton
                class="item-favorite-btn"
                :label="`${favoriteSet.has(indicator.id) ? '取消收藏' : '收藏'}：${indicator.label}`"
                :aria-pressed="favoriteSet.has(indicator.id)"
                :disabled="!chartController"
                @click="toggleFavorite(indicator.id)"
              >
                <IconTablerStarFilled v-if="favoriteSet.has(indicator.id)" aria-hidden="true" />
                <IconTablerStar v-else aria-hidden="true" />
              </BaseIconButton>
              <span v-if="isActive(indicator.id)" class="item-check" aria-hidden="true">
                <IconTablerCheck />
              </span>
            </div>
          </div>

          <BaseEmptyState v-if="filteredIndicators.length === 0" class="modal-list-item" role="status">
            <template v-if="isSearchEmpty" #icon><IconTablerSearch /></template>
            {{ emptyTitle }}
            <template v-if="isSearchEmpty" #hint>请尝试其他关键词</template>
          </BaseEmptyState>
        </ModalScrollArea>
      </div>
    </BaseModal>

    <ParamsDialog
      v-if="currentIndicator"
      :visible="paramsVisible"
      :definition-id="currentIndicator.id"
      :definition-name="currentIndicatorName"
      :description="currentIndicator.description"
      :params="currentIndicator.inputs || []"
      :values="paramValues"
      @close="paramsVisible = false"
      @reset="selectVisibility('all')"
      @confirm="onParamsConfirm"
    >
      <template v-if="instancePeriod" #after-params>
        <div class="indicator-timeframe-visibility">
          <FormRow :for-id="timeframeControlId">
            <template #label>{{ TIMEFRAME_VISIBILITY_LABEL }}</template>
            <DropMenu
              :label="TIMEFRAME_VISIBILITY_LABEL"
              :groups="visibilityGroups"
              :tooltip="false"
              trigger-variant="field"
              :trigger-id="timeframeControlId"
              @select="(_group, item) => selectVisibility(item)"
            >
              <template #trigger>
                <span class="selection-menu__value">{{ visibilityLabel }}</span>
                <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
              </template>
            </DropMenu>
          </FormRow>
        </div>
      </template>
    </ParamsDialog>
  </div>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/dialog/modal-list.css'
  import '@vue-src/components/common/dialog/modal-list-item.css'
  import '@vue-src/components/common/menu/selection-menu.css'

  import {
    type ChartController,
    createIndicatorSelectorController,
    findIndicatorDefinition,
    INDICATOR_ROLE,
    type IndicatorRole,
    indicatorCatalog,
    type LegendEntry,
  } from '@363045841yyt/klinechart-core/controllers'
  import type { TimeframeVisibility } from '@363045841yyt/klinechart-plot-contracts'
  import BaseChip from '@vue-src/components/common/BaseChip.vue'
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import BaseModal from '@vue-src/components/common/dialog/BaseModal.vue'
  import ModalScrollArea from '@vue-src/components/common/dialog/ModalScrollArea.vue'
  import ModalSearchBar from '@vue-src/components/common/dialog/ModalSearchBar.vue'
  import BaseEmptyState from '@vue-src/components/common/feedback/BaseEmptyState.vue'
  import FormRow from '@vue-src/components/common/form/FormRow.vue'
  import DropMenu from '@vue-src/components/common/menu/DropMenu.vue'
  import BasePopover from '@vue-src/components/common/overlay/BasePopover.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import SlidingHighlight from '@vue-src/components/common/SlidingHighlight.vue'
  import ParamsDialog from '@vue-src/components/params/impl/ParamsDialog.vue'
  import { K_LINE_LEVEL_OPTIONS } from '@vue-src/components/toolbar/kLineLevel.js'
  import { SCRIPT_SOURCE_STORE_KEY } from '@vue-src/composables/chart/scriptEditor/types.js'
  import {
    resolveTimeframeVisibility,
    TIMEFRAME_VISIBILITY_LABEL,
    timeframeVisibilityItems,
  } from '@vue-src/composables/chart/useTimeframeVisibilityMenu.js'
  import {
    INDICATOR_SELECTOR_SECTIONS,
    useIndicatorFavorites,
  } from '@vue-src/composables/indicator/useIndicatorFavorites.js'
  import { useScriptRemoval } from '@vue-src/composables/indicator/useScriptRemoval.js'
  import { useSlidingHighlight } from '@vue-src/composables/ui/useSlidingHighlight.js'
  import { coreSignalToVueRef } from '@vue-src/utils/signalBridge.js'
  import { computed, inject, ref, shallowRef, useId, watch } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconChevronDown from '~icons/tabler/chevron-down'
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
    replaceRole: IndicatorRole
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

  // 目录是 Core 注册表投影，选择器打开即已是最新，不再复制列表。
  const controller = createIndicatorSelectorController({ catalog: indicatorCatalog })
  const { removing, removalError, canRemove, removeScript } = useScriptRemoval(
    inject(SCRIPT_SOURCE_STORE_KEY, undefined),
  )

  const menuOpen = coreSignalToVueRef(controller.menuOpen)
  const searchQuery = coreSignalToVueRef(controller.searchQuery)
  const filteredMain = coreSignalToVueRef(controller.filteredMain)
  const filteredSub = coreSignalToVueRef(controller.filteredSub)

  type IndicatorDefinitionView = NonNullable<ReturnType<typeof findIndicatorDefinition>>

  /** 参数弹窗的一次会话：目录项参数与图例实例设置走不同分支。 */
  type ParamsSession =
    | {
        readonly kind: 'catalog'
        readonly definitionId: string
        readonly indicator: IndicatorDefinitionView
      }
    | {
        readonly kind: 'instance'
        readonly indicator: IndicatorDefinitionView
        readonly chart: ChartController
        readonly entry: Extract<LegendEntry, { kind: 'indicator' }>
        readonly period: string | null
        readonly visibilityDraft?: TimeframeVisibility
      }

  const paramsSession = shallowRef<ParamsSession | null>(null)
  const paramsVisible = ref(false)
  /** 时间周期可见性行的按钮 id，供 FormRow 的可见标签关联。 */
  const timeframeControlId = useId()
  /** 会话在关闭后保留到退场结束；下一次打开整体替换。 */
  const currentIndicator = computed(() => paramsSession.value?.indicator)
  const instancePeriod = computed(() =>
    paramsSession.value?.kind === 'instance' ? paramsSession.value.period : null,
  )
  const visibility = computed(() => {
    const session = paramsSession.value
    return session?.kind === 'instance'
      ? session.visibilityDraft ?? session.entry.timeframeVisibility
      : undefined
  })
  const visibilityLabel = computed(() => {
    const rule = visibility.value
    if (!rule || rule.mode === 'all') return '所有时间周期'
    const period =
      K_LINE_LEVEL_OPTIONS.find(({ value }) => value === rule.period)?.label ?? rule.period
    switch (rule.mode) {
      case 'above':
        return `${period}及以上`
      case 'below':
        return `${period}及以下`
      case 'current':
        return `仅${period}`
    }
  })
  const visibilityGroups = computed(() => [
    { id: 'visibility', label: '', items: timeframeVisibilityItems([visibility.value]) },
  ])
  /** 参数弹窗标题优先用长名称，缺省回落到列表标签。 */
  const currentIndicatorName = computed(
    () => currentIndicator.value?.name ?? currentIndicator.value?.label ?? '',
  )
  /** 更换指标时只展示目标位置，其余情况合并为 Compact 列表。 */
  const availableIndicators = computed(() => {
    const indicators = props.replacePaneId
      ? props.replaceRole === 'main'
        ? filteredMain.value
        : filteredSub.value
      : [...filteredMain.value, ...filteredSub.value]
    return props.scriptsEnabled === false
      ? indicators.filter((item) => item.source !== 'script')
      : indicators
  })
  const { section, favoriteSet, filteredIndicators, toggleFavorite } = useIndicatorFavorites(
    computed(() => props.chartController ?? null),
    availableIndicators,
  )

  // 侧栏与列表各自一块高亮：两者是并列的两个容器，坐标空间互不相干。
  const navHighlight = ref<InstanceType<typeof SlidingHighlight> | null>(null)
  const listHighlight = ref<InstanceType<typeof SlidingHighlight> | null>(null)
  const {
    onPointerOver: onNavPointerOver,
    onFocusIn: onNavFocusIn,
    hide: hideNavHighlight,
  } = useSlidingHighlight(navHighlight, (target) =>
    target.closest<HTMLElement>('.selector-nav-item'),
  )
  const {
    onPointerOver: onListPointerOver,
    onFocusIn: onListFocusIn,
    hide: hideListHighlight,
  } = useSlidingHighlight(listHighlight, (target) => target.closest<HTMLElement>('.modal-list-entry'))

  // 收藏、分区或搜索让当前行消失时指针不会移动，高亮块会停在旧位置，这里主动收起。
  watch(filteredIndicators, () => hideListHighlight())

  /** 空态文案：收藏/脚本分区在无搜索词时各有专用文案。 */
  const emptyTitle = computed(() => {
    if (section.value === INDICATOR_SELECTOR_SECTIONS.favorites && !searchQuery.value.trim())
      return '暂无收藏指标'
    if (section.value === INDICATOR_SELECTOR_SECTIONS.scripts && !searchQuery.value.trim())
      return '暂无用户自定义脚本'
    return '未找到匹配的指标'
  })
  const isSearchEmpty = computed(
    () =>
      !(
        (section.value === INDICATOR_SELECTOR_SECTIONS.favorites ||
          section.value === INDICATOR_SELECTOR_SECTIONS.scripts) &&
        !searchQuery.value.trim()
      ),
  )

  const modalTitle = computed(() => (props.replacePaneId ? '更换指标' : '添加指标'))

  function isActive(indicatorId: string): boolean {
    return props.activeIndicators?.includes(indicatorId) ?? false
  }

  function addIndicator(indicatorId: string) {
    if (isActive(indicatorId)) return
    const indicator = findIndicatorDefinition(indicatorId)
    if (!indicator) return
    emit('toggle', indicatorId, true)
  }

  function removeIndicator(indicatorId: string) {
    emit('toggle', indicatorId, false)
  }

  /** 切换指标启用状态。 */
  function toggleIndicator(indicatorId: string) {
    if (props.replacePaneId) {
      const indicator = findIndicatorDefinition(indicatorId)
      if (!indicator || indicator.role !== props.replaceRole) return
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
    const indicator = findIndicatorDefinition(indicatorId)
    // 没有可设置项时不打开空弹窗；入口按钮保持可见并置灰。
    if (!indicator?.inputs?.length) return
    paramsSession.value = { kind: 'catalog', definitionId: indicatorId, indicator }
    paramsVisible.value = true
  }

  function showInstanceSettings(instanceId: string, period: string | null) {
    const chart = props.chartController
    const entry = chart?.legend.get(instanceId)
    if (!chart || entry?.kind !== 'indicator') return
    const indicator = findIndicatorDefinition(entry.definitionId)
    if (!indicator || (period === null && !indicator.inputs?.length)) return
    paramsSession.value = { kind: 'instance', indicator, chart, entry, period }
    paramsVisible.value = true
  }

  function selectVisibility(itemId: string) {
    const session = paramsSession.value
    if (session?.kind !== 'instance' || !session.period) return
    const rule = resolveTimeframeVisibility(itemId, session.period)
    if (rule) paramsSession.value = { ...session, visibilityDraft: rule }
  }

  /** 请求宿主打开脚本代码编辑器；打开动作与图例的编辑脚本共用同一会话。 */
  function createScript() {
    closeMenu()
    emit('createScript')
  }

  /** 打开当前脚本文档，官方身份由编辑器提供只读展示。 */
  function editScript(indicatorId: string) {
    const indicator = findIndicatorDefinition(indicatorId)
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

  const paramValues = computed<Record<string, number | string | boolean>>(() => {
    const indicator = currentIndicator.value
    if (!indicator?.inputs) return {}

    const defaultInputs: Record<string, number | string | boolean> = {}
    for (const p of indicator.inputs) {
      // 选项参数缺少默认值时回退到首个选项，避免非数值默认写入枚举参数。
      defaultInputs[p.key] = p.default ?? p.options?.[0]?.value ?? p.min ?? 1
    }

    const session = paramsSession.value
    const userParams =
      session?.kind === 'instance'
        ? session.entry.params
        : (props.indicatorParams?.[indicator.id] ?? {})
    const result: Record<string, number | string | boolean> = { ...defaultInputs }

    // 数字与选项参数都可回填；其他类型暂由定义默认值表达。
    for (const [key, value] of Object.entries(userParams)) {
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        result[key] = value
      }
    }

    return result
  })

  function onParamsConfirm(values: Record<string, number | string | boolean>) {
    const session = paramsSession.value
    if (session?.kind === 'instance' && session.chart === props.chartController) {
      const entry = session.chart.legend.get(session.entry.id)
      if (entry?.kind === 'indicator' && entry.definitionId === session.entry.definitionId) {
        const edits = Object.entries(values).filter(
          ([key, value]) => paramValues.value[key] !== value,
        )
        const visibilityDraft = session.visibilityDraft
        if (edits.length > 0 || visibilityDraft) {
          session.chart.legend.update(entry.id, {
            ...(edits.length > 0
              ? { params: { ...entry.params, ...Object.fromEntries(edits) } }
              : {}),
            ...(visibilityDraft ? { timeframeVisibility: visibilityDraft } : {}),
          })
        }
      }
    } else if (session?.kind === 'catalog') {
      emit('updateParams', session.definitionId, values)
    }
    paramsVisible.value = false
  }

  defineExpose({
    openMenu: () => controller.openMenu(),
    closeMenu,
    toggleMenu: () => controller.toggleMenu(),
    openParams: showParams,
    openInstanceSettings: showInstanceSettings,
  })
</script>

<style scoped>
  .indicator-timeframe-visibility {
    margin-inline: var(--base-modal-content-inset);
    padding-block: var(--klc-space-8);
  }
  .indicator-selector {
    display: none;
  }

  .selector-content {
    display: flex;
    height: min(420px, calc(75dvh - 82px));
    min-height: 0;
  }

  .selector-nav {
    /* 滑动高亮的定位上下文；块与导航项处在同一容器内。 */
    position: relative;
    display: flex;
    flex: 0 0 140px;
    flex-direction: column;
    border-right: 1px solid var(--klc-color-ui-border);
  }

  /* 导航项通栏紧邻，高亮块保持直角贴边。 */
  .selector-nav__highlight,
  .modal-list__highlight {
    --sliding-highlight-radius: 0;
  }

  .selector-nav-item {
    /* 文字压在滑动高亮块之上。 */
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    min-width: 0;
    min-height: 36px;
    /* 侧栏只有 140px，导航行用比列表更小的横向留白，图标和文字才不被挤压。 */
    padding-inline: var(--klc-space-12, 12px);
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-muted);
    font: inherit;
    font-size: var(--klc-text-label-13-font-size, 13px);
    text-align: left;
    cursor: pointer;
  }

  /* 悬停只提亮文字，底色交给滑动高亮块，避免两层底色叠加。 */
  .selector-nav-item:hover,
  .selector-nav-item:focus-visible {
    color: var(--klc-color-ui-text);
  }

  /* 选中态是常驻底色，与瞬时悬停分开取色。 */
  .selector-nav-item.selected {
    background: var(--klc-color-ui-selected);
    color: var(--klc-color-ui-text);
  }

  .selector-nav-item svg {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }

  .selector-error {
    margin: 0;
    padding-block: var(--klc-space-8, 8px);
    font-size: var(--klc-text-12-font-size, 12px);
    color: var(--klc-color-danger, #e04a4a);
  }

  .item-favorite-btn[aria-pressed='true'] {
    color: var(--klc-color-ui-text);
  }

  .item-favorite-btn:focus-visible,
  .selector-nav-item:focus-visible {
    outline: 2px solid var(--klc-color-ui-text);
    outline-offset: -2px;
  }

  @media (max-width: 480px) {
    .selector-nav {
      flex-basis: 76px;
    }

    .selector-nav-item {
      gap: var(--klc-space-4, 4px);
      padding: 0 var(--klc-space-8, 8px);
    }
  }

</style>
