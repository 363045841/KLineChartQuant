<template>
  <span
    ref="triggerRef"
    class="base-tooltip__trigger"
    :class="{ 'is-contents': triggerDisplay === 'contents' }"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <slot />
  </span>

  <Teleport :to="teleportTarget">
    <Transition name="base-tooltip">
      <div
        v-if="visible"
        ref="tooltipRef"
        class="base-tooltip"
        :class="[`base-tooltip--${placement}`, { 'is-styled': styled }]"
        :style="tooltipStyle"
        role="tooltip"
      >
        <slot name="content">{{ content }}</slot>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { useFullscreenTeleportTarget } from '../../composables/useFullscreenTeleportTarget.js'
  import { type TooltipPlacement, useTooltip } from '../../composables/useTooltip.js'

  const props = withDefaults(
    defineProps<{
      /** 提示文本；也可用 content 插槽自定义内容 */
      content?: string
      /** 相对触发元素的显示位置 */
      placement?: TooltipPlacement
      /** 提示框与触发元素的间距（px） */
      offset?: number
      /** 触发层盒模型；contents 不参与父级布局（用于 grid/flex 子项） */
      triggerDisplay?: 'inline-flex' | 'contents'
      /** 显示延迟（ms） */
      showDelay?: number
      /** 隐藏延迟（ms） */
      hideDelay?: number
      /** 为 true 时屏蔽显示 */
      disabled?: boolean
    }>(),
    {
      content: '',
      placement: 'right',
      offset: 8,
      triggerDisplay: 'inline-flex',
      showDelay: 300,
      hideDelay: 0,
      disabled: false,
    },
  )

  const teleportTarget = useFullscreenTeleportTarget()

  const {
    triggerRef,
    tooltipRef,
    visible,
    styled,
    tooltipStyle,
    onPointerEnter,
    onPointerLeave,
    onFocusIn,
    onFocusOut,
  } = useTooltip({
    placement: () => props.placement,
    offset: () => props.offset,
    showDelay: () => props.showDelay,
    hideDelay: () => props.hideDelay,
    disabled: () => props.disabled,
  })
</script>

<style scoped>
  .base-tooltip__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* 不生成盒模型，子元素直接参与父级 grid/flex 布局。 */
  .base-tooltip__trigger.is-contents {
    display: contents;
  }

  .base-tooltip {
    position: fixed;
    /* 高于 BaseModal 浮层(1000/1100)，否则弹窗内的提示会被遮挡。 */
    z-index: 1200;
    padding: 4px 8px;
    border: 1px solid var(--klc-color-tooltip-border);
    border-radius: 4px;
    background: var(--klc-color-tooltip-bg);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
    color: var(--klc-color-tooltip-text);
    font-size: 12px;
    line-height: 1.5;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    /* 尺寸测量完成前保持隐藏，避免在默认坐标处闪现。 */
    visibility: hidden;
  }

  .base-tooltip.is-styled {
    visibility: visible;
  }

  .base-tooltip-enter-active,
  .base-tooltip-leave-active {
    transition:
      opacity 0.12s ease,
      transform 0.12s ease;
  }

  .base-tooltip-enter-from,
  .base-tooltip-leave-to {
    opacity: 0;
  }

  .base-tooltip--right.base-tooltip-enter-from,
  .base-tooltip--right.base-tooltip-leave-to {
    transform: translateX(-4px);
  }

  .base-tooltip--left.base-tooltip-enter-from,
  .base-tooltip--left.base-tooltip-leave-to {
    transform: translateX(4px);
  }

  .base-tooltip--top.base-tooltip-enter-from,
  .base-tooltip--top.base-tooltip-leave-to {
    transform: translateY(4px);
  }

  .base-tooltip--bottom.base-tooltip-enter-from,
  .base-tooltip--bottom.base-tooltip-leave-to {
    transform: translateY(-4px);
  }
</style>
