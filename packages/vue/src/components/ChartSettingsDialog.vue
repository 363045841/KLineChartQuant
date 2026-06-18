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
      <template v-if="mainSettings.length > 0">
        <div class="settings-section-divider">
          <span class="settings-section-label">主图设置</span>
        </div>
        <template v-for="item in mainSettings" :key="item.key">
          <div class="settings-item">
            <label class="settings-label">
              <span>{{ item.label }}</span>
              <template v-if="item.type === 'boolean'">
                <input
                  type="checkbox"
                  class="settings-checkbox"
                  v-model="settings[item.key]"
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
            </label>
          </div>
        </template>
      </template>

      <div class="settings-section-divider">
        <span class="settings-section-label">样式 / 颜色</span>
      </div>
      <template v-for="item in styleSettings" :key="item.key">
        <div class="settings-item">
          <label class="settings-label">
            <span>{{ item.label }}</span>
            <template v-if="item.type === 'boolean'">
              <input
                type="checkbox"
                class="settings-checkbox"
                v-model="settings[item.key]"
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
          </label>
        </div>
      </template>
      <div class="settings-item nav-item" @click="showColorPresetModal = true">
        <label class="settings-label">
          <span>颜色配置</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" class="nav-arrow">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </label>
      </div>

      <template v-if="experimentalSettings.length > 0">
        <div class="settings-section-divider">
          <span class="settings-section-label">实验性 / 调试设置</span>
        </div>
        <template v-for="item in experimentalSettings" :key="item.key">
          <div class="settings-item experimental">
            <label class="settings-label">
              <span>{{ item.label }}</span>
              <template v-if="item.type === 'boolean'">
                <input
                  type="checkbox"
                  class="settings-checkbox"
                  v-model="settings[item.key]"
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
            </label>
          </div>
        </template>
      </template>
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
    @close="showColorPresetModal = false"
  >
    <ColorPresetPanel
      :color-preset-settings="settings.colorPresetSettings"
      @update:color-preset-settings="
        settings = { ...settings, colorPresetSettings: $event }
      "
    />
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type ChartSettings,
  type SettingItem,
} from '@363045841yyt/klinechart-core/config'
import { normalizeColorPresetSettings } from '@363045841yyt/klinechart-core'
import BaseModal from './BaseModal.vue'
import ColorPresetPanel from './ColorPresetPanel.vue'
import Dropdown from './Dropdown.vue'

const props = defineProps<{
  show: boolean
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

const showColorPresetModal = ref(false)

function loadSettings(): ChartSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      const result: ChartSettings = {}
      DEFAULT_SETTINGS.forEach((item) => {
        result[item.key] = parsed[item.key] ?? item.default
      })
      result.colorPresetSettings = normalizeColorPresetSettings(parsed.colorPresetSettings)
      return result
    }
  } catch {}
  const defaults: ChartSettings = {}
  DEFAULT_SETTINGS.forEach((item) => {
    defaults[item.key] = item.default
  })
  defaults.colorPresetSettings = {}
  return defaults
}

const settings = ref<ChartSettings>(loadSettings())

watch(
  () => props.show,
  (val) => {
    if (val) {
      settings.value = loadSettings()
    }
  },
)

function closeSettings() {
  emit('close')
}

function resetSettings() {
  const defaults: ChartSettings = {}
  DEFAULT_SETTINGS.forEach((item) => {
    defaults[item.key] = item.default
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
  font-size: 15px;
  font-weight: 600;
  color: var(--klc-color-foreground);
  line-height: 1.35;
}

.settings-subtitle {
  font-size: 11px;
  color: var(--klc-color-axis-text);
  line-height: 1.3;
}

.settings-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-item {
  padding: 0;
  border-radius: 8px;
  background: var(--klc-color-background);
  border: 1px solid var(--klc-color-grid-major);
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.settings-item:hover {
  border-color: var(--klc-color-axis-line);
  background: var(--klc-color-background);
}

.settings-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 42px;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--klc-color-foreground);
  cursor: pointer;
}

.settings-label > span {
  min-width: 0;
  line-height: 1.35;
}

.settings-checkbox {
  flex: 0 0 auto;
  width: 17px;
  height: 17px;
  cursor: pointer;
  accent-color: var(--klc-color-foreground);
}

.settings-section-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 2px;
}

.settings-section-divider:first-child {
  margin-top: 0;
}

.settings-section-divider::before,
.settings-section-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--klc-color-border-button);
}

.settings-section-label {
  font-size: 11px;
  color: var(--klc-color-axis-text);
  white-space: nowrap;
  line-height: 1;
}

.settings-item.nav-item {
  cursor: pointer;
}

.settings-item.nav-item:hover .nav-arrow {
  color: var(--klc-color-foreground);
}

.nav-arrow {
  color: var(--klc-color-axis-text);
  transition: color 0.15s;
  flex-shrink: 0;
}

.footer-right {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 68px;
  height: 32px;
  padding: 0 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
  line-height: 1;
  white-space: nowrap;
}

.settings-btn svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.settings-btn.reset {
  background: transparent;
  border-color: var(--klc-color-axis-line);
  color: var(--klc-color-axis-text);
  min-width: 76px;
}

.settings-btn.reset:hover {
  border-color: #c0392b;
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.08);
}

.settings-btn.cancel {
  background: transparent;
  border-color: var(--klc-color-axis-line);
  color: var(--klc-color-axis-text);
}

.settings-btn.cancel:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-text);
}

.settings-btn.confirm {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  color: var(--klc-color-background);
}

.settings-btn.confirm:hover {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.settings-btn.confirm:active {
  transform: translateY(0);
  box-shadow: none;
}

@media (max-width: 480px) {
  .settings-label {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .settings-checkbox {
    align-self: flex-end;
    margin-top: -26px;
  }

  .footer-right {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .settings-btn {
    width: 100%;
  }
}
</style>
