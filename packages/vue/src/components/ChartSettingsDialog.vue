<!--
  图表设置（ADR 0006）：没有草稿，每个控件立即调用 settingsCommands —— 与 Agent 的 settings_update 工具同一入口；
  对话框只读 controller.settings 信号，Agent 在对话框打开时改设置会直接反映出来。
  布局为左侧导航（外观 / 图表 / 数据 / 快捷键 / 高级 / 关于），每个分区可“恢复默认”并提供撤销。
-->
<template>
  <BaseModal
    :show="show"
    title="设置"
    subtitle="即时生效"
    width="min(94vw, 760px)"
    max-height="min(720px, calc(100vh - 48px))"
    body-padding="0"
    :body-scrollable="false"
    @close="emit('close')"
  >
    <TabsRoot
      v-model="activeSection"
      class="settings"
      orientation="vertical"
      activation-mode="automatic"
    >
      <TabsList class="settings__nav" aria-label="设置分区">
        <TabsTrigger
          v-for="section in SETTINGS_SECTIONS"
          :key="section.id"
          :value="section.id"
          class="settings__nav-item"
        >
          {{ section.label.zh }}
        </TabsTrigger>
      </TabsList>

      <div class="settings__panels">
        <TabsContent
          v-for="section in SETTINGS_SECTIONS"
          :key="section.id"
          :value="section.id"
          class="settings__panel"
        >
          <header class="settings__panel-header">
            <h3 class="settings__panel-title">{{ section.label.zh }}</h3>
            <button
              v-if="section.keys.length > 0"
              type="button"
              class="settings__restore"
              :data-restore="section.id"
              :disabled="isSectionDefault(section.keys)"
              @click="restoreSection(section)"
            >
              恢复默认
            </button>
          </header>

          <!-- 外观 -->
          <template v-if="section.id === 'appearance'">
            <ThemePresetPanel :settings="settings" @update:settings="onPresetChange">
              <template #actions>
                <ThemeModeControl
                  :model-value="settings.theme"
                  label="明暗模式"
                  @update:model-value="update({ theme: $event })"
                />
              </template>
            </ThemePresetPanel>
            <SettingRow
              v-for="item in appearanceItems"
              :key="item.key"
              :item="item"
              :value="settings[item.key]"
              @change="update({ [item.key]: $event })"
            />
            <CollapsibleSection
              :expanded="colorsExpanded"
              label="自定义颜色"
              class="settings__colors"
              @toggle="colorsExpanded = !colorsExpanded"
            >
              <div class="settings__colors-toolbar">
                <SegmentedTabs
                  v-model="colorTheme"
                  :tabs="colorThemeOptions"
                  aria-label="编辑的明暗模式"
                />
                <button
                  type="button"
                  class="settings__restore"
                  :disabled="!hasColorOverrides(colorTheme)"
                  @click="restoreColors(colorTheme)"
                >
                  恢复此模式颜色
                </button>
              </div>
              <ColorPresetPanel
                :color-preset-settings="settings.colorPresetSettings"
                :editing-theme="colorTheme"
                :is-asia-market="Boolean(settings.isAsiaMarket)"
                @update:color-preset-settings="update({ colorPresetSettings: $event })"
              />
            </CollapsibleSection>
          </template>

          <!-- 图表 -->
          <template v-else-if="section.id === 'chart'">
            <SettingRow
              v-for="item in chartItems"
              :key="item.key"
              :item="item"
              :value="settings[item.key]"
              :options="optionsFor(item)"
              @change="update({ [item.key]: $event })"
            />
          </template>

          <!-- 数据 -->
          <template v-else-if="section.id === 'data'">
            <div class="settings__row">
              <span>缓存上限</span>
              <Dropdown
                :model-value="String(settings.marketDataCacheMaxMiB)"
                :options="cacheLimitOptions"
                aria-label="缓存上限"
                size="sm"
                min-width="120px"
                @update:model-value="update({ marketDataCacheMaxMiB: Number($event) })"
              />
            </div>
            <div class="settings__row settings__row--muted">
              <span>当前用量</span>
              <span class="settings__cache-usage">
                {{ cacheUsageText }}
                <button
                  type="button"
                  class="settings__icon-btn"
                  aria-label="清除缓存"
                  @click="emit('clearMarketDataCache')"
                >
                  <IconTablerTrash aria-hidden="true" />
                </button>
              </span>
            </div>
            <button
              type="button"
              class="settings__row settings__nav-row"
              @click="showAggregationSourceModal = true"
            >
              <span>聚合源管理</span>
              <IconTablerChevronRight class="settings__nav-arrow" aria-hidden="true" />
            </button>
          </template>

          <!-- 快捷键 -->
          <template v-else-if="section.id === 'shortcuts'">
            <ShortcutList v-if="hasCommands" />
            <p v-else class="settings__hint">快捷键在图表内可用。</p>
          </template>

          <!-- 高级 -->
          <template v-else-if="section.id === 'advanced'">
            <template v-for="item in advancedItems" :key="item.key">
              <SettingRow
                :item="item"
                :value="settings[item.key]"
                @change="update({ [item.key]: $event })"
              />
              <p v-if="item.key === 'rendererBackend' && runtimeHint" class="settings__hint">
                {{ runtimeHint }}
              </p>
            </template>
          </template>

          <!-- 关于 -->
          <template v-else-if="section.id === 'about'">
            <template v-for="group in openSourceCredits" :key="group.id">
              <div class="settings__subsection">{{ group.title }}</div>
              <a
                v-for="credit in group.items"
                :key="credit.name"
                class="settings__row settings__credit"
                :href="credit.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="settings__credit-name">{{ credit.name }}</span>
                <span class="settings__credit-version">
                  {{ credit.version }} · {{ credit.license }}
                </span>
              </a>
            </template>
          </template>
        </TabsContent>

        <div v-if="inlineToast.current.value" class="settings__toast" role="status">
          <span>{{ inlineToast.current.value.message }}</span>
          <button
            v-if="inlineToast.current.value.action"
            type="button"
            class="settings__toast-action"
            @click="inlineToast.act()"
          >
            {{ inlineToast.current.value.action.label }}
          </button>
        </div>
      </div>
    </TabsRoot>
  </BaseModal>

  <!-- 聚合源地址属于凭据类表单，保留其自身的显式提交。 -->
  <AggregationSourceDialog
    :show="showAggregationSourceModal"
    :sources="aggregationSources"
    :enabled-names="enabledSourceNames"
    :endpoints="sourceEndpoints"
    @close="showAggregationSourceModal = false"
    @toggle="(name, enabled) => emit('toggleAggregationSource', name, enabled)"
    @update-endpoint="(name, patch) => emit('updateSourceEndpoint', name, patch)"
  />
</template>

<script setup lang="ts">
  import type { ColorPresetThemeName, MarketDataCacheStats } from '@363045841yyt/klinechart-core'
  import {
    type ChartSettings,
    resolveSettingDefault,
    resolveSettings,
    type SettingItem,
  } from '@363045841yyt/klinechart-core/config'
  import type {
    ChartController,
    RendererBackendRuntime,
  } from '@363045841yyt/klinechart-core/controllers'
  import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
  import { computed, ref, toRef, watch } from 'vue'
  import IconTablerChevronRight from '~icons/tabler/chevron-right'
  import IconTablerTrash from '~icons/tabler/trash'
  import { injectCommands } from '../composables/commands/useCommands.js'
  import { createInlineToast, injectToast } from '../composables/feedback/undoToast.js'
  import {
    ADVANCED_SECTION_KEYS,
    APPEARANCE_SECTION_KEYS,
    CHART_SECTION_KEYS,
    SETTINGS_SECTIONS,
    type SettingsSection,
    type SettingsSectionId,
    settingItem,
  } from '../composables/settings/settingsSections.js'
  import {
    injectChartController,
    useChartSettings,
  } from '../composables/settings/useChartSettings.js'
  import type {
    AggregationSourceDefinition,
    AggregationSourceEndpoint,
  } from '../composables/useAggregationSources.js'
  import { getOpenSourceCredits } from '../credits/openSourceCredits.js'
  import AggregationSourceDialog from './AggregationSourceDialog.vue'
  import BaseModal from './BaseModal.vue'
  import ColorPresetPanel from './ColorPresetPanel.vue'
  import ShortcutList from './commands/ShortcutList.vue'
  import CollapsibleSection from './common/CollapsibleSection.vue'
  import ThemeModeControl from './common/ThemeModeControl.vue'
  import Dropdown from './Dropdown.vue'
  import SegmentedTabs from './SegmentedTabs.vue'
  import SettingRow from './settings/SettingRow.vue'
  import ThemePresetPanel from './ThemePresetPanel.vue'

  const props = withDefaults(
    defineProps<{
      show: boolean
      /** 图表 controller；省略时注入所在图表的 controller。 */
      controller?: ChartController | null
      rendererRuntime?: RendererBackendRuntime | null
      marketDataCacheStats?: MarketDataCacheStats
      aggregationSources?: ReadonlyArray<AggregationSourceDefinition>
      enabledSourceNames?: ReadonlySet<string>
      sourceEndpoints?: Record<string, AggregationSourceEndpoint>
      /** 打开时定位到的分区。 */
      initialSection?: SettingsSectionId
    }>(),
    {
      controller: undefined,
      aggregationSources: () => [],
      enabledSourceNames: () => new Set<string>(),
      sourceEndpoints: () => ({}),
      initialSection: 'appearance',
    },
  )

  const emit = defineEmits<{
    (e: 'close'): void
    (e: 'clearMarketDataCache'): void
    (e: 'toggleAggregationSource', name: string, enabled: boolean): void
    (e: 'updateSourceEndpoint', name: string, patch: Partial<AggregationSourceEndpoint>): void
  }>()

  const injectedController = injectChartController()
  const controllerRef = toRef((): ChartController | null =>
    props.controller === undefined ? (injectedController?.value ?? null) : props.controller,
  )
  const handle = useChartSettings(controllerRef, () => resolveSettings())
  const settings = handle.settings
  const hasCommands = injectCommands() !== null

  // 已注入共享 Toast 时交给它；否则在对话框内联显示撤销提示。
  const inlineToast = createInlineToast()
  const toast = injectToast() ?? inlineToast

  const items = (keys: ReadonlyArray<string>) =>
    keys.map(settingItem).filter((item): item is SettingItem => item !== undefined)
  const appearanceItems = items(APPEARANCE_SECTION_KEYS).filter((item) => item.key !== 'theme')
  const chartItems = items(CHART_SECTION_KEYS)
  const advancedItems = items(ADVANCED_SECTION_KEYS)

  const activeSection = ref<SettingsSectionId>(props.initialSection)
  const showAggregationSourceModal = ref(false)
  const colorsExpanded = ref(false)
  const colorTheme = ref<ColorPresetThemeName>('dark')
  const colorThemeOptions: ReadonlyArray<{ value: ColorPresetThemeName; label: string }> = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
  ]

  watch(
    () => props.show,
    (open) => {
      if (!open) return
      activeSection.value = props.initialSection
      // 默认编辑当前生效的明暗模式。
      colorTheme.value = controllerRef.value?.theme.peek() ?? 'dark'
    },
    { immediate: true },
  )

  /** 所有控件共用的唯一写入口（settings_update 同源）。 */
  function update(values: Record<string, unknown>): void {
    handle.update(values)
  }

  function onPresetChange(next: ChartSettings): void {
    update({ colorPresetSettings: next.colorPresetSettings ?? {} })
  }

  function isSectionDefault(keys: ReadonlyArray<string>): boolean {
    const current = settings.value
    return keys.every((key) => {
      if (key === 'colorPresetSettings') {
        return Object.keys(current.colorPresetSettings ?? {}).length === 0
      }
      const item = settingItem(key)
      return !item || current[key] === resolveSettingDefault(item.default)
    })
  }

  /** 恢复分区默认值并提供撤销；撤销同样走 settings_update。 */
  function restoreSection(section: SettingsSection): void {
    const result = handle.reset(section.keys)
    if (result.changed.length === 0) return
    offerUndo(`已恢复“${section.label.zh}”默认设置`, result.previous)
  }

  function hasColorOverrides(theme: ColorPresetThemeName): boolean {
    const overrides = settings.value.colorPresetSettings?.[theme]
    return overrides !== undefined && Object.keys(overrides).length > 0
  }

  function restoreColors(theme: ColorPresetThemeName): void {
    const next = { ...(settings.value.colorPresetSettings ?? {}) }
    delete next[theme]
    const result = handle.update({ colorPresetSettings: next })
    if (result.changed.length === 0) return
    offerUndo(`已恢复${theme === 'light' ? '浅色' : '深色'}模式颜色`, result.previous)
  }

  function offerUndo(message: string, previous: Readonly<Partial<ChartSettings>>): void {
    toast.show({
      message,
      action: { label: '撤销', onAction: () => handle.update(previous) },
    })
  }

  const localTimeZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  })()

  function optionsFor(item: SettingItem): { value: string; label: string }[] | undefined {
    if (item.key !== 'displayTimeZone') return undefined
    return (item.options ?? []).map((option) =>
      option.value === 'local'
        ? { ...option, label: `${option.label}（${localTimeZone}）` }
        : option,
    )
  }

  const cacheLimitOptions = [50, 100, 150, 200, 500].map((value) => ({
    value: String(value),
    label: `${value} MiB`,
  }))

  const runtimeHint = computed(() => {
    const runtime = props.rendererRuntime
    if (!runtime) return ''
    const status =
      runtime.status === 'ready'
        ? ''
        : runtime.status === 'switching'
          ? '切换中'
          : runtime.status === 'degraded'
            ? '已降级'
            : runtime.status
    return status ? `当前有效：${runtime.effective}（${status}）` : `当前有效：${runtime.effective}`
  })

  const cacheUsageText = computed(() => {
    const stats = props.marketDataCacheStats
    if (!stats) return '尚未初始化'
    const mib = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    return `${mib(stats.usedBytes)} / ${mib(stats.maxBytes)}（${stats.entryCount} 项）`
  })

  const openSourceCredits = getOpenSourceCredits()
</script>

<style scoped>
  .settings {
    display: grid;
    grid-template-columns: 148px minmax(0, 1fr);
    min-block-size: min(520px, calc(100vh - 160px));
    max-block-size: min(640px, calc(100vh - 120px));
    font-family: var(--klc-typography-font-family);
    font-size: var(--klc-typography-font-size-md);
    line-height: var(--klc-typography-line-height-standard);
    color: var(--klc-color-ui-text);
  }

  .settings__nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--klc-spacing-sm);
    border-inline-end: 1px solid var(--klc-color-ui-border);
    overflow-y: auto;
  }

  .settings__nav-item {
    display: flex;
    align-items: center;
    min-block-size: 32px;
    padding: 0 var(--klc-spacing-sm);
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition:
      background-color var(--klc-motion-duration-fast) ease,
      color var(--klc-motion-duration-fast) ease;
  }

  .settings__nav-item:hover,
  .settings__nav-item[data-state='active'] {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .settings__nav-item[data-state='active'] {
    font-weight: var(--klc-typography-font-weight-bold);
  }

  .settings__nav-item:focus-visible,
  .settings__restore:focus-visible,
  .settings__icon-btn:focus-visible,
  .settings__nav-row:focus-visible,
  .settings__credit:focus-visible,
  .settings__toast-action:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 2px;
  }

  .settings__panels {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    min-block-size: 0;
  }

  .settings__panel {
    flex: 1;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--klc-spacing-md) calc(var(--klc-spacing-md) + var(--klc-spacing-sm));
  }

  .settings__panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-md);
    margin-block-end: var(--klc-spacing-sm);
    padding-inline: var(--klc-spacing-sm);
  }

  .settings__panel-title {
    margin: 0;
    font-size: var(--klc-typography-font-size-md);
    font-weight: var(--klc-typography-font-weight-bold);
  }

  .settings__restore {
    padding: 2px var(--klc-spacing-xs);
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--klc-color-ui-accent, var(--klc-color-ui-text));
    font: inherit;
    cursor: pointer;
  }

  .settings__restore:disabled {
    color: var(--klc-color-ui-muted);
    cursor: default;
  }

  .settings__row {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-md);
    inline-size: 100%;
    min-block-size: 40px;
    padding: var(--klc-spacing-sm);
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
  }

  .settings__row--muted {
    color: var(--klc-color-ui-muted);
  }

  .settings__nav-row,
  .settings__credit {
    cursor: pointer;
    text-decoration: none;
    transition: background-color var(--klc-motion-duration-fast) ease;
  }

  .settings__nav-row:hover,
  .settings__credit:hover {
    background: var(--klc-color-ui-hover);
  }

  .settings__nav-arrow {
    inline-size: 16px;
    block-size: 16px;
    color: var(--klc-color-ui-muted);
  }

  .settings__cache-usage {
    display: inline-flex;
    align-items: center;
    gap: var(--klc-spacing-sm);
    white-space: nowrap;
  }

  .settings__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 28px;
    min-block-size: 28px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .settings__icon-btn:hover {
    color: var(--klc-color-ui-text);
  }

  .settings__icon-btn svg {
    inline-size: 16px;
    block-size: 16px;
  }

  .settings__hint {
    margin: 0;
    padding: 0 var(--klc-spacing-sm) var(--klc-spacing-sm);
    color: var(--klc-color-ui-muted);
  }

  .settings__colors {
    margin-block-start: var(--klc-spacing-sm);
  }

  .settings__colors-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-md);
    margin-block-end: var(--klc-spacing-sm);
  }

  .settings__subsection {
    padding: var(--klc-spacing-sm) var(--klc-spacing-sm) var(--klc-spacing-xs);
    color: var(--klc-color-ui-muted);
    font-weight: var(--klc-typography-font-weight-bold);
  }

  .settings__credit {
    min-block-size: 32px;
    font-family: var(--klc-typography-font-family-mono);
  }

  .settings__credit-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings__credit-version {
    flex: none;
    color: var(--klc-color-ui-muted);
    white-space: nowrap;
  }

  .settings__toast {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-md);
    margin: 0 var(--klc-spacing-md) var(--klc-spacing-md);
    padding: var(--klc-spacing-sm) var(--klc-spacing-md);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-surface);
  }

  .settings__toast-action {
    border: 0;
    background: none;
    color: var(--klc-color-ui-accent, var(--klc-color-ui-text));
    font: inherit;
    font-weight: var(--klc-typography-font-weight-bold);
    cursor: pointer;
  }

  /* 窄屏：左侧导航收为顶部横向滚动标签。 */
  @media (max-width: 640px) {
    .settings {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    .settings__nav {
      flex-direction: row;
      overflow-x: auto;
      border-inline-end: 0;
      border-block-end: 1px solid var(--klc-color-ui-border);
      scroll-snap-type: x proximity;
    }

    .settings__nav-item {
      flex: none;
      scroll-snap-align: start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .settings__nav-item,
    .settings__nav-row,
    .settings__credit {
      transition: none;
    }
  }
</style>
