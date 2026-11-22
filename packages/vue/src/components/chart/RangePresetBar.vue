<!-- 左下栏时间范围按钮：K 线视图可用，分时整排置灰；高亮由当前可见窗口派生。 -->
<template>
  <div class="range-presets" role="group" :aria-label="ARIA_LABEL">
    <BaseButton
      v-for="preset in RANGE_PRESETS"
      :key="preset"
      class="range-presets__item"
      size="sm"
      :disabled="disabled"
      :aria-pressed="active === preset"
      @click="apply(preset)"
    >
      {{ preset }}
    </BaseButton>
  </div>
</template>

<script setup lang="ts">
  import type { ChartController, RangePreset } from '@363045841yyt/klinechart-core/controllers'
  import { RANGE_PRESETS } from '@363045841yyt/klinechart-core/controllers'
  import type { KLinePeriod } from '@363045841yyt/klinechart-core/market-data'
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import { toRef } from 'vue'
  import { useRangePresets } from '../../composables/chart/useRangePresets.js'

  const ARIA_LABEL = '时间范围'

  const props = defineProps<{
    /** 当前图表控制器；未就绪时按钮置灰。 */
    controller: ChartController | null
    /** 当前品种支持的 K 线周期，用于挑选粒度。 */
    supportedPeriods: readonly KLinePeriod[]
  }>()

  const { active, disabled, apply } = useRangePresets(
    toRef(props, 'controller'),
    () => props.supportedPeriods,
  )
</script>

<style scoped>
  .range-presets {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--klc-space-2, 2px);
    height: 30px;
    padding: 4px var(--klc-space-8, 8px);
    /* 独立卡片下方的按钮行：不画分割线，跟随外壳底色。 */
    background: transparent;
    box-sizing: border-box;
    /* 窄屏放不下时横向滚动，不换行、不挤压 chip。 */
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .range-presets::-webkit-scrollbar {
    display: none;
  }

  /* 按钮沿用共享按钮控件，只覆盖成紧凑的胶囊外观。 */
  .range-presets__item {
    --base-button-underline: none;
    --base-button-height: 22px;
    --base-button-inline-padding: var(--klc-space-8, 8px);
    border-radius: var(--klc-radius-xs, 4px);
    font-size: var(--klc-text-11-font-size, 11px);
    font-weight: 600;
  }

  .range-presets__item[aria-pressed='true'] {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .range-presets__item[aria-pressed='true']:disabled {
    opacity: 1;
  }
</style>
