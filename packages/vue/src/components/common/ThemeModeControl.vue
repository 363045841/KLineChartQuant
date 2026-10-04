<!-- 明暗模式图标单选组：胶囊容器提供自动、白天、夜间选择，并保留原生键盘操作。 -->
<template>
  <div class="theme-mode" role="radiogroup" :aria-label="label">
    <span
      class="theme-mode__thumb"
      aria-hidden="true"
      :style="{ '--theme-mode-index': activeIndex }"
    ></span>
    <label
      v-for="option in themeModes"
      :key="option.value"
      class="theme-mode__option"
      :title="option.label"
    >
      <input
        class="theme-mode__input"
        type="radio"
        :name="groupName"
        :value="option.value"
        :checked="modelValue === option.value"
        :aria-label="option.label"
        @change="emit('update:modelValue', option.value)"
      />
      <span class="theme-mode__surface">
        <component :is="option.icon" class="theme-mode__icon" aria-hidden="true" />
      </span>
    </label>
  </div>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import { computed, useId } from 'vue'
  import IconTablerDeviceDesktop from '~icons/tabler/device-desktop'
  import IconTablerMoon from '~icons/tabler/moon'
  import IconTablerSun from '~icons/tabler/sun'

  const props = defineProps<{ modelValue: ChartSettings['theme']; label: string }>()
  const emit = defineEmits<{ 'update:modelValue': [value: ChartSettings['theme']] }>()
  const groupName = useId()
  const themeModes = [
    { value: 'auto', label: '自动（跟随系统）', icon: IconTablerDeviceDesktop },
    { value: 'light', label: '白天', icon: IconTablerSun },
    { value: 'dark', label: '夜间', icon: IconTablerMoon },
  ] satisfies ReadonlyArray<{
    value: ChartSettings['theme']
    label: string
    icon: typeof IconTablerSun
  }>

  /** 当前选中项序号，滑块据此平移；无匹配时回退到首项。 */
  const activeIndex = computed(() => {
    const index = themeModes.findIndex((option) => option.value === props.modelValue)
    return index < 0 ? 0 : index
  })
</script>

<style scoped>
  .theme-mode {
    --theme-mode-scale: 0.75;
    --theme-mode-size: calc(32px * var(--theme-mode-scale));
    --theme-mode-gap: calc(var(--klc-spacing-xs) * var(--theme-mode-scale));
    --theme-mode-padding: calc(var(--klc-spacing-xs) * var(--theme-mode-scale));

    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    gap: var(--theme-mode-gap);
    padding: var(--theme-mode-padding);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 999px;
    background-color: var(--klc-color-ui-surface);
  }

  /* 选中滑块：切换时平移到目标选项，形成连续的位移动画。 */
  .theme-mode__thumb {
    position: absolute;
    inset-block-start: var(--theme-mode-padding);
    inset-inline-start: var(--theme-mode-padding);
    inline-size: var(--theme-mode-size);
    block-size: var(--theme-mode-size);
    border-radius: 50%;
    background-color: var(--klc-color-ui-hover);
    transform: translateX(
      calc(var(--theme-mode-index, 0) * (var(--theme-mode-size) + var(--theme-mode-gap)))
    );
    transition: transform var(--klc-motion-duration-moderate) var(--klc-motion-easing-decelerate);
    pointer-events: none;
  }

  .theme-mode__option {
    position: relative;
    display: grid;
    cursor: pointer;
  }

  /* 输入覆盖完整点击区域，透明隐藏外观仍保留原生单选组的焦点与方向键行为。 */
  .theme-mode__input {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  .theme-mode__surface {
    display: grid;
    place-items: center;
    inline-size: var(--theme-mode-size);
    block-size: var(--theme-mode-size);
    border-radius: 50%;
    color: var(--klc-color-ui-muted);
    transition:
      color var(--klc-motion-duration-fast) ease,
      background-color var(--klc-motion-duration-fast) ease;
    pointer-events: none;
  }

  .theme-mode__option:hover .theme-mode__surface {
    color: var(--klc-color-ui-text);
    background-color: var(--klc-color-ui-hover);
  }

  /* 选中态背景由滑块承担，表面保持透明让滑块透出。 */
  .theme-mode__input:checked + .theme-mode__surface {
    color: var(--klc-color-ui-accent);
    background-color: transparent;
  }

  .theme-mode__input:focus-visible + .theme-mode__surface {
    outline: 2px solid var(--klc-color-ui-accent);
    outline-offset: calc(2px * var(--theme-mode-scale));
  }

  .theme-mode__icon {
    inline-size: calc(18px * var(--theme-mode-scale));
    block-size: calc(18px * var(--theme-mode-scale));
  }

  @media (prefers-reduced-motion: reduce) {
    .theme-mode__surface,
    .theme-mode__thumb {
      transition: none;
    }
  }
</style>
