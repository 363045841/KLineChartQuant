<!--
  通用锚定气泡（toggletip / 非模态面板）：Popover API + CSS anchor positioning，
  不支持时回退 floating-ui。用于替代「弹窗里再开弹窗」的说明、轻量表单等内容。

  契约：非受控浮层，开关只归组件自己。
  - 开合由 trigger 决定：click 单击切换、hover 指针或焦点进入展开；外部不传 open；
  - 对外只有 @open / @close 通知，ref 的 show/hide/toggle 仅作程序化逃生口；
  - role 按内容选：note 纯说明、dialog 可交互内容，与触发方式无关；
  - 定位与其他浮层共用一套（auto|top|bottom 翻转、maxHeight 限高），note 不抢焦点。
  需要外部状态驱动的面板请用 MenuSurface（受控 open + anchor）。

  用法：
  <BasePopover label="指标说明">
    <template #trigger="{ props }"><button v-bind="props">i</button></template>
    说明文字…
  </BasePopover>
-->
<template>
  <slot
    name="trigger"
    :props="triggerProps"
    :open="isOpen"
    :toggle="popover.toggle"
  />
  <Teleport :to="teleportTarget">
    <div
      ref="panel"
      class="base-popover popover-surface popover-surface--scroll klc-overlay"
      v-bind="popover.panelBindings.value"
      :role="role"
      :aria-label="label"
      @mouseenter="onPanelEnter"
      @mouseleave="onPanelLeave"
    >
      <slot v-if="isOpen" :close="close" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import './popover-surface.css'
  import { useAnchoredPopover } from '@vue-src/composables/overlay/useAnchoredPopover.js'
  import { useFullscreenTeleportTarget } from '@vue-src/composables/ui/useFullscreenTeleportTarget.js'
  import { computed, onScopeDispose, ref, useTemplateRef } from 'vue'

  const props = withDefaults(
    defineProps<{
      /** 面板可访问名称。 */
      label: string
      placement?: 'auto' | 'top' | 'bottom'
      /** 面板语义：dialog（含可交互内容）或 note（纯说明）。 */
      role?: 'dialog' | 'note'
      /** 触发方式：click 用于可交互面板，hover 用于纯说明气泡。 */
      trigger?: 'click' | 'hover'
      maxHeight?: string
    }>(),
    {
      placement: 'auto',
      role: 'dialog',
      trigger: 'click',
      maxHeight: 'min(360px, calc(100vh - 24px))',
    },
  )

  const emit = defineEmits<{ open: []; close: [] }>()

  const triggerEl = ref<HTMLElement | null>(null)
  const panel = useTemplateRef<HTMLElement>('panel')
  const teleportTarget = useFullscreenTeleportTarget()

  const popover = useAnchoredPopover({
    trigger: triggerEl,
    panel,
    placement: () => props.placement,
    offset: 6,
    maxHeight: () => props.maxHeight,
    onOpen: () => emit('open'),
    onClose: () => emit('close'),
  })
  const isOpen = popover.open
  let hideTimer: ReturnType<typeof setTimeout> | undefined

  /** 鼠标在触发器和面板之间移动时延迟收起，避免刚显示就被 mouseleave 关掉。 */
  function scheduleHide(): void {
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => popover.hide({ restoreFocus: false }), 120)
  }

  function cancelHide(): void {
    clearTimeout(hideTimer)
    hideTimer = undefined
  }

  function onPanelEnter(): void {
    if (props.trigger === 'hover') cancelHide()
  }

  function onPanelLeave(): void {
    if (props.trigger === 'hover') scheduleHide()
  }

  onScopeDispose(() => clearTimeout(hideTimer))

  /** 触发元素通过 ref 回调登记，供定位与焦点归还使用。 */
  const triggerProps = computed(() => {
    const bindings = {
      ...popover.triggerBindings.value,
      'aria-haspopup': props.role === 'dialog' ? ('dialog' as const) : undefined,
      ref: (element: unknown) => {
        triggerEl.value = element instanceof HTMLElement ? element : null
      },
    } as Record<string, unknown>
    if (props.trigger === 'hover') {
      // hover 模式不能保留 popovertarget，否则点击仍会被浏览器原生切换。
      delete bindings.popovertarget
      return {
        ...bindings,
        onMouseenter: () => {
          cancelHide()
          popover.show()
        },
        onMouseleave: scheduleHide,
        onFocus: () => {
          cancelHide()
          popover.show()
        },
        onBlur: () => popover.hide({ restoreFocus: false }),
      }
    }
    return { ...bindings, onClick: popover.onTriggerClick }
  })

  function close(): void {
    popover.hide({ restoreFocus: true })
  }

  defineExpose({ show: popover.show, hide: close, toggle: popover.toggle })
</script>

<style scoped>
  .base-popover {
    --popover-surface-background: var(--klc-color-ui-surface);
    box-sizing: border-box;
    max-width: min(360px, calc(100vw - 2 * var(--klc-space-8, 8px)));
    padding: var(--klc-space-12, 12px);
    font-size: var(--klc-text-copy-13-font-size, 13px);
    line-height: var(--klc-text-copy-13-line-height, 18px);
    opacity: 1;
    translate: 0 0;
    transition:
      opacity var(--klc-motion-dur-fast) var(--klc-motion-ease-out),
      translate var(--klc-motion-dur-fast) var(--klc-motion-ease-out),
      overlay var(--klc-motion-dur-fast) allow-discrete,
      display var(--klc-motion-dur-fast) allow-discrete;
  }

  .base-popover:empty {
    padding: 0;
  }

  @starting-style {
    .base-popover:popover-open {
      opacity: 0;
      translate: 0 -4px;
    }
  }

</style>
