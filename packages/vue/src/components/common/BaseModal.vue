<!--
  模态对话框原语：原生 <dialog>.showModal()。
  - 浏览器负责 top layer、背景 inert 与 Esc（cancel 事件）；
  - Tab 在对话框内循环（不逃逸到浏览器 UI），关闭后焦点回到打开前的元素；
  - aria-labelledby 指向标题；关闭按钮有 type 与可访问名称；
  - 进出场用 @starting-style + transition-behavior: allow-discrete，不用定时器；
  - 只接受父组件控制的 open，通过 update:open 请求变更，不持有内部开关状态；
  - --base-modal-content-inset 是弹窗内容横向内边距的唯一来源：Tab 文字、搜索框、
    需要安全区的正文（bodyPadded）与列表行都跟着它，消费方不再各自写横向 padding；
  - 尺寸走 size 预设，宽度/高度/遮罩间距只在特殊弹窗用 props 覆盖。
-->
<template>
  <Teleport :to="teleportTarget">
    <dialog
      v-if="rendered"
      ref="dialog"
      class="base-modal"
      :class="{
        'base-modal--draggable': draggable,
        'base-modal--dragging': dragging,
        'base-modal--resizing': resizing,
      }"
      :style="[modalStyle, dragStyle]"
      :aria-labelledby="labelledBy"
      :aria-label="labelledBy ? undefined : ariaLabel || undefined"
      @cancel.prevent="requestClose"
      @pointerdown.self="onBackdropPointerDown"
      @click.self="onBackdropClick"
      @close="onNativeClose"
      @keydown.tab="trapTab"
    >
      <div class="base-modal__surface">
        <div
          v-if="slots.header || slots.title || title"
          ref="dragHeader"
          class="base-header"
          @pointerdown="startDrag"
          @pointermove="drag"
          @pointerup="stopDrag"
          @pointercancel="stopDrag"
          @lostpointercapture="stopDrag"
        >
          <div class="base-header-left">
            <slot name="header">
              <h2 :id="titleId" class="base-title"><slot name="title">{{ title }}</slot></h2>
            </slot>
          </div>
          <div v-if="showClose" class="base-header-right">
            <slot name="header-extra" />
            <BaseIconButton
              class="base-close-btn"
              :label="closeLabel"
              @click="requestClose"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </BaseIconButton>
          </div>
        </div>

        <div v-if="slots.subheader" class="base-subheader">
          <slot name="subheader" />
        </div>

        <div v-if="slots.tabs" class="base-modal__tabs">
          <slot name="tabs" />
        </div>

        <div
          class="base-body"
          :class="{ 'base-body--scrollable': bodyScrollable, 'base-body--padded': bodyPadded }"
        >
          <slot />
        </div>

        <div v-if="slots.footer" class="base-footer" :style="{ justifyContent: footerAlign }">
          <slot name="footer" />
        </div>
      </div>

      <!-- 模态期间 dialog 外的内容是 inert：Undo 等 toast 在对话框内渲染才可交互。 -->
      <ToastViewport v-if="open" placement="bottom-center" />
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
  import { getTabbables } from '@vue-src/composables/overlay/platform.js'
  import {
    provideFullscreenTeleportTarget,
    useFullscreenTeleportTarget,
  } from '@vue-src/composables/ui/useFullscreenTeleportTarget.js'
  import { useModalDrag } from '@vue-src/composables/ui/useModalDrag.js'
  import { useModalResize } from '@vue-src/composables/ui/useModalResize.js'
  import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    useId,
    useSlots,
    useTemplateRef,
    watch,
  } from 'vue'
  import BaseIconButton from './BaseIconButton.vue'
  import ToastViewport from './ToastViewport.vue'

  const props = withDefaults(
    defineProps<{
      /** 唯一开关状态，由父组件持有。 */
      open: boolean
      /** 默认允许拖动标题栏；控件与 data-modal-no-drag 区域不会触发拖动。 */
      draggable?: boolean
      title?: string
      /** 尺寸预设；显式 width 优先。 */
      size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
      /** 显式宽度：fit-content 或超宽弹窗使用，默认 min(92vw, 400px)。 */
      width?: string
      /** 内容自适应宽度时的下限，仍受视口可用宽度约束。 */
      minWidth?: string
      /** 默认平滑过渡内容或配置引起的尺寸变化，尊重减少动态效果偏好。 */
      animateResize?: boolean
      maxWidth?: string
      maxHeight?: string
      /** 普通表单正文需要弹窗安全区时开启；列表和自管理间距的内容保持贴边。 */
      bodyPadded?: boolean
      bodyScrollable?: boolean
      footerAlign?: 'flex-end' | 'center' | 'flex-start' | 'space-between'
      closeOnOverlay?: boolean
      showClose?: boolean
      /** 无标题时的可访问名称。 */
      ariaLabel?: string
      /** 关闭按钮的可访问名称。 */
      closeLabel?: string
    }>(),
    {
      title: '',
      draggable: true,
      width: '',
      minWidth: '',
      animateResize: true,
      maxWidth: '',
      maxHeight: '780px',
      bodyPadded: false,
      bodyScrollable: true,
      footerAlign: 'flex-end',
      closeOnOverlay: true,
      showClose: true,
      ariaLabel: '',
      closeLabel: '关闭',
    },
  )

  const emit = defineEmits<{
    'update:open': [value: boolean]
  }>()

  const slots = useSlots()
  const titleId = `base-modal-title-${useId()}`
  const labelledBy = computed(() =>
    !slots.header && (slots.title || props.title) ? titleId : undefined,
  )

  const teleportTarget = useFullscreenTeleportTarget()
  const dialog = useTemplateRef<HTMLDialogElement>('dialog')
  const { resizing } = useModalResize(dialog, () => props.animateResize)
  const dragHeader = useTemplateRef<HTMLElement>('dragHeader')
  const { dragging, dragStyle, startDrag, drag, stopDrag } = useModalDrag(
    dialog,
    dragHeader,
    () => props.draggable,
    () => props.open,
  )
  // 原生 modal dialog 位于 top layer，dialog 外的内容是 inert；内部弹层也挂在 dialog 内。
  provideFullscreenTeleportTarget(dialog)

  // 仅控制退场期间 DOM 的存续，不参与判断弹窗是否打开。
  const rendered = ref(props.open)
  let returnFocusTo: HTMLElement | null = null
  let pointerDownOnBackdrop = false

  /** 弹窗宽度预设；显式 width 优先。 */
  const SIZE_WIDTHS = {
    xs: 'min(92vw, 360px)',
    sm: 'min(92vw, 440px)',
    md: 'min(92vw, 560px)',
    lg: 'min(92vw, 640px)',
    xl: 'min(92vw, 780px)',
  } as const
  const resolvedWidth = computed(
    () => props.width || (props.size ? SIZE_WIDTHS[props.size] : 'min(92vw, 400px)'),
  )

  /** 弹窗与视口之间保留的间距；所有弹窗统一，不再逐弹窗覆盖。 */
  const OVERLAY_PADDING = 'var(--klc-space-24, 24px)'

  const modalStyle = computed(() => ({
    '--base-modal-width': resolvedWidth.value,
    minWidth: props.minWidth
      ? `min(${props.minWidth}, calc(100vw - ${OVERLAY_PADDING} - ${OVERLAY_PADDING}))`
      : undefined,
    maxWidth: props.maxWidth
      ? `min(${props.maxWidth}, calc(100vw - ${OVERLAY_PADDING} - ${OVERLAY_PADDING}))`
      : `calc(100vw - ${OVERLAY_PADDING} - ${OVERLAY_PADDING})`,
    maxHeight: `min(${props.maxHeight}, calc(100dvh - ${OVERLAY_PADDING} - ${OVERLAY_PADDING}))`,
  }))

  async function openDialog(): Promise<void> {
    const active = document.activeElement
    if (!dialog.value?.open) {
      returnFocusTo = active instanceof HTMLElement && active !== document.body ? active : null
    }
    rendered.value = true
    await nextTick()
    const element = dialog.value
    if (element && !element.open && props.open) element.showModal()
  }

  /** 关闭原生 dialog；内容在退场过渡结束后卸载。 */
  async function closeDialog(): Promise<void> {
    const element = dialog.value
    if (!element) {
      rendered.value = false
      return
    }
    if (element.open) element.close()
    restoreFocus(element)
    const animations = typeof element.getAnimations === 'function' ? element.getAnimations() : []
    await Promise.allSettled(animations.map((animation) => animation.finished))
    // 退场期间又被打开时保持渲染。
    if (!props.open) rendered.value = false
  }

  function restoreFocus(element: HTMLDialogElement): void {
    const target = returnFocusTo
    returnFocusTo = null
    const active = document.activeElement
    const focusLost = !active || active === document.body || element.contains(active)
    if (target?.isConnected && focusLost) target.focus()
  }

  /** 用户发起的关闭（Esc、关闭按钮、点击背景）。 */
  function requestClose(): void {
    if (props.open) emit('update:open', false)
  }

  function onBackdropPointerDown(): void {
    pointerDownOnBackdrop = true
  }

  function onBackdropClick(): void {
    // 只有按下与抬起都在背景上才算点击背景，避免从内容拖选到背景时误关闭。
    const fromBackdrop = pointerDownOnBackdrop
    pointerDownOnBackdrop = false
    if (props.closeOnOverlay && fromBackdrop) requestClose()
  }

  /** 浏览器直接关闭（如 Chrome 对连续 Esc 的强制关闭）。 */
  function onNativeClose(): void {
    // close 事件异步派发：重新打开后到达的旧事件不能关闭新弹窗。
    if (props.open && !dialog.value?.open) emit('update:open', false)
  }

  /** Tab 在对话框内循环。 */
  function trapTab(event: KeyboardEvent): void {
    const element = dialog.value
    if (!element) return
    const tabbables = getTabbables(element)
    if (tabbables.length === 0) {
      event.preventDefault()
      return
    }
    const first = tabbables[0]
    const last = tabbables[tabbables.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === element)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  watch(
    () => props.open,
    (value) => (value ? openDialog() : closeDialog()),
  )
  onMounted(() => {
    if (props.open) void openDialog()
  })
  onBeforeUnmount(() => {
    const element = dialog.value
    if (element?.open) {
      element.close()
      restoreFocus(element)
    }
  })

  defineExpose({ dialog })
</script>

<style scoped>
  .base-modal {
    /* 弹窗内容横向内边距的唯一来源：Tab 文字、搜索框、正文与正文内滚动区都跟随它。 */
    --base-modal-content-inset: var(--klc-space-24, 24px);
    /* UA 的 modal 居中（inset: 0; margin: auto），静止时没有 transform，
       内部 position: fixed 的元素仍相对视口定位。 */
    margin: auto;
    width: var(--base-modal-width);
    background: var(--klc-color-ui-surface);
    color: var(--klc-color-ui-text);
    border: 0;
    border-radius: var(--klc-radius-lg, 12px);
    box-shadow: var(--klc-elevation-3, 0 18px 48px rgb(0 0 0 / 0.15));
    /* Teleport 到 dialog 内的弹层可以越过对话框边界显示。 */
    overflow: visible;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 0;
    opacity: 1;
    /* 静止时必须是 none：任何 translate/scale 值都会让 dialog 成为 fixed 后代的包含块。 */
    scale: none;
    translate: none;
    transition:
      opacity var(--klc-motion-dur-base) var(--klc-motion-ease-out),
      scale var(--klc-motion-dur-base) var(--klc-motion-ease-out),
      translate var(--klc-motion-dur-base) var(--klc-motion-ease-out),
      overlay var(--klc-motion-dur-base) allow-discrete,
      display var(--klc-motion-dur-base) allow-discrete;
  }

  .base-modal--draggable .base-header {
    cursor: move;
    touch-action: none;
    user-select: none;
  }

  .base-modal--dragging {
    transition: none;
    scale: none;
    translate: none;
  }

  /* 内容在圆角内裁剪；dialog 自身仍保持 visible，供内部弹层越过内容边界。 */
  .base-modal__surface {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    border-radius: inherit;
  }

  /* 退场：close() 后保持渲染直到过渡结束（display/overlay allow-discrete）。 */
  .base-modal:not([open]) {
    display: none;
    opacity: 0;
    scale: 0.98;
    translate: 0 8px;
    transition-duration: var(--klc-motion-dur-fast);
  }

  @starting-style {
    .base-modal[open] {
      opacity: 0;
      scale: 0.96;
      translate: 0 -10px;
    }
  }

  /* 遮罩只做变暗，不做背景模糊：模糊会让弹窗后的图表与面板糊成一片，细节难辨。 */
  .base-modal::backdrop {
    background: transparent;
    transition:
      background var(--klc-motion-dur-base) var(--klc-motion-ease-out),
      overlay var(--klc-motion-dur-base) allow-discrete,
      display var(--klc-motion-dur-base) allow-discrete;
  }

  .base-modal[open]::backdrop {
    /* 与 Agent 面板共用遮罩 token；未提供时回退到 30% 黑。 */
    background: var(--klc-color-agent-backdrop, rgb(0 0 0 / 0.3));
  }

  @starting-style {
    .base-modal[open]::backdrop {
      background: transparent;
    }
  }

/* 标题栏和操作栏共用紧凑高度，内容在栏内垂直居中。 */
  .base-header,
  .base-footer {
    box-sizing: border-box;
    height: calc(var(--klc-density-default, 32px) + 2 * var(--klc-space-4, 4px));
  }

  .base-header {
    position: relative;
    display: grid;
    /* 两侧等宽，关闭按钮和附加操作不改变标题的中心位置。 */
    grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
    align-items: center;
    padding: var(--klc-space-8, 8px);
    flex-shrink: 0;
    gap: var(--klc-space-12, 12px);
  }

  .base-header-left {
    display: flex;
    grid-column: 2;
    align-items: center;
    justify-content: center;
    gap: var(--klc-space-8, 8px);
    min-width: 0;
  }

  .base-title {
    margin: 0;
    font-size: var(--klc-text-label-13-font-size, 13px);
    font-weight: 500;
    color: var(--klc-color-ui-muted);
    line-height: var(--klc-text-label-16-line-height, 24px);
    letter-spacing: var(--klc-text-label-16-letter-spacing, normal);
    white-space: nowrap;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .base-header-right {
    /* 槽位图标按钮与关闭按钮共用尺寸，减少按钮内部留白造成的视觉间距。 */
    --base-modal-header-action-size: var(--klc-space-24, 24px);
    display: flex;
    grid-column: 3;
    justify-self: end;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
  }

  .base-close-btn {
    --base-icon-button-size: var(--base-modal-header-action-size);
    --base-icon-button-icon-size: 14px;
    --base-icon-button-hover-bg: transparent;
  }

  .base-subheader {
    flex-shrink: 0;
    padding: var(--base-modal-content-inset);
  }

  .base-modal__tabs {
    flex-shrink: 0;
  }

  .base-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    /* 正文默认贴边：横向和纵向安全区由内容自己持有。 */
    padding: 0;
  }

  /* 普通表单/正文需要弹窗统一安全区时开启；列表与自管理间距的内容保持贴边。 */
  .base-body--padded {
    padding: var(--base-modal-content-inset);
  }

  .base-body--scrollable {
    overflow-y: auto;
  }

  /*
    尺寸过渡期间 dialog 的盒子比最终内容矮，此时的滚动条只是中间态伪影，
    还会挤掉内容宽度；收起它，等动画结束由最终尺寸决定是否出现。
  */
  .base-modal--resizing .base-body {
    overflow-y: hidden;
  }

  .base-footer {
    /* Footer 内的按钮统一使用紧凑高度。 */
    --base-button-height: calc(var(--klc-density-default, 32px) - var(--klc-space-4, 4px));
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--klc-space-8, 8px);
    padding: 0 var(--klc-space-12, 12px);
    flex-shrink: 0;
  }

  /* Footer 动作只保留文字：悬浮不出底色，下划线由文字下方从中间向两侧展开。 */
  .base-footer :deep(.base-button),
  .base-footer :deep(.control-button) {
    position: relative;
  }

  /*
    Footer 里的下拉触发器同样是文本动作：用 control-button 暴露的变量清掉底色、边框与聚焦阴影。
    变量靠继承生效，不与 control-button 的状态选择器比特异性。
  */
  .base-footer :deep(.control-button) {
    --control-button-border: transparent;
    --control-button-background: transparent;
    --control-button-active-border: transparent;
    --control-button-active-background: transparent;
    --control-button-focus-border: transparent;
    --control-button-focus-background: transparent;
    --control-button-focus-shadow: none;
  }

  .base-footer :deep(.base-button:hover:not(:disabled)) {
    background-color: transparent;
  }

  /*
    下划线用 width 展开，不用 transform: scaleX。
    transform 过渡走合成层，动画结束时该层被回收、线重新栅格化，视觉上会突然变细。
    left 50% + 静态 translate 让宽度从中心向两侧生长；宽度由控件自己声明的行内留白变量推导，
    等于文字宽度（按钮内容区），控件更换尺寸或响应式留白时不会与文字错位。
    线高 1px、离按钮下缘 5px：与文字留出间距的同时不贴着按钮下缘。
  */
  .base-footer :deep(.base-button)::after,
  .base-footer :deep(.control-button)::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 5px;
    width: 0;
    height: 1px;
    background: currentColor;
    translate: -50% 0;
    transition: width var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  /* 菜单展开期间同样保持下划线，提示该入口仍处于激活态。 */
  .base-footer :deep(.base-button:not(:disabled):hover)::after,
  .base-footer :deep(.base-button:not(:disabled):focus-visible)::after {
    width: calc(100% - 2 * var(--base-button-inline-padding, 8px));
  }

  .base-footer :deep(.control-button:not(:disabled):hover)::after,
  .base-footer :deep(.control-button:not(:disabled):focus-visible)::after,
  .base-footer :deep(.control-button[aria-expanded='true'])::after {
    width: calc(100% - 2 * var(--control-button-inline-padding, 8px));
  }

/* ── Responsive ── */
  @media (max-width: 480px) {
    .base-modal {
      min-width: 0;
      width: 100%;
      max-height: calc(100dvh - var(--klc-space-24, 24px));
    }
  }
</style>
