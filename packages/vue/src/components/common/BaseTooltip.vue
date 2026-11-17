<!--
  悬浮提示：本组件负责显示时机、内容与描述关系，定位交给共享的测量引擎（floating-ui）。
  触发器必须包含一个可聚焦控件：它既是提示锚点，也是 aria-describedby 的挂载点；
  包装层只提供事件与布局通道（trigger-display / fill），不参与定位。
  控件处于禁用态（disabled / aria-disabled）时不提示：禁用按钮本来就点不动。

  用法：
  <BaseTooltip content="保存"><button aria-label="保存">…</button></BaseTooltip>
-->
<template>
  <span
    ref="triggerRef"
    class="base-tooltip__trigger"
    :class="{ 'is-contents': triggerDisplay === 'contents', 'is-fill': fill }"
    @pointerenter="onTriggerEnter"
    @pointerleave="onPointerLeave"
    @focusin="onTriggerFocus"
    @focusout="onFocusOut"
  >
    <slot />
  </span>

  <Teleport v-if="hasContent" :to="teleportTarget">
    <div
      ref="panel"
      class="base-tooltip klc-overlay"
      :class="[`base-tooltip--${placement}`, { 'is-open': visible }]"
      v-bind="panelBindings"
      role="tooltip"
    >
      <template v-if="visible">
        <span class="base-tooltip__content"><slot name="content">{{ content }}</slot></span>
        <span v-if="shortcut" class="base-tooltip__shortcut" aria-label="快捷键">
          <ShortcutKeys :shortcut="shortcut" variant="tooltip" />
        </span>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { primaryShortcut } from '@363045841yyt/klinechart-core'
  import { injectCommands, useCommandList } from '@vue-src/composables/commands/useCommands.js'
  import { useFullscreenTeleportTarget } from '@vue-src/composables/ui/useFullscreenTeleportTarget.js'
  import { type TooltipPlacement, useTooltip } from '@vue-src/composables/ui/useTooltip.js'
  import {
    computed,
    onBeforeUnmount,
    shallowRef,
    useSlots,
    useTemplateRef,
    watch,
  } from 'vue'
  import ShortcutKeys from './ShortcutKeys.vue'

  /** 触发层里可作为描述对象的控件；包装层本身不可聚焦，不能承载 aria-describedby。 */
  const CONTROL_SELECTOR = 'button, a[href], input, select, textarea, [tabindex]'

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
      /** 撑满父级：用于轴边、整格点击等需要 100% 命中区的场景。 */
      fill?: boolean
      /** 显示延迟（ms） */
      showDelay?: number
      /** 隐藏延迟（ms） */
      hideDelay?: number
      /** 为 true 时屏蔽显示 */
      disabled?: boolean
      /** 关联命令 id；存在时在 tooltip 后显示该命令的快捷键。 */
      command?: string
    }>(),
    {
      content: '',
      placement: 'right',
      offset: 8,
      triggerDisplay: 'inline-flex',
      fill: false,
      showDelay: 300,
      hideDelay: 0,
      disabled: false,
      command: undefined,
    },
  )

  const slots = useSlots()
  const teleportTarget = useFullscreenTeleportTarget()
  const registry = injectCommands()
  const commands = useCommandList(registry)
  const triggerRef = useTemplateRef<HTMLElement>('triggerRef')
  const panel = useTemplateRef<HTMLElement>('panel')
  /** 定位锚点：触发层里的可聚焦控件，等价于 `aria-describedby` 的目标。 */
  const anchorEl = shallowRef<HTMLElement | null>(null)
  /** 控件禁用时不提示：说明一个点不动的按钮只是噪音。 */
  const controlDisabled = shallowRef(false)

  /** 没有文本也没有内容插槽时不弹提示，避免出现空框。 */
  const hasContent = computed(() => props.content.length > 0 || Boolean(slots.content))
  const shortcut = computed(() => {
    if (!props.command || !registry) return null
    const command = commands.value.find((entry) => entry.id === props.command)
    const combo = command ? primaryShortcut(command) : null
    return combo ? registry.formatShortcut(combo) : null
  })

  const {
    id: tooltipId,
    visible,
    panelBindings,
    onPointerEnter,
    onPointerLeave,
    onFocusIn,
    onFocusOut,
  } = useTooltip({
    trigger: anchorEl,
    panel,
    placement: () => props.placement,
    offset: () => props.offset,
    showDelay: () => props.showDelay,
    hideDelay: () => props.hideDelay,
    disabled: () => props.disabled || !hasContent.value || controlDisabled.value,
  })

  let describedControl: HTMLElement | null = null
  let previousDescribedBy: string | null = null
  let observedControl: HTMLElement | null = null
  let disabledObserver: MutationObserver | null = null

  /** 提示锚定并描述触发层里的可聚焦控件；包装层只负责布局与事件，不参与定位。 */
  function syncControl(): void {
    const wrapper = triggerRef.value
    const control = wrapper?.querySelector<HTMLElement>(CONTROL_SELECTOR) ?? null
    // 没有可聚焦控件时退回包装层，至少保证提示仍有锚点。
    anchorEl.value = control ?? wrapper
    trackDisabled(control)
    if (!hasContent.value) {
      restoreDescription()
      return
    }
    bindDescription(control)
  }

  /** 跟随控件的禁用态：禁用后立刻收起提示，重新启用后恢复。 */
  function trackDisabled(control: HTMLElement | null): void {
    if (control === observedControl) return
    disabledObserver?.disconnect()
    disabledObserver = null
    observedControl = control
    controlDisabled.value = control ? isDisabled(control) : false
    if (!control || typeof MutationObserver === 'undefined') return
    disabledObserver = new MutationObserver(() => {
      controlDisabled.value = isDisabled(control)
    })
    disabledObserver.observe(control, {
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled'],
    })
  }

  /** 原生禁用与 aria-disabled 都算不可操作。 */
  function isDisabled(control: HTMLElement): boolean {
    return control.matches(':disabled, [aria-disabled="true"]')
  }

  /** 宿主已有的描述追加保留，卸载时还原。 */
  function bindDescription(control: HTMLElement | null): void {
    if (control === describedControl) return
    restoreDescription()
    describedControl = control
    if (!control) return
    previousDescribedBy = control.getAttribute('aria-describedby')
    control.setAttribute(
      'aria-describedby',
      previousDescribedBy ? `${previousDescribedBy} ${tooltipId}` : tooltipId,
    )
  }

  function restoreDescription(): void {
    if (!describedControl) return
    if (previousDescribedBy === null) describedControl.removeAttribute('aria-describedby')
    else describedControl.setAttribute('aria-describedby', previousDescribedBy)
    describedControl = null
    previousDescribedBy = null
  }

  // 触发内容可能在条件渲染后变化；包装层与内容就绪后重新解析锚点与描述关系。
  watch([triggerRef, hasContent], syncControl, { flush: 'post', immediate: true })

  /** 进入事件时先同步解析锚点：锚点来自 DOM，首次交互可能早于挂载后的一致性刷新。 */
  function onTriggerEnter(): void {
    syncControl()
    onPointerEnter()
  }

  function onTriggerFocus(event: FocusEvent): void {
    syncControl()
    onFocusIn(event)
  }

  onBeforeUnmount(() => {
    disabledObserver?.disconnect()
    restoreDescription()
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

  /* 撑满父级：轴边操作、整格命中区等场景。 */
  .base-tooltip__trigger.is-fill {
    display: block;
    inline-size: 100%;
    block-size: 100%;
  }

  .base-tooltip {
    position: fixed;
    /* 覆盖 UA 的 popover 默认样式（inset: 0; margin: auto; overflow: auto）。 */
    inset: auto;
    margin: 0;
    overflow: visible;
    /* 高于弹层与模态（tokens-v2 z-index 分层），否则弹窗内的提示会被遮挡。 */
    z-index: var(--klc-z-index-tooltip, 1200);
    padding: var(--klc-space-4, 4px) var(--klc-space-8, 8px);
    border: 1px solid var(--klc-color-tooltip-border);
    border-radius: var(--klc-radius-xs, 4px);
    background: var(--klc-color-tooltip-bg);
    box-shadow: var(--klc-elevation-2, 0 4px 14px rgb(0 0 0 / 0.14));
    color: var(--klc-color-tooltip-text);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: 1.5;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    opacity: 1;
    translate: 0 0;
    transition:
      opacity var(--klc-motion-dur-fast) var(--klc-motion-ease-out),
      translate var(--klc-motion-dur-fast) var(--klc-motion-ease-out),
      overlay var(--klc-motion-dur-fast) allow-discrete,
      display var(--klc-motion-dur-fast) allow-discrete;
  }

  /* 首次出现从提示方向一侧滑入；收起沿用浏览器默认的离散隐藏。 */
  @starting-style {
    .base-tooltip:popover-open,
    .base-tooltip.is-open {
      opacity: 0;
      translate: var(--tooltip-enter-translate, 0 4px);
    }
  }

  .base-tooltip--top {
    --tooltip-enter-translate: 0 4px;
  }

  .base-tooltip--bottom {
    --tooltip-enter-translate: 0 -4px;
  }

  .base-tooltip--left {
    --tooltip-enter-translate: 4px 0;
  }

  .base-tooltip--right {
    --tooltip-enter-translate: -4px 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .base-tooltip {
      transition: none;
    }
  }

  .base-tooltip__content {
    display: inline-flex;
    align-items: center;
  }

  .base-tooltip__shortcut {
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
  }
</style>
