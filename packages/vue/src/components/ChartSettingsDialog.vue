<template>
  <!-- 主弹窗 -->
  <BaseModal
    :show="show"
    width="min(92vw, 460px)"
    max-height="min(720px, calc(100vh - 48px))"
    footer-align="space-between"
    @close="closeSettings"
  >
    <template #header>
      <div class="header-left">
        <span class="settings-title">图表设置</span>
        <span class="settings-subtitle">个性化配置</span>
      </div>
    </template>

    <template #tabs>
      <BaseTabs v-model="activeSection" :tabs="settingsTabs" aria-label="图表设置" />
    </template>

    <div class="settings-body">
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
                :options="item.options"
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
                :options="item.options"
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
            <span class="credit-meta">{{ credit.version }} · {{ credit.license }}</span>
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
    :z-index="1100"
    @close="showAggregationSourceModal = false"
    @toggle="onToggleAggregationSource"
    @update-endpoint="onUpdateSourceEndpoint"
  />

  <!-- 嵌套颜色预设弹窗 -->
  <BaseModal
    :show="showColorPresetModal"
    title="颜色预设"
    subtitle="自定义图表颜色"
    width="min(92vw, 460px)"
    max-height="min(720px, calc(100vh - 48px))"
    :z-index="1100"
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
      @update:color-preset-settings="settings = { ...settings, colorPresetSettings: $event }"
    />
    <template #footer>
      <BaseButton @click="colorPresetPanelRef?.resetCurrentThemeColors()"> 重置颜色 </BaseButton>
      <BaseButton @click="showColorPresetModal = false">确认</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { normalizeColorPresetSettings } from '@363045841yyt/klinechart-core'
  import type { ColorPresetThemeName, MarketDataCacheStats } from '@363045841yyt/klinechart-core'
  import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    migrateStoredSettings,
    type ChartSettings,
    type SettingItem,
  } from '@363045841yyt/klinechart-core/config'
  import type { RendererBackendRuntime } from '@363045841yyt/klinechart-core/controllers'
  import { ref, computed, watch } from 'vue'

  import type { AggregationSourceEndpoint } from '../composables/useAggregationSources'
  import { getOpenSourceCredits } from '../credits/openSourceCredits'

  import AggregationSourceDialog from './AggregationSourceDialog.vue'
  import BaseButton from './BaseButton.vue'
  import BaseModal from './BaseModal.vue'
  import BaseTabs from './BaseTabs.vue'
  import ColorPresetPanel from './ColorPresetPanel.vue'
  import Dropdown from './Dropdown.vue'
  import ToggleSwitch from './common/ToggleSwitch.vue'

  import IconTablerTrash from '~icons/tabler/trash'

  const props = withDefaults(
    defineProps<{
      show: boolean
      initialSettings?: ChartSettings
      rendererRuntime?: RendererBackendRuntime | null
      marketDataCacheStats?: MarketDataCacheStats
      aggregationSources?: ReadonlyArray<
        import('../composables/useAggregationSources').AggregationSourceDefinition
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
  }>()

  const mainSettings = computed(
    () => DEFAULT_SETTINGS.filter((s) => s.group === 'main') as unknown as SettingItem[],
  )
  const experimentalSettings = computed(
    () => DEFAULT_SETTINGS.filter((s) => s.group === 'experimental') as unknown as SettingItem[],
  )
  const styleSettings = computed(
    () => DEFAULT_SETTINGS.filter((s) => s.group === 'style') as unknown as SettingItem[],
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

  function loadSettings(): ChartSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (saved) {
        const parsed = migrateStoredSettings(JSON.parse(saved) as Record<string, unknown>)
        const result: ChartSettings = {}
        DEFAULT_SETTINGS.forEach((item) => {
          ;(result as Record<string, unknown>)[item.key] = parsed[item.key] ?? item.default
        })
        result.colorPresetSettings = normalizeColorPresetSettings(parsed.colorPresetSettings)
        return result
      }
    } catch {}
    const defaults: ChartSettings = {}
    DEFAULT_SETTINGS.forEach((item) => {
      ;(defaults as Record<string, unknown>)[item.key] = item.default
    })
    defaults.colorPresetSettings = {}
    return defaults
  }

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

  const settings = ref<ChartSettings>(loadSettings())

  watch(
    () => props.show,
    (val) => {
      if (val) {
        settings.value = props.initialSettings ? { ...props.initialSettings } : loadSettings()
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
      ;(defaults as Record<string, unknown>)[item.key] = item.default
    })
    defaults.colorPresetSettings = {}
    settings.value = defaults
  }

  function confirmSettings() {
    emit('confirm', { ...settings.value })
  }

  function clearCache() {
    emit('clearMarketDataCache')
  }
</script>

<style scoped>
  .header-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .settings-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--klc-color-foreground);
    line-height: 1.3;
  }

  .settings-subtitle {
    font-size: 12px;
    color: var(--klc-color-axis-text);
    line-height: 1.3;
    font-weight: 400;
  }

  .settings-body {
    display: flex;
    flex-direction: column;
  }

  .settings-subsection-label {
    font-size: 11px;
    color: var(--klc-color-axis-text);
    font-weight: 500;
    padding: 8px 12px 2px;
    opacity: 0.85;
  }

  /* 扁平化列表项 */
  .settings-item {
    /* 组件库不能依赖宿主的全局 box-sizing reset，40px 包含垂直内边距。 */
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 40px;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--klc-color-foreground);
    transition: background 0.15s ease;
  }

  .settings-item:hover {
    background: var(--klc-color-tag-bg-hover);
  }

  .settings-item.runtime-hint {
    min-height: 28px;
    padding-top: 0;
    padding-bottom: 8px;
    font-size: 12px;
    color: var(--klc-color-axis-text);
    cursor: default;
  }

  .settings-item.runtime-hint:hover {
    background: transparent;
  }

  .settings-item.cache-usage {
    cursor: default;
    color: var(--klc-color-axis-text);
  }

  .settings-item.cache-usage:hover {
    background: transparent;
  }

  .cache-usage__value {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .cache-clear-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--klc-color-axis-text);
    background: none;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .cache-clear-btn:hover {
    color: var(--klc-color-foreground);
  }

  .cache-clear-btn svg {
    width: 16px;
    height: 16px;
  }

  a.settings-item.credit-item {
    cursor: pointer;
    min-height: 32px;
    padding: 6px 12px;
    text-decoration: none;
    color: inherit;
  }

  a.settings-item.credit-item:hover {
    background: var(--klc-color-tag-bg-hover);
  }

  a.settings-item.credit-item:hover .credit-name {
    color: #3b82f6;
  }

  .credit-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.15s ease;
  }

  .credit-meta {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--klc-color-axis-text);
    white-space: nowrap;
  }

  .settings-item > span {
    min-width: 0;
    line-height: 1.4;
  }

  /* 导航项交互优化 */
  .settings-item.nav-item {
    cursor: pointer;
  }

  .nav-arrow {
    color: var(--klc-color-axis-text);
    transition:
      transform 0.15s,
      color 0.15s;
    flex-shrink: 0;
  }

  .settings-item.nav-item:hover .nav-arrow {
    color: var(--klc-color-foreground);
    transform: translateX(2px);
  }

  /* 底部按钮 */
  .footer-right {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  @media (max-width: 480px) {
    .settings-item {
      gap: 8px;
    }

    .footer-right {
      display: grid;
      grid-template-columns: 1fr 1fr;
      width: 100%;
    }

    .base-button {
      width: 100%;
    }
  }
</style>
