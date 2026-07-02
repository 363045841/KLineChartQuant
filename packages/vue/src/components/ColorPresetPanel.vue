<template>
  <div class="color-preset-container">
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

    <!-- 颜色分组列表 -->
    <template v-for="group in colorPresetGroups" :key="group.group">
      <div class="color-group-label">{{ group.label }}</div>
      <div class="color-grid">
        <label v-for="item in group.items" :key="item.key" class="color-item">
          <span class="color-item-text">{{ item.label }}</span>
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
  import {
    COLOR_PRESET_ITEMS,
    darkTheme,
    lightTheme,
    normalizeColorPresetSettings,
    type ColorPresetKey,
    type ColorPresetThemeName,
    type ColorPresetSettings,
  } from '@363045841yyt/klinechart-core'
  import { ref, computed } from 'vue'

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

  defineExpose({ resetCurrentThemeColors })
</script>

<style scoped>
  .color-preset-container {
    padding: 4px 0;
  }

  .theme-tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    margin-bottom: 12px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 8px;
    background: var(--klc-color-grid-minor);
  }

  .theme-tab {
    flex: 1;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--klc-color-axis-text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.18s ease;
    white-space: nowrap;
  }

  .theme-tab:not(.active):hover {
    color: var(--klc-color-foreground);
    background: color-mix(in srgb, var(--klc-color-background) 60%, transparent);
  }

  .theme-tab.active {
    color: var(--klc-color-foreground);
    font-weight: 600;
  }

  /* ── 分组标签 ── */
  .color-group-label {
    margin: 18px 0 6px;
    color: var(--klc-color-axis-text);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.3px;
    line-height: 1;
  }

  .color-group-label:first-of-type {
    margin-top: 0;
  }

  /* ── 颜色网格 ── */
  .color-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }

  /* ── 颜色条目 (扁平化样式) ── */
  .color-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 40px;
    padding: 8px 12px;
    border-radius: 6px;
    background: transparent;
    color: var(--klc-color-foreground);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .color-item:hover {
    background: var(--klc-color-grid-minor);
  }

  .color-item-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: none;
    line-height: 1.4;
  }

  /* ── 颜色输入 (无边框圆角矩形) ── */
  .color-input {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    transition: transform 0.15s ease;
    overflow: hidden;
  }

  .color-input:hover {
    transform: scale(1.1);
  }

  .color-input::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .color-input::-webkit-color-swatch {
    border: none;
    border-radius: 6px;
  }

  .color-input::-moz-color-swatch {
    border: none;
    border-radius: 6px;
  }

  /* ── 响应式 ── */
  @media (max-width: 480px) {
    .color-preset-tools {
      flex-direction: column;
      align-items: stretch;
    }

    .color-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
