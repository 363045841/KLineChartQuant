<template>
  <Teleport :to="teleportTarget">
    <Transition name="overlay">
      <div v-if="show" class="settings-overlay" @click="closeSettings">
        <Transition name="modal">
          <div class="settings-modal" @click.stop>
            <div class="settings-header">
              <div class="header-left">
                <span class="settings-title">图表设置</span>
                <span class="settings-subtitle">个性化配置</span>
              </div>
              <div class="header-right">
                <button class="settings-close" @click="closeSettings">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

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
                        <select class="settings-select" v-model="settings[item.key]">
                          <option v-for="opt in item.options" :key="opt.value" :value="opt.value">
                            {{ opt.label }}
                          </option>
                        </select>
                      </template>
                    </label>
                  </div>
                </template>
              </template>

              <div class="settings-section-divider">
                <span class="settings-section-label">样式 / 颜色</span>
              </div>
              <div class="settings-item nav-item" @click="showColorPresetModal = true">
                <label class="settings-label">
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
                        <select class="settings-select" v-model="settings[item.key]">
                          <option v-for="opt in item.options" :key="opt.value" :value="opt.value">
                            {{ opt.label }}
                          </option>
                        </select>
                      </template>
                    </label>
                  </div>
                </template>
              </template>
            </div>

            <div class="settings-footer">
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
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <Transition name="overlay">
      <div
        v-if="showColorPresetModal"
        class="settings-overlay nested-overlay"
        @click="showColorPresetModal = false"
      >
        <Transition name="modal">
          <div class="settings-modal" @click.stop>
            <div class="settings-header">
              <div class="header-left">
                <span class="settings-title">颜色预设</span>
                <span class="settings-subtitle">自定义图表颜色</span>
              </div>
              <div class="header-right">
                <button class="settings-close" @click="showColorPresetModal = false">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="settings-body">
              <ColorPresetPanel
                :color-preset-settings="settings.colorPresetSettings"
                @update:color-preset-settings="
                  settings = { ...settings, colorPresetSettings: $event }
                "
              />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
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
import ColorPresetPanel from './ColorPresetPanel.vue'
import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', settings: ChartSettings): void
}>()

const teleportTarget = useFullscreenTeleportTarget()

const mainSettings = computed(
  () => DEFAULT_SETTINGS.filter((s) => s.group === 'main') as unknown as SettingItem[],
)
const experimentalSettings = computed(
  () => DEFAULT_SETTINGS.filter((s) => s.group === 'experimental') as unknown as SettingItem[],
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
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-modal {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.15);
  min-width: 360px;
  max-width: 460px;
  width: min(92vw, 460px);
  max-height: min(720px, calc(100vh - 48px));
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px 14px 20px;
  background: var(--klc-color-background);
  border-bottom: 1px solid var(--klc-color-grid-major);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
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

.settings-close {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 7px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--klc-color-axis-text);
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
  padding: 0;
}

.settings-close:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-line);
}

.settings-close svg {
  width: 14px;
  height: 14px;
}

.settings-body {
  padding: 16px 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.settings-body::-webkit-scrollbar {
  width: 8px;
}

.settings-body::-webkit-scrollbar-thumb {
  background: var(--klc-color-axis-line);
  border: 2px solid var(--klc-color-tag-bg-white);
  border-radius: 999px;
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
  background: var(--klc-color-tag-bg-white);
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

.settings-select {
  flex: 0 0 auto;
  height: 30px;
  padding: 4px 28px 4px 9px;
  border: 1px solid var(--klc-color-axis-line);
  border-radius: 6px;
  background: var(--klc-color-tag-bg-white);
  color: var(--klc-color-foreground);
  font-size: 12px;
  cursor: pointer;
  outline: none;
  min-width: 150px;
  max-width: 190px;
}

.settings-select:hover {
  border-color: var(--klc-color-axis-text);
}

.settings-select:focus {
  border-color: var(--klc-color-axis-text);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-axis-text) 15%, transparent);
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

.nested-overlay {
  z-index: 1100;
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

.settings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  background: var(--klc-color-background);
  border-top: 1px solid var(--klc-color-grid-major);
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

.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

.modal-enter-active {
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active {
  transition: all 0.16s ease-in;
}

.modal-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(-10px);
}

.modal-leave-to {
  opacity: 0;
  transform: scale(0.98) translateY(8px);
}

@media (max-width: 480px) {
  .settings-overlay {
    padding: 12px;
    align-items: flex-end;
  }

  .settings-modal {
    min-width: 0;
    width: 100%;
    max-height: calc(100vh - 24px);
    border-radius: 10px;
  }

  .settings-header,
  .settings-body,
  .settings-footer {
    padding-left: 16px;
    padding-right: 16px;
  }

  .settings-label {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .settings-checkbox {
    align-self: flex-end;
    margin-top: -26px;
  }

  .settings-select {
    width: 100%;
    max-width: none;
  }

  .settings-footer {
    align-items: stretch;
    flex-direction: column-reverse;
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
