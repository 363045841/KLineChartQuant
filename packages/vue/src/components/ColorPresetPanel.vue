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
/* ── 工具栏 ── */
.color-preset-tools {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

/* ── 主题切换 ── */
.theme-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 8px;
  background: var(--klc-color-grid-minor);
}

.theme-tab {
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--klc-color-axis-text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.theme-tab:not(.active):hover {
  color: var(--klc-color-foreground);
  background: color-mix(in srgb, var(--klc-color-tag-bg-white) 60%, transparent);
}

.theme-tab.active {
  background: var(--klc-color-tag-bg-white);
  color: var(--klc-color-foreground);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

/* ── 重置按钮 ── */
.color-reset-btn {
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--klc-color-axis-line);
  border-radius: 8px;
  background: var(--klc-color-tag-bg-white);
  color: var(--klc-color-axis-text);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.color-reset-btn:hover {
  border-color: var(--klc-color-axis-text);
  background: var(--klc-color-background);
  color: var(--klc-color-foreground);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.color-reset-btn:active {
  background: var(--klc-color-tag-bg-hover);
  box-shadow: none;
}

/* ── 分组标签 ── */
.color-group-label {
  margin: 6px 0 6px;
  color: var(--klc-color-axis-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

/* ── 颜色网格 ── */
.color-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

/* ── 颜色条目 ── */
.color-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid var(--klc-color-grid-major);
  border-radius: 8px;
  background: var(--klc-color-background);
  color: var(--klc-color-foreground);
  font-size: 12px;
  line-height: 1.3;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.color-item:hover {
  border-color: var(--klc-color-axis-line);
  background: var(--klc-color-tag-bg-hover);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--klc-color-foreground) 6%, transparent);
}

.color-item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}

/* ── 颜色输入 ── */
.color-input {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--klc-color-axis-line);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.color-input:hover {
  border-color: var(--klc-color-axis-text);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-foreground) 6%, transparent);
}

.color-input:focus-visible {
  outline: none;
  border-color: var(--klc-color-axis-text);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-foreground) 10%, transparent);
}

.color-input::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.color-input::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
}

/* ── 响应式 ── */
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
