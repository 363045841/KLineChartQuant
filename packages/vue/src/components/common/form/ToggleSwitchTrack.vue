<!--
  开关视觉轨道：只画 track 与 thumb，不承担交互和语义。
  - 交互由 ToggleSwitch 的 input 或菜单项的 menuitemcheckbox 提供；
  - 本组件整体 aria-hidden，调用方必须在外部提供可访问状态。
-->
<template>
  <span
    class="toggle-switch-track"
    :class="{ 'is-compact': size === 'compact', 'is-checked': checked }"
    aria-hidden="true"
  >
    <span class="toggle-switch-track__thumb" />
  </span>
</template>

<script setup lang="ts">
  withDefaults(
    defineProps<{
      checked: boolean
      size?: 'default' | 'compact'
    }>(),
    { size: 'default' },
  )
</script>

<style scoped>
  .toggle-switch-track {
    position: relative;
    display: block;
    flex: 0 0 auto;
    width: 34px;
    height: 20px;
    border-radius: var(--klc-radius-full, 9999px);
    background: var(--klc-color-ui-switch-off);
    transition: background var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .toggle-switch-track.is-compact {
    width: 28px;
    height: 16px;
  }

  .toggle-switch-track.is-checked {
    background: var(--klc-color-ui-switch-on);
  }

  .toggle-switch-track__thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--klc-color-ui-switch-thumb);
    /* 圆钮的浮起量走统一阴影阶梯，不在组件里手写 rgba。 */
    box-shadow: var(--klc-elevation-1);
    transition: transform var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .toggle-switch-track.is-compact .toggle-switch-track__thumb {
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
  }

  .toggle-switch-track.is-checked .toggle-switch-track__thumb {
    transform: translateX(14px);
  }

  .toggle-switch-track.is-compact.is-checked .toggle-switch-track__thumb {
    transform: translateX(12px);
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle-switch-track,
    .toggle-switch-track__thumb {
      transition: none;
    }
  }
</style>
