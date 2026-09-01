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

    <div class="settings-body">
      <CollapsibleSection
        v-if="mainSettings.length > 0"
        label="主图设置"
        :expanded="expandedSections.main"
        @toggle="toggleSection('main')"
      >
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
      </CollapsibleSection>

      <CollapsibleSection
        label="行情缓存"
        :expanded="expandedSections.cache"
        @toggle="toggleSection('cache')"
      >
        <div class="settings-item">
          <label for="market-data-cache-max-mib">缓存上限</label>
          <input
            id="market-data-cache-max-mib"
            v-model.number="settings.marketDataCacheMaxMiB"
            class="cache-limit-input"
            type="number"
            min="5"
            max="512"
            step="1"
          />
          <span class="cache-unit">MiB</span>
        </div>
        <div class="settings-item cache-usage">
          <span>当前用量（估算）</span>
          <span>{{ cacheUsageText }}</span>
        </div>
        <div class="cache-description">超过上限时，自动淘汰最久未使用的行情数据。</div>
      </CollapsibleSection>

      <!-- 聚合源入口：主图设置下方，与颜色配置同为 nav-item -->
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

      <CollapsibleSection
        label="样式 / 颜色"
        :expanded="expandedSections.style"
        @toggle="toggleSection('style')"
      >
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
      </CollapsibleSection>

      <CollapsibleSection
        v-if="experimentalSettings.length > 0"
        label="实验性 / 调试设置"
        :expanded="expandedSections.experimental"
        @toggle="toggleSection('experimental')"
      >
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
      </CollapsibleSection>

      <CollapsibleSection
        label="开源致谢"
        :expanded="expandedSections.opensource"
        @toggle="toggleSection('opensource')"
      >
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
      </CollapsibleSection>
    </div>

    <template #footer>
      <button class="settings-btn reset" @click="resetSettings">重置</button>
      <div class="footer-right">
        <button class="settings-btn cancel" @click="closeSettings">取消</button>
        <button class="settings-btn confirm" @click="confirmSettings">确定</button>
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
    <ColorPresetPanel
      ref="colorPresetPanelRef"
      :color-preset-settings="settings.colorPresetSettings"
      @update:color-preset-settings="settings = { ...settings, colorPresetSettings: $event }"
    />
    <template #footer>
      <button
        type="button"
        class="settings-btn reset"
        @click="colorPresetPanelRef?.resetCurrentThemeColors()"
      >
        重置颜色
      </button>
      <button type="button" class="settings-btn confirm" @click="showColorPresetModal = false">
        确认
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { normalizeColorPresetSettings } from '@363045841yyt/klinechart-core'
  import type { MarketDataCacheStats } from '@363045841yyt/klinechart-core'
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
  import BaseModal from './BaseModal.vue'
  import ColorPresetPanel from './ColorPresetPanel.vue'
  import CollapsibleSection from './common/CollapsibleSection.vue'
  import Dropdown from './Dropdown.vue'
  import ToggleSwitch from './common/ToggleSwitch.vue'

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
  const openSourceCredits = getOpenSourceCredits()

  type SettingsSectionId = 'main' | 'style' | 'experimental' | 'cache' | 'opensource'

  /** 主图+样式默认展开；实验+开源默认折叠。不持久化，每次打开弹窗重置 */
  function createDefaultExpandedSections(): Record<SettingsSectionId, boolean> {
    return {
      main: true,
      style: true,
      experimental: false,
      cache: false,
      opensource: false,
    }
  }

  const expandedSections = ref(createDefaultExpandedSections())
  const showAggregationSourceModal = ref(false)
  const showColorPresetModal = ref(false)

  function toggleSection(id: SettingsSectionId) {
    expandedSections.value = {
      ...expandedSections.value,
      [id]: !expandedSections.value[id],
    }
  }

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
        expandedSections.value = createDefaultExpandedSections()
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

  .cache-limit-input {
    width: 80px;
    box-sizing: border-box;
    border: 1px solid var(--klc-color-border);
    border-radius: 4px;
    padding: 4px 6px;
    color: var(--klc-color-foreground);
    background: var(--klc-color-chart-background);
    text-align: right;
  }

  .cache-unit {
    margin-left: -10px;
    color: var(--klc-color-axis-text);
    font-size: 12px;
  }

  .settings-item.cache-usage {
    cursor: default;
    color: var(--klc-color-axis-text);
  }

  .settings-item.cache-usage:hover {
    background: transparent;
  }

  .cache-description {
    padding: 0 12px 8px;
    color: var(--klc-color-axis-text);
    font-size: 12px;
    line-height: 1.5;
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

  .settings-btn {
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
    transition: all 0.15s ease;
    line-height: 1;
    white-space: nowrap;
  }

  .settings-btn svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }

  .settings-btn.reset {
    background: color-mix(in srgb, var(--klc-color-chart-background) 92%, var(--klc-color-foreground));
    color: var(--klc-color-axis-text);
  }

  .settings-btn.reset:hover {
    color: #f0a020;
    background: rgba(240, 160, 32, 0.08);
  }

  .settings-btn.cancel {
    background: color-mix(in srgb, var(--klc-color-chart-background) 92%, var(--klc-color-foreground));
    color: var(--klc-color-foreground);
  }

  .settings-btn.cancel:hover {
    background: color-mix(in srgb, var(--klc-color-chart-background) 86%, var(--klc-color-foreground));
  }

  .settings-btn.confirm {
    background: color-mix(in srgb, var(--klc-color-foreground) 80%, var(--klc-color-chart-background));
    color: var(--klc-color-background);
  }

  .settings-btn.confirm:hover {
    opacity: 0.9;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .settings-btn.confirm:active {
    transform: scale(0.98);
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

    .settings-btn {
      width: 100%;
    }
  }
</style>
