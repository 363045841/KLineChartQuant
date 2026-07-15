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
      <section v-if="mainSettings.length > 0" class="settings-section">
        <button
          type="button"
          class="settings-section-header"
          :aria-expanded="expandedSections.main"
          @click="toggleSection('main')"
        >
          <span class="settings-section-label">主图设置</span>
          <svg
            class="section-chevron"
            :class="{ expanded: expandedSections.main }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <div v-show="expandedSections.main" class="settings-section-body">
          <template v-for="item in mainSettings" :key="item.key">
            <div class="settings-item">
              <span>{{ item.label }}</span>
              <template v-if="item.type === 'boolean'">
                <label class="md-switch">
                  <input v-model="settings[item.key]" type="checkbox" />
                  <span class="md-switch-slider"></span>
                </label>
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
        </div>
      </section>

      <section class="settings-section">
        <button
          type="button"
          class="settings-section-header"
          :aria-expanded="expandedSections.style"
          @click="toggleSection('style')"
        >
          <span class="settings-section-label">样式 / 颜色</span>
          <svg
            class="section-chevron"
            :class="{ expanded: expandedSections.style }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <div v-show="expandedSections.style" class="settings-section-body">
          <template v-for="item in styleSettings" :key="item.key">
            <div class="settings-item">
              <span>{{ item.label }}</span>
              <template v-if="item.type === 'boolean'">
                <label class="md-switch">
                  <input v-model="settings[item.key]" type="checkbox" />
                  <span class="md-switch-slider"></span>
                </label>
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
        </div>
      </section>

      <section v-if="experimentalSettings.length > 0" class="settings-section">
        <button
          type="button"
          class="settings-section-header"
          :aria-expanded="expandedSections.experimental"
          @click="toggleSection('experimental')"
        >
          <span class="settings-section-label">实验性 / 调试设置</span>
          <svg
            class="section-chevron"
            :class="{ expanded: expandedSections.experimental }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <div v-show="expandedSections.experimental" class="settings-section-body">
          <template v-for="item in experimentalSettings" :key="item.key">
            <div class="settings-item experimental">
              <span>{{ item.label }}</span>
              <template v-if="item.type === 'boolean'">
                <label class="md-switch">
                  <input v-model="settings[item.key]" type="checkbox" />
                  <span class="md-switch-slider"></span>
                </label>
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
        </div>
      </section>

      <section class="settings-section">
        <button
          type="button"
          class="settings-section-header"
          :aria-expanded="expandedSections.opensource"
          @click="toggleSection('opensource')"
        >
          <span class="settings-section-label">开源致谢</span>
          <svg
            class="section-chevron"
            :class="{ expanded: expandedSections.opensource }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <div v-show="expandedSections.opensource" class="settings-section-body">
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
        </div>
      </section>
    </div>

    <template #footer>
      <button class="settings-btn reset" @click="resetSettings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        重置
      </button>
      <div class="footer-right">
        <button class="settings-btn cancel" @click="closeSettings">取消</button>
        <button class="settings-btn confirm" @click="confirmSettings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          确定
        </button>
      </div>
    </template>
  </BaseModal>

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
  import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    type ChartSettings,
    type SettingItem,
  } from '@363045841yyt/klinechart-core/config'
  import { ref, computed, watch } from 'vue'

  import { getOpenSourceCredits } from '../credits/openSourceCredits'

  import BaseModal from './BaseModal.vue'
  import ColorPresetPanel from './ColorPresetPanel.vue'
  import Dropdown from './Dropdown.vue'

  const props = defineProps<{
    show: boolean
    initialSettings?: ChartSettings
  }>()

  const emit = defineEmits<{
    (e: 'close'): void
    (e: 'confirm', settings: ChartSettings): void
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

  type SettingsSectionId = 'main' | 'style' | 'experimental' | 'opensource'

  /** 主图+样式默认展开；实验+开源默认折叠。不持久化，每次打开弹窗重置 */
  function createDefaultExpandedSections(): Record<SettingsSectionId, boolean> {
    return {
      main: true,
      style: true,
      experimental: false,
      opensource: false,
    }
  }

  const expandedSections = ref(createDefaultExpandedSections())

  function toggleSection(id: SettingsSectionId) {
    expandedSections.value = {
      ...expandedSections.value,
      [id]: !expandedSections.value[id],
    }
  }

  const showColorPresetModal = ref(false)
  const colorPresetPanelRef = ref<InstanceType<typeof ColorPresetPanel> | null>(null)

  function loadSettings(): ChartSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
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

  .settings-section {
    display: flex;
    flex-direction: column;
  }

  .settings-section + .settings-section {
    margin-top: 4px;
  }

  .settings-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 36px;
    margin: 0;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .settings-section-header:hover {
    background: var(--klc-color-tag-bg-hover);
  }

  .settings-section-label {
    font-size: 12px;
    color: var(--klc-color-axis-text);
    font-weight: 500;
    white-space: nowrap;
    line-height: 1;
    letter-spacing: 0.3px;
  }

  .section-chevron {
    flex-shrink: 0;
    color: var(--klc-color-axis-text);
    transform: rotate(0deg);
    transition: transform 0.15s ease, color 0.15s ease;
  }

  .section-chevron.expanded {
    transform: rotate(90deg);
  }

  .settings-section-header:hover .section-chevron {
    color: var(--klc-color-foreground);
  }

  .settings-section-body {
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

  /* Material Design 风格开关 */
  .md-switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    flex: 0 0 auto;
    margin: 0;
  }

  .md-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .md-switch-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(128, 128, 128, 0.4);
    transition: 0.3s;
    border-radius: 20px;
  }

  .md-switch-slider::before {
    position: absolute;
    content: '';
    height: 16px;
    width: 16px;
    left: 2px;
    bottom: 2px;
    background-color: #e0e0e0;
    transition: 0.3s;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .md-switch input:checked + .md-switch-slider {
    background-color: #3b82f6;
    opacity: 1;
  }

  .md-switch input:checked + .md-switch-slider::before {
    transform: translateX(16px);
    background-color: #ffffff;
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
    border: 1px solid transparent;
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
    background: transparent;
    border-color: var(--klc-color-border-button);
    color: var(--klc-color-axis-text);
  }

  .settings-btn.reset:hover {
    border-color: #f0a020;
    color: #f0a020;
    background: rgba(240, 160, 32, 0.08);
  }

  .settings-btn.cancel {
    background: transparent;
    border-color: var(--klc-color-border-button);
    color: var(--klc-color-foreground);
  }

  .settings-btn.cancel:hover {
    background: var(--klc-color-grid-minor);
    border-color: var(--klc-color-axis-line);
  }

  .settings-btn.confirm {
    background: var(--klc-color-foreground);
    border-color: var(--klc-color-foreground);
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
