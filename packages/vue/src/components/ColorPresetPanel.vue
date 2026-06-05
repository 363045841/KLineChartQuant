<template>
  <div>
    <div class="color-preset-tools">
      <div class="theme-tabs" role="tablist" aria-label="颜色主题">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          type="button"
          class="theme-tab"
          :class="{ active: editingTheme === option.value }"
          @click="editingTheme = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <button type="button" class="color-reset-btn" @click="resetCurrentThemeColors">
        重置颜色
      </button>
    </div>
    <template v-for="group in colorPresetGroups" :key="group.group">
      <div class="color-group-label">{{ group.label }}</div>
      <div class="color-grid">
        <label v-for="item in group.items" :key="item.key" class="color-item">
          <span>{{ item.label }}</span>
          <input
            type="color"
            class="color-input"
            :value="getColorValue(item.key)"
            @input="setColorValue(item.key, ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  COLOR_PRESET_ITEMS,
  darkTheme,
  lightTheme,
  normalizeColorPresetSettings,
  type ColorPresetKey,
  type ColorPresetThemeName,
  type ColorPresetSettings,
} from '@363045841yyt/klinechart-core'

const props = defineProps<{
  colorPresetSettings: ColorPresetSettings | undefined
}>()

const emit = defineEmits<{
  (e: 'update:colorPresetSettings', value: ColorPresetSettings): void
}>()

const themeOptions: readonly { value: ColorPresetThemeName; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

const colorGroupLabels = {
  canvas: '画布',
  candle: 'K线 / 成交量',
  axis: '坐标轴',
  interaction: '交互 / 标记',
} as const

const colorPresetGroups = computed(() => {
  return (Object.keys(colorGroupLabels) as Array<keyof typeof colorGroupLabels>)
    .map((group) => ({
      group,
      label: colorGroupLabels[group],
      items: COLOR_PRESET_ITEMS.filter((item) => item.group === group),
    }))
    .filter((group) => group.items.length > 0)
})

const editingTheme = ref<ColorPresetThemeName>('light')

function getThemeDefaultColor(themeName: ColorPresetThemeName, key: ColorPresetKey): string {
  const theme = themeName === 'dark' ? darkTheme : lightTheme
  return theme.colors[key]
}

function getColorValue(key: ColorPresetKey): string {
  const colorSettings = normalizeColorPresetSettings(props.colorPresetSettings)
  return colorSettings[editingTheme.value]?.[key] ?? getThemeDefaultColor(editingTheme.value, key)
}

function setColorValue(key: ColorPresetKey, value: string): void {
  const colorSettings = normalizeColorPresetSettings(props.colorPresetSettings)
  emit('update:colorPresetSettings', {
    ...colorSettings,
    [editingTheme.value]: {
      ...colorSettings[editingTheme.value],
      [key]: value,
    },
  })
}

function resetCurrentThemeColors(): void {
  const colorSettings = normalizeColorPresetSettings(props.colorPresetSettings)
  const nextColorSettings = { ...colorSettings }
  delete nextColorSettings[editingTheme.value]
  emit('update:colorPresetSettings', nextColorSettings)
}
</script>

<style scoped>
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
  border-top: 1px solid #e0e0e0;
}

.settings-section-label {
  font-size: 11px;
  color: #999;
  white-space: nowrap;
  line-height: 1;
}

.color-preset-tools {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}

.theme-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #f3f4f6;
}

.theme-tab {
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #666;
  font-size: 12px;
  cursor: pointer;
}

.theme-tab.active {
  background: #fff;
  color: #1a1a1a;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.color-reset-btn {
  height: 36px;
  padding: 0 12px;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  background: #fff;
  color: #555;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.color-reset-btn:hover {
  border-color: #9ca3af;
  background: #f8f8f8;
  color: #1a1a1a;
}

.color-group-label {
  margin-top: 8px;
  color: #666;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.color-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  padding: 7px 9px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  background: #f8f8f8;
  color: #333;
  font-size: 12px;
  line-height: 1.3;
}

.color-item span {
  min-width: 0;
}

.color-input {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.color-input::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.color-input::-webkit-color-swatch {
  border: 0;
  border-radius: 4px;
}

@media (max-width: 480px) {
  .color-preset-tools {
    grid-template-columns: 1fr;
  }

  .color-reset-btn {
    width: 100%;
  }

  .color-grid {
    grid-template-columns: 1fr;
  }
}
</style>
