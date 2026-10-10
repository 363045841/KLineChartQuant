<!-- 图表设置弹窗：编辑设置草稿，管理主题、配色、数据源与缓存。 -->
<template>
  <!-- 主弹窗 -->
  <BaseModal
    :show="show"
    title="图表设置"
    subtitle="个性化配置"
    width="min(92vw, 460px)"
    max-height="min(720px, calc(100vh - 48px))"
    body-padding="var(--klc-spacing-md) calc(var(--klc-spacing-md) + var(--klc-spacing-sm))"
    footer-align="space-between"
    @close="closeSettings"
  >
    <template #tabs>
      <BaseTabs v-model="activeSection" :tabs="settingsTabs" aria-label="图表设置" />
    </template>

    <div class="settings-body" :class="{ 'settings-body--style': activeSection === 'style' }">
      <template v-if="activeSection === 'main'">
        <template v-for="item in mainSettings" :key="item.key">
          <div class="settings-item">
            <span>{{ item.label }}</span>
            <template v-if="item.type === 'boolean'">
              <ToggleSwitch
                :model-value="Boolean(settings[item.key])"
                :aria-label="item.label"
                @update:model-value="settings[item.key] = $event"
              />
            </template>
            <template v-else-if="item.type === 'select' && item.options">
              <Dropdown
                :model-value="String(settings[item.key])"
                :options="optionsFor(item)"
                size="sm"
                min-width="100px"
                @update:model-value="settings[item.key] = $event"
              />
            </template>
          </div>
          <div
            v-if="item.key === 'rendererBackend' && runtimeHint"
            class="settings-item runtime-hint"
          >
            <span>{{ runtimeHint }}</span>
          </div>
        </template>
      </template>

      <template v-else-if="activeSection === 'dataSource'">
        <div class="settings-item">
          <span>缓存上限</span>
          <Dropdown
            :model-value="String(settings.marketDataCacheMaxMiB)"
            :options="cacheLimitOptions"
            size="sm"
            min-width="100px"
            @update:model-value="settings.marketDataCacheMaxMiB = Number($event)"
          />
        </div>
        <div class="settings-item cache-usage">
          <span>当前用量</span>
          <span class="cache-usage__value">
            {{ cacheUsageText }}
            <button
              type="button"
              class="cache-clear-btn"
              title="清除缓存"
              aria-label="清除缓存"
              @click="clearCache"
            >
              <IconTablerTrash aria-hidden="true" />
            </button>
          </span>
        </div>
        <div class="settings-item nav-item" @click="showAggregationSourceModal = true">
          <span>聚合源管理</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="16"
            height="16"
            class="nav-arrow"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </template>

      <template v-else-if="activeSection === 'style'">
        <ThemePresetPanel :settings="settings" @update:settings="onThemePresetChange">
          <template #actions>
            <ThemeModeControl v-model="settings.theme" label="明暗模式" />
          </template>
        </ThemePresetPanel>
        <template v-for="item in styleSettings" :key="item.key">
          <div class="settings-item">
            <span>{{ item.label }}</span>
            <template v-if="item.type === 'boolean'">
              <ToggleSwitch
                :model-value="Boolean(settings[item.key])"
                :aria-label="item.label"
                @update:model-value="settings[item.key] = $event"
              />
            </template>
            <template v-else-if="item.type === 'select' && item.options">
              <Dropdown
                :model-value="String(settings[item.key])"
                :options="optionsFor(item)"
                size="sm"
                min-width="100px"
                @update:model-value="settings[item.key] = $event"
              />
            </template>
          </div>
        </template>
        <div class="settings-item nav-item" @click="showColorPresetModal = true">
          <span>颜色配置</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="16"
            height="16"
            class="nav-arrow"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </template>

      <template v-else-if="activeSection === 'experimental'">
        <template v-for="item in experimentalSettings" :key="item.key">
          <div class="settings-item experimental">
            <span>{{ item.label }}</span>
            <template v-if="item.type === 'boolean'">
              <ToggleSwitch
                :model-value="Boolean(settings[item.key])"
                :aria-label="item.label"
                @update:model-value="settings[item.key] = $event"
              />
            </template>
            <template v-else-if="item.type === 'select' && item.options">
              <Dropdown
                :model-value="String(settings[item.key])"
                :options="item.options"
                size="sm"
                min-width="100px"
                @update:model-value="settings[item.key] = $event"
              />
            </template>
          </div>
        </template>
      </template>

      <template v-else-if="activeSection === 'opensource'">
        <template v-for="section in openSourceCredits" :key="section.id">
          <div class="settings-subsection-label">{{ section.title }}</div>
          <a
            v-for="credit in section.items"
            :key="credit.name"
            class="settings-item credit-item"
            :href="credit.url"
            target="_blank"
            rel="noopener noreferrer"
            :title="credit.url"
          >
            <span class="credit-name">{{ credit.name }}</span>
            <span class="credit-version">{{ credit.version }} · {{ credit.license }}</span>
          </a>
        </template>
      </template>
    </div>

    <template #footer>
      <BaseButton @click="resetSettings">重置</BaseButton>
      <div class="footer-right">
        <BaseButton @click="closeSettings">取消</BaseButton>
        <BaseButton @click="confirmSettings">确定</BaseButton>
      </div>
    </template>
  </BaseModal>

  <!-- 嵌套聚合源管理 -->
  <AggregationSourceDialog
    :show="showAggregationSourceModal"
    :sources="aggregationSources"
    :enabled-names="enabledSourceNames"
    :endpoints="sourceEndpoints"
    @close="showAggregationSourceModal = false"
    @toggle="onToggleAggregationSource"
    @update-endpoint="onUpdateSourceEndpoint"
  >
    <template #source-management><slot name="source-management" /></template>
  </AggregationSourceDialog>

  <!-- 嵌套颜色预设弹窗 -->
  <BaseModal
    :show="showColorPresetModal"
    title="颜色预设"
    subtitle="自定义图表颜色"
    width="min(92vw, 460px)"
    max-height="min(720px, calc(100vh - 48px))"
    footer-align="space-between"
    @close="showColorPresetModal = false"
  >
    <template #tabs>
      <BaseTabs v-model="colorPresetTheme" :tabs="colorThemeOptions" aria-label="颜色主题" />
    </template>
    <ColorPresetPanel
      ref="colorPresetPanelRef"
      :color-preset-settings="settings.colorPresetSettings"
      :editing-theme="colorPresetTheme"
      :is-asia-market="settings.isAsiaMarket"
      @update:color-preset-settings="settings = { ...settings, colorPresetSettings: $event }"
    />
    <template #footer>
      <BaseButton @click="colorPresetPanelRef?.resetCurrentThemeColors()"> 重置颜色 </BaseButton>
      <BaseButton @click="showColorPresetModal = false">确认</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import type { ColorPresetThemeName, MarketDataCacheStats } from '@363045841yyt/klinechart-core'
  import {
    type ChartSettings,
    DEFAULT_SETTINGS,
    normalizeSettings,
    resolveSettingDefault,
    type SettingItem,
  } from '@363045841yyt/klinechart-core/config'
  import type { RendererBackendRuntime } from '@363045841yyt/klinechart-core/controllers'
  import { computed, ref, watch } from 'vue'
  import IconTablerTrash from '~icons/tabler/trash'
  import type { AggregationSourceEndpoint } from '../composables/useAggregationSources.js'
  import { getOpenSourceCredits } from '../credits/openSourceCredits.js'
  import AggregationSourceDialog from './AggregationSourceDialog.vue'
  import BaseButton from './BaseButton.vue'
  import BaseModal from './BaseModal.vue'
  import BaseTabs from './BaseTabs.vue'
  import ColorPresetPanel from './ColorPresetPanel.vue'
  import ThemeModeControl from './common/ThemeModeControl.vue'
  import ToggleSwitch from './common/ToggleSwitch.vue'
  import Dropdown from './Dropdown.vue'
  import ThemePresetPanel from './ThemePresetPanel.vue'

  const props = withDefaults(
    defineProps<{
      show: boolean
      initialSettings?: ChartSettings
      rendererRuntime?: RendererBackendRuntime | null
      marketDataCacheStats?: MarketDataCacheStats
      aggregationSources?: ReadonlyArray<
        import('../composables/useAggregationSources.js').AggregationSourceDefinition
      >
      enabledSourceNames?: ReadonlySet<string>
      sourceEndpoints?: Record<string, AggregationSourceEndpoint>
    }>(),
    {
      aggregationSources: () => [],
      enabledSourceNames: () => new Set<string>(),
      sourceEndpoints: () => ({}),
    },
  )

  const emit = defineEmits<{
    (e: 'close'): void
    (e: 'confirm', settings: ChartSettings): void
    (e: 'clearMarketDataCache'): void
    (e: 'toggleAggregationSource', name: string, enabled: boolean): void
    (e: 'updateSourceEndpoint', name: string, patch: Partial<AggregationSourceEndpoint>): void
    /** 主题预设点击即生效，无需等“确定”。 */
    (
      e: 'applyThemePreset',
      colorPresetSettings: NonNullable<ChartSettings['colorPresetSettings']>,
    ): void
  }>()

  const mainSettings = computed(
    () =>
      DEFAULT_SETTINGS.filter(
        (s) => s.key !== 'theme' && s.group === 'main',
      ) as unknown as SettingItem[],
  )

  const localTimeZone = resolveLocalTimeZone()

  function optionsFor(item: SettingItem): { value: string; label: string }[] {
    if (item.key !== 'displayTimeZone') return item.options ?? []
    return (item.options ?? []).map((option) =>
      option.value === 'local'
        ? { ...option, label: `${option.label}（${localTimeZone}）` }
        : option,
    )
  }

  function resolveLocalTimeZone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }
  const experimentalSettings = computed(
    () => DEFAULT_SETTINGS.filter((s) => s.group === 'experimental') as unknown as SettingItem[],
  )
  const styleSettings = computed(
    () =>
      DEFAULT_SETTINGS.filter(
        (s) => s.key !== 'theme' && s.group === 'style',
      ) as unknown as SettingItem[],
  )
  const cacheLimitOptions = [50, 100, 150, 200, 500].map((value) => ({
    value: String(value),
    label: `${value} MiB`,
  }))
  const openSourceCredits = getOpenSourceCredits()

  type SettingsSectionId = 'main' | 'style' | 'experimental' | 'dataSource' | 'opensource'

  /** 按分组可用性构建 tab 列表，空分组不出现在 tab 中。 */
  const settingsTabs = computed<ReadonlyArray<{ id: SettingsSectionId; label: string }>>(() => {
    const tabs: { id: SettingsSectionId; label: string }[] = []
    if (mainSettings.value.length > 0) tabs.push({ id: 'main', label: '主图设置' })
    tabs.push({ id: 'dataSource', label: '数据源' })
    tabs.push({ id: 'style', label: '样式 / 颜色' })
    if (experimentalSettings.value.length > 0) {
      tabs.push({ id: 'experimental', label: '实验性 / 调试设置' })
    }
    tabs.push({ id: 'opensource', label: '开源致谢' })
    return tabs
  })

  const activeSection = ref<SettingsSectionId>('main')
  const showAggregationSourceModal = ref(false)
  const showColorPresetModal = ref(false)
  const colorPresetTheme = ref<ColorPresetThemeName>('light')
  const colorThemeOptions: readonly { id: ColorPresetThemeName; label: string }[] = [
    { id: 'light', label: '浅色' },
    { id: 'dark', label: '深色' },
  ]

  function onToggleAggregationSource(name: string, enabled: boolean) {
    emit('toggleAggregationSource', name, enabled)
  }

  function onUpdateSourceEndpoint(name: string, patch: Partial<AggregationSourceEndpoint>) {
    emit('updateSourceEndpoint', name, patch)
  }

  const colorPresetPanelRef = ref<InstanceType<typeof ColorPresetPanel> | null>(null)

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
    return `${formatBytes(stats.usedBytes)} / ${formatBytes(stats.maxBytes)}（${stats.entryCount} 项）`
  })

  function formatBytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
  }

  const settings = ref<ChartSettings>(normalizeSettings(props.initialSettings))

  watch(
    () => props.show,
    (val) => {
      if (val) {
        settings.value = structuredClone(normalizeSettings(props.initialSettings))
        activeSection.value = settingsTabs.value[0]?.id ?? 'dataSource'
      }
    },
  )

  function closeSettings() {
    emit('close')
  }

  function resetSettings() {
    const defaults: ChartSettings = {}
    DEFAULT_SETTINGS.forEach((item) => {
      ;(defaults as Record<string, unknown>)[item.key] = resolveSettingDefault(item.default)
    })
    defaults.colorPresetSettings = {}
    settings.value = defaults
  }

  function confirmSettings() {
    emit('confirm', { ...settings.value })
  }

  /** 主题预设点击即生效：先写入草稿，再立即提交给上层应用并持久化，不关闭弹窗。 */
  function onThemePresetChange(next: ChartSettings): void {
    settings.value = next
    emit('applyThemePreset', next.colorPresetSettings ?? {})
  }

  function clearCache() {
    emit('clearMarketDataCache')
  }
</script>

<style scoped>
  .settings-body {
    display: flex;
    flex-direction: column;
    gap: 0;
    font-family: var(--klc-typography-font-family);
    font-size: var(--klc-typography-font-size-md);
    line-height: var(--klc-typography-line-height-standard);
    color: var(--klc-color-ui-text);
  }

  /* 区块只在边界留白，避免说明文字、区块 padding 与设置行 padding 叠加。 */
  .settings-body--style > :first-child {
    margin-block-end: var(--klc-spacing-sm);
    /* 与设置行共用水平内边距，保持主题面板与下方设置项对齐。 */
    padding-inline: var(--klc-spacing-sm);
  }

  /* 开源致谢的分组小标题：字体继承弹窗全局字体，仅做层级与留白。 */
  .settings-subsection-label {
    padding-block: var(--klc-spacing-sm) var(--klc-spacing-xs);
    /* 与设置行共用水平内边距，保持分组小标题与条目对齐。 */
    padding-inline: var(--klc-spacing-sm);
    font-size: var(--klc-typography-font-size-md);
    font-weight: var(--klc-typography-font-weight-bold);
    color: var(--klc-color-ui-muted);
  }

  /* 设置行仅负责布局，交互状态由具体控件提供。 */
  .settings-item {
    /* 行高包含内边距，所有分组共用相同的水平对齐与垂直节奏。 */
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-md);
    min-block-size: 40px;
    /* 左右内边距让文本与控件不贴住行的交互态背景边缘。 */
    padding: var(--klc-spacing-sm);
    border-radius: 6px;
    font: inherit;
    color: inherit;
    transition: background-color var(--klc-motion-duration-fast) ease;
  }

  .settings-item.nav-item:hover,
  .settings-item.credit-item:hover {
    background-color: var(--klc-color-ui-hover);
  }

  .settings-item.runtime-hint {
    min-block-size: auto;
    padding-block: 0 var(--klc-spacing-sm);
    font-size: var(--klc-typography-font-size-md);
    line-height: var(--klc-typography-line-height-standard);
    color: var(--klc-color-ui-muted);
  }

  .settings-item.cache-usage {
    color: var(--klc-color-ui-muted);
  }

  .cache-usage__value {
    display: inline-flex;
    align-items: center;
    gap: var(--klc-spacing-sm);
    white-space: nowrap;
  }

  .cache-clear-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 28px;
    min-block-size: 28px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    color: var(--klc-color-ui-muted);
    background: none;
    cursor: pointer;
    transition: color var(--klc-motion-duration-fast) ease;
  }

  .cache-clear-btn:hover {
    color: var(--klc-color-ui-text);
  }

  .cache-clear-btn:focus-visible,
  .settings-item.credit-item:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 2px;
  }

  .cache-clear-btn svg {
    inline-size: 16px;
    block-size: 16px;
  }

  .settings-item.credit-item {
    /* 纯文本条目用 32px 的紧凑行高，比控件行的 40px 更紧凑但不过密。 */
    min-block-size: 32px;
    padding-block: var(--klc-spacing-xs);
    cursor: pointer;
    text-decoration: none;
    /* 包名与版本号属于代码类内容，使用等宽字体。 */
    font-family: var(--klc-typography-font-family-mono);
  }

  /* 包名继承致谢条目的等宽字体，不再单独声明字体栈。 */
  .credit-name {
    min-inline-size: 0;
    font-size: var(--klc-typography-font-size-md);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .credit-version {
    flex: 0 0 auto;
    font-size: var(--klc-typography-font-size-md);
    color: var(--klc-color-ui-muted);
    white-space: nowrap;
  }

  .settings-item > span {
    min-inline-size: 0;
    line-height: var(--klc-typography-line-height-standard);
  }

  /* 导航项交互优化 */
  .settings-item.nav-item {
    cursor: pointer;
  }

  .nav-arrow {
    color: var(--klc-color-ui-muted);
    transition: transform var(--klc-motion-duration-fast) ease;
    flex-shrink: 0;
  }

  .settings-item.nav-item:hover .nav-arrow {
    transform: translateX(2px);
  }

  /* 底部按钮 */
  .footer-right {
    display: flex;
    gap: var(--klc-spacing-sm);
    justify-content: flex-end;
  }

  @media (max-width: 480px) {
    .settings-item {
      gap: var(--klc-spacing-sm);
    }

  }

  @media (prefers-reduced-motion: reduce) {
    .settings-item,
    .cache-clear-btn,
    .nav-arrow {
      transition: none;
    }
  }
</style>
