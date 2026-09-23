<template>
  <div class="color-preset-container">
    <!-- 颜色分组列表 -->
    <template v-for="group in colorPresetGroups" :key="group.group">
      <div class="color-group-label">{{ group.label }}</div>
      <div class="color-grid">
        <label v-for="item in group.items" :key="item.key" class="color-item">
          <span class="color-item-text">{{ item.label }}</span>
          <ColorInput
            :value="getColorValue(item.key)"
            :aria-label="item.label"
            @change="setColorValue(item.key, $event)"
          />
        </label>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import {
    COLOR_PRESET_ITEMS,
    type ColorPresetKey,
    type ColorPresetSettings,
    type ColorPresetThemeName,
    darkTheme,
    lightTheme,
    normalizeColorPresetSettings,
  } from '@363045841yyt/klinechart-core'
  import { computed } from 'vue'
  import ColorInput from './ColorInput.vue'

  const props = defineProps<{
    colorPresetSettings: ColorPresetSettings | undefined
    editingTheme: ColorPresetThemeName
  }>()

  const emit = defineEmits<{
    (e: 'update:colorPresetSettings', value: ColorPresetSettings): void
  }>()

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

  function getThemeDefaultColor(themeName: ColorPresetThemeName, key: ColorPresetKey): string {
    const theme = themeName === 'dark' ? darkTheme : lightTheme
    return theme.colors[key]
  }

  function getColorValue(key: ColorPresetKey): string {
    const colorSettings = normalizeColorPresetSettings(props.colorPresetSettings)
    return colorSettings[props.editingTheme]?.[key] ?? getThemeDefaultColor(props.editingTheme, key)
  }

  function setColorValue(key: ColorPresetKey, value: string): void {
    const colorSettings = normalizeColorPresetSettings(props.colorPresetSettings)
    emit('update:colorPresetSettings', {
      ...colorSettings,
      [props.editingTheme]: {
        ...colorSettings[props.editingTheme],
        [key]: value,
      },
    })
  }

  function resetCurrentThemeColors(): void {
    const colorSettings = normalizeColorPresetSettings(props.colorPresetSettings)
    const nextColorSettings = { ...colorSettings }
    delete nextColorSettings[props.editingTheme]
    emit('update:colorPresetSettings', nextColorSettings)
  }

  defineExpose({ resetCurrentThemeColors })
</script>

<style scoped>
  .color-preset-container {
    padding: 4px 0;
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
