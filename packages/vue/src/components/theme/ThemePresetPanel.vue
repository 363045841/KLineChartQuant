<!-- 五种独立视觉风格，卡片和实际图表共用 Core Token。 -->
<template>
  <section class="theme-presets" aria-label="主题预设">
    <div class="theme-presets__heading">
      <span>主题预设</span>
      <slot name="actions" />
    </div>
    <div class="theme-presets__grid">
      <button
        v-for="preset in presets"
        :key="preset.id"
        type="button"
        class="theme-preset"
        :style="preset.style"
        :aria-pressed="isSelected(preset)"
        @click="selectPreset(preset)"
      >
        <span class="theme-preset__sample" aria-hidden="true">
          <span class="theme-preset__accent"></span>
          <span class="theme-preset__line"></span>
          <span class="theme-preset__choose">
            <IconTablerCheck v-if="isSelected(preset)" />
          </span>
        </span>
        <strong>{{ preset.label }}</strong>
      </button>
    </div>
    <p class="theme-presets__hint">风格只调整配色，不改变明暗模式、涨跌习惯与界面尺寸，已有自定义颜色优先。点击即生效并保存。</p>
  </section>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import { useThemePresets } from '@vue-src/composables/theme/useThemePresets.js'
  import IconTablerCheck from '~icons/tabler/check'

  const props = defineProps<{
    settings: ChartSettings
    /** 当前已生效的明暗模式；未确认的 settings.theme 草稿不能影响卡片配色。 */
    effectiveTheme: 'light' | 'dark'
  }>()
  const emit = defineEmits<{ 'update:settings': [settings: ChartSettings] }>()
  const { presets, isSelected, selectPreset } = useThemePresets(
    () => props.settings,
    (settings) => emit('update:settings', settings),
    () => props.effectiveTheme,
  )
</script>

<style scoped>
  .theme-presets {
    display: flex;
    flex-direction: column;
    gap: var(--klc-spacing-md);
    min-inline-size: 0;
    /* 正文贴边：网格容器持有弹窗 inset，卡片保持自己的尺寸与间距。 */
    padding-inline: var(--base-modal-content-inset);
  }

  .theme-presets__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-sm);
    min-block-size: 32px;
    font-size: var(--klc-typography-font-size-md);
    font-weight: var(--klc-typography-font-weight-bold);
    color: var(--klc-color-ui-text);
  }

  .theme-presets__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--klc-spacing-sm);
  }

  .theme-preset {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--klc-spacing-sm);
    min-inline-size: 0;
    padding: var(--klc-spacing-md);
    border: 0;
    border-radius: 8px;
    background: var(--preset-background);
    color: var(--preset-text);
    text-align: left;
    cursor: pointer;
    font: inherit;
    line-height: var(--klc-typography-line-height-standard);
  }

  /* 选中态只靠勾选标记区分；键盘聚焦保留无障碍焦点环。 */
  .theme-preset:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 3px;
  }

  .theme-preset strong {
    font-size: var(--klc-typography-font-size-md);
  }

  .theme-preset__sample {
    display: flex;
    align-items: center;
    gap: var(--klc-spacing-sm);
    block-size: var(--klc-spacing-xl);
    font-size: var(--klc-typography-font-size-md);
    font-weight: var(--klc-typography-font-weight-bold);
  }

  .theme-preset__accent {
    inline-size: var(--klc-spacing-xl);
    block-size: var(--klc-spacing-lg);
    border-radius: 4px;
    background: var(--preset-accent);
  }

  .theme-preset__line {
    inline-size: var(--klc-spacing-xxl);
    block-size: 2px;
    background: var(--preset-indicator);
  }

  .theme-preset__choose {
    display: inline-flex;
    margin-inline-start: auto;
    color: var(--preset-accent);
  }

  .theme-preset__choose svg {
    inline-size: var(--klc-spacing-lg);
    block-size: var(--klc-spacing-lg);
  }

  .theme-presets__hint {
    margin: 0;
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-typography-font-size-sm);
    line-height: var(--klc-typography-line-height-standard);
  }
</style>
