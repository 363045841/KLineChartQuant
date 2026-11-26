<!--
  警报面板：按品种分组展示全部规则，占满工作台侧栏面板。
  - 列表自身滚动，间距对齐自选股面板：组间 2px、组头/行上下 4px、行间 0；
  - 新建由独立 AlertAddDialog 承担，本组件只处理已有规则；
  - 字号统一 12px，标题走 SidePanelHeader。
-->
<template>
  <section class="alert-panel" aria-label="警报">
    <SidePanelHeader title="警报">
      <template #actions>
        <BaseTooltip content="添加警报" placement="bottom">
          <BaseIconButton
            label="添加警报"
            :disabled="!controller || !currentSpec"
            @click="addOpen = true"
          >
            <IconTablerPlus aria-hidden="true" />
          </BaseIconButton>
        </BaseTooltip>
      </template>
    </SidePanelHeader>

    <p v-if="error" class="alert-panel__error" role="alert">
      <IconTablerAlertTriangle aria-hidden="true" />
      <span>{{ error }}</span>
    </p>

    <div class="alert-panel__scroll">
      <div class="alert-groups">
        <section v-for="group in groups" :key="group.key" class="alert-group">
          <button
            type="button"
            class="alert-group__header"
            :aria-expanded="!isCollapsed(group.key)"
            :title="group.instrument.name"
            @click="toggleGroup(group.key)"
          >
            <IconChevronDown
              class="alert-group__chevron"
              :class="{ 'is-collapsed': isCollapsed(group.key) }"
              aria-hidden="true"
            />
            <span class="alert-group__label">{{ group.label }}</span>
          </button>

          <ul v-if="!isCollapsed(group.key)" class="alert-group__list">
            <li
              v-for="row in group.rules"
              :key="row.rule.id"
              class="alert-rule"
              :class="{ 'is-disabled': !row.rule.enabled }"
            >
              <div class="alert-rule__main">
                <span class="alert-rule__label">{{ row.label }}</span>
                <span v-if="row.name && row.name !== row.label" class="alert-rule__name">
                  {{ row.name }}
                </span>

                <span v-if="row.rule.lastError" class="alert-rule__meta">
                  <BaseTooltip
                    :content="row.rule.lastError"
                    placement="top"
                    trigger-display="contents"
                  >
                    <span class="alert-rule__error">
                      <IconTablerAlertTriangle aria-hidden="true" />
                      执行失败
                    </span>
                  </BaseTooltip>
                </span>
              </div>

              <div class="alert-rule__actions">
                <div class="alert-rule__tools">
                  <BaseTooltip :content="row.paramsHint" placement="top">
                    <BaseIconButton
                      class="alert-rule__action"
                      :label="`编辑参数：${row.label}`"
                      :disabled="row.paramsState === 'no-params'"
                      @click="openParams(row.rule)"
                    >
                      <IconTablerSettings aria-hidden="true" />
                    </BaseIconButton>
                  </BaseTooltip>
                  <BaseTooltip content="删除警报" placement="top">
                    <BaseIconButton
                      class="alert-rule__action"
                      tone="danger"
                      :label="`删除警报：${row.label}`"
                      @click="removeRule(row.rule)"
                    >
                      <IconTablerTrash aria-hidden="true" />
                    </BaseIconButton>
                  </BaseTooltip>
                </div>
                <ToggleSwitch
                  size="compact"
                  :model-value="row.rule.enabled"
                  :label="`启用警报：${row.label}`"
                  @update:model-value="(next) => setEnabled(row.rule, next)"
                />
              </div>
            </li>
          </ul>
        </section>
      </div>

      <BaseEmptyState v-if="groups.length === 0" class="alert-panel__empty" size="compact">
        暂无警报规则
      </BaseEmptyState>
    </div>

    <AlertAddDialog
      v-model:open="addOpen"
      :alerts="runtime.alerts.value"
      :definitions="runtime.definitions"
      :current-spec="currentSpec"
      :instruments="instrumentPool"
      :search-symbols="searchSymbols"
      :aggregation-sources="aggregationSources"
      :enabled-source-names="enabledSourceNames"
    />

    <ParamsDialog
      v-if="paramsScript"
      :visible="paramsVisible"
      :definition-name="paramsScript.name"
      :description="paramsScript.description"
      :params="paramsScript.inputs"
      :values="paramsValues"
      @close="closeParams"
      @confirm="confirmParams"
    />
  </section>
</template>

<script setup lang="ts">
  import type {
    ChartController,
    SymbolSpec,
  } from '@363045841yyt/klinechart-core/controllers'
  import AlertAddDialog from '@vue-src/components/alert/AlertAddDialog.vue'
  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import BaseEmptyState from '@vue-src/components/common/feedback/BaseEmptyState.vue'
  import ToggleSwitch from '@vue-src/components/common/form/ToggleSwitch.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import ParamsDialog from '@vue-src/components/params/impl/ParamsDialog.vue'
  import type { SymbolItem } from '@vue-src/components/symbol/SymbolSelector.vue'
  import { useAlertPanel } from '@vue-src/composables/alerts/useAlertPanel.js'
  import { useAppRuntime } from '@vue-src/composables/runtime/useAppRuntime.js'
  import { useControllerSignal } from '@vue-src/composables/chart/useControllerSignal.js'
  import type { AggregationSourceDefinition } from '@vue-src/composables/market/useAggregationSources.js'
  import { fromSymbolInfo } from '@vue-src/composables/symbol/symbolSpec.js'
  import type { SymbolSearchFn } from '@vue-src/composables/symbol/useSymbolSearch.js'
  import SidePanelHeader from '@vue-src/features/side-panel/SidePanelHeader.vue'
  import { computed, ref, toRef } from 'vue'
  import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconTablerPlus from '~icons/tabler/plus'
  import IconTablerSettings from '~icons/tabler/settings'
  import IconTablerTrash from '~icons/tabler/trash'

  const props = defineProps<{
    controller: ChartController | null
    /** 品种远程搜索；工作台注入，保证任意品种可添加。 */
    searchSymbols: SymbolSearchFn<SymbolItem>
    /** 已注册数据源，传给品种选择器展示源页签。 */
    aggregationSources: ReadonlyArray<AggregationSourceDefinition>
    /** 已启用的搜索源名称。 */
    enabledSourceNames: ReadonlySet<string>
  }>()

  const addOpen = ref(false)
  const runtime = useAppRuntime()
  const controllerRef = toRef(props, 'controller')
  // 当前品种与本地品种池都从控制器派生，新建规则默认沿用图表的品种、周期与复权。
  const symbols = useControllerSignal(controllerRef, (ctrl) => ctrl.symbols, () => [])
  const symbolCatalog = useControllerSignal(controllerRef, (ctrl) => ctrl.symbolCatalog, () => [])
  const currentSpec = computed<SymbolSpec | null>(() => symbols.value[0] ?? null)
  const instrumentPool = computed<readonly SymbolItem[]>(() =>
    symbolCatalog.value.map(fromSymbolInfo),
  )

  const {
    error,
    groups,
    isCollapsed,
    toggleGroup,
    setEnabled,
    removeRule,
    paramsScript,
    paramsValues,
    paramsVisible,
    openParams,
    closeParams,
    confirmParams,
  } = useAlertPanel({
    alerts: () => runtime.alerts.value,
    definitions: runtime.definitions,
  })
</script>

<style scoped>
  .alert-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .alert-panel__error {
    display: flex;
    align-items: flex-start;
    gap: var(--klc-space-8);
    margin: var(--klc-space-8) var(--klc-space-12) 0;
    padding: var(--klc-space-8) var(--klc-space-12);
    border-radius: var(--klc-radius-sm);
    background: var(--klc-color-ui-danger-background);
    color: var(--klc-color-ui-danger-text);
    font-size: var(--klc-text-12-font-size);
    line-height: var(--klc-text-12-line-height);
  }

  .alert-panel__error svg {
    flex: none;
    margin-top: 0.15em;
  }

  .alert-panel__scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding-block: var(--klc-space-4) var(--klc-space-8);
    overscroll-behavior-y: contain;
  }

  .alert-panel__empty {
    padding: var(--klc-space-16) var(--klc-space-12);
  }

  /* ── 分组：间距对齐自选股面板 ── */

  .alert-groups {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-2);
  }

  .alert-group {
    display: flex;
    flex-direction: column;
  }

  .alert-group__header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--klc-space-4);
    width: 100%;
    padding: var(--klc-space-4) var(--klc-space-12);
    border: 0;
    background: var(--klc-color-ui-surround-background);
    color: var(--klc-color-ui-muted);
    font: inherit;
    font-size: var(--klc-text-label-12-font-size);
    line-height: var(--klc-text-label-12-line-height);
    font-weight: var(--klc-text-label-12-font-weight);
    text-align: left;
    cursor: pointer;
    transition: color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .alert-group__header:hover,
  .alert-group__header:focus-visible {
    color: var(--klc-color-ui-text);
    outline: 0;
  }

  .alert-group__chevron {
    flex: none;
    width: 1em;
    height: 1em;
    transition: transform var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .alert-group__chevron.is-collapsed {
    transform: rotate(-90deg);
  }

  .alert-group__label {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .alert-group__list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ── 规则行 ── */

  .alert-rule {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--klc-space-8);
    padding: var(--klc-space-4) var(--klc-space-12);
    transition: background var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .alert-rule:hover,
  .alert-rule:focus-within {
    background: var(--klc-color-ui-hover);
  }

  .alert-rule__main {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8);
    min-width: 0;
  }

  .alert-rule__label,
  .alert-rule__name {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--klc-text-12-font-size);
    line-height: var(--klc-text-12-line-height);
  }

  .alert-rule__label {
    color: var(--klc-color-ui-text);
    font-weight: var(--klc-text-label-12-font-weight);
  }

  .alert-rule__name {
    color: var(--klc-color-ui-text-soft);
  }

  .alert-rule__meta {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8);
    flex: none;
    font-size: var(--klc-text-12-font-size);
    line-height: var(--klc-text-12-line-height);
  }

  .alert-rule__error {
    display: inline-flex;
    align-items: center;
    gap: var(--klc-space-2);
    color: var(--klc-color-ui-warning);
  }

  .alert-rule__actions {
    display: flex;
    align-items: center;
    gap: var(--klc-space-4);
    flex: none;
  }

  /* 次要操作：悬停或键盘聚焦时显现，开关常驻。 */
  .alert-rule__tools {
    display: flex;
    align-items: center;
    gap: var(--klc-space-2);
    opacity: 0;
    transition: opacity var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .alert-rule:hover .alert-rule__tools,
  .alert-rule:focus-within .alert-rule__tools {
    opacity: 1;
  }

  /* 触屏设备没有悬停，操作始终可见。 */
  @media (hover: none) {
    .alert-rule__tools {
      opacity: 1;
    }
  }

  .alert-rule__action {
    --base-icon-button-color: var(--klc-color-ui-text-soft);
  }

  /* 停用只压文字，不压操作列。 */
  .alert-rule.is-disabled .alert-rule__label,
  .alert-rule.is-disabled .alert-rule__name {
    color: var(--klc-color-ui-text-soft);
    font-weight: normal;
  }

  @media (prefers-reduced-motion: reduce) {
    .alert-group__chevron,
    .alert-rule,
    .alert-rule__tools {
      transition: none;
    }
  }
</style>
