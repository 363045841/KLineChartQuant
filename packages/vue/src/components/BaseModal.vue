<!--
  模态对话框原语：原生 <dialog>.showModal()。
  - 浏览器负责 top layer、背景 inert 与 Esc（cancel 事件）；
  - Tab 在对话框内循环（不逃逸到浏览器 UI），关闭后焦点回到打开前的元素；
  - aria-labelledby 指向标题；关闭按钮有 type 与可访问名称；
  - 进出场用 @starting-style + transition-behavior: allow-discrete，不用定时器；
  - 受控方式：v-model:open（推荐）或旧的 show + @close（保持兼容）。
-->
<template>
  <Teleport :to="teleportTarget">
    <dialog
      v-if="rendered"
      ref="dialog"
      class="base-modal"
      :style="modalStyle"
      :aria-labelledby="labelledBy"
      :aria-label="labelledBy ? undefined : ariaLabel || undefined"
      @cancel.prevent="requestClose"
      @pointerdown.self="onBackdropPointerDown"
      @click.self="onBackdropClick"
      @close="onNativeClose"
      @keydown.tab="trapTab"
    >
      <div v-if="$slots.header || $slots.title || title" class="base-header">
        <slot name="header">
          <div class="base-header-left">
            <h2 :id="titleId" class="base-title"><slot name="title">{{ title }}</slot></h2>
            <span v-if="subtitle" class="base-subtitle">{{ subtitle }}</span>
          </div>
        </slot>
        <div v-if="showClose" class="base-header-right">
          <slot name="header-extra" />
          <button
            type="button"
            class="base-close-btn"
            :aria-label="closeLabel"
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
          </button>
        </div>
      </div>

      <div v-if="$slots.subheader" class="base-subheader">
        <slot name="subheader" />
      </div>

      <div v-if="$slots.tabs" class="base-tabs">
        <slot name="tabs" />
      </div>

      <div
        class="base-body"
        :class="{ 'base-body--scrollable': bodyScrollable }"
        :style="{ padding: bodyPadding }"
      >
        <slot />
      </div>

      <div v-if="$slots.footer" class="base-footer" :style="{ justifyContent: footerAlign }">
        <slot name="footer" />
      </div>

      <!-- 模态期间 dialog 外的内容是 inert：Undo 等 toast 在对话框内渲染才可交互。 -->
      <ToastViewport v-if="isOpen" placement="bottom-center" />
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
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

  import { getTabbables } from '../composables/overlay/platform.js'
  import {
    provideFullscreenTeleportTarget,
    useFullscreenTeleportTarget,
  } from '../composables/useFullscreenTeleportTarget.js'
  import ToastViewport from './common/ToastViewport.vue'

  const props = withDefaults(
    defineProps<{
      /** 旧版受控开关；新代码使用 v-model:open。 */
      show?: boolean
      title?: string
      subtitle?: string
      width?: string
      maxWidth?: string
      maxHeight?: string
      overlayPadding?: string
      bodyPadding?: string
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
      show: false,
      title: '',
      subtitle: '',
      width: 'min(92vw, 400px)',
      maxWidth: '',
      maxHeight: 'min(600px, calc(100vh - 48px))',
      overlayPadding: 'var(--klc-space-24, 24px)',
      bodyPadding: 'var(--klc-space-16, 16px)',
      bodyScrollable: true,
      footerAlign: 'flex-end',
      closeOnOverlay: true,
      showClose: true,
      ariaLabel: '',
      closeLabel: '关闭',
    },
  )

  /** v-model:open；未绑定时为 undefined，回落到 show。 */
  const open = defineModel<boolean | undefined>('open', { default: undefined })

  const emit = defineEmits<{
    close: []
  }>()

  const slots = useSlots()
  const titleId = `base-modal-title-${useId()}`
  const labelledBy = computed(() =>
    !slots.header && (slots.title || props.title) ? titleId : undefined,
  )

  const teleportTarget = useFullscreenTeleportTarget()
  const dialog = useTemplateRef<HTMLDialogElement>('dialog')
  // 原生 modal dialog 位于 top layer，dialog 外的内容是 inert；内部弹层也挂在 dialog 内。
  provideFullscreenTeleportTarget(dialog)

  const isOpen = computed(() => open.value ?? props.show)
  const rendered = ref(isOpen.value)
  let returnFocusTo: HTMLElement | null = null
  let pointerDownOnBackdrop = false

  const modalStyle = computed(() => ({
    width: props.width,
    maxWidth: props.maxWidth
      ? `min(${props.maxWidth}, calc(100vw - ${props.overlayPadding} - ${props.overlayPadding}))`
      : `calc(100vw - ${props.overlayPadding} - ${props.overlayPadding})`,
    maxHeight: `min(${props.maxHeight}, calc(100vh - ${props.overlayPadding} - ${props.overlayPadding}))`,
  }))

  async function openDialog(): Promise<void> {
    const active = document.activeElement
    if (!dialog.value?.open) {
      returnFocusTo = active instanceof HTMLElement && active !== document.body ? active : null
    }
    rendered.value = true
    await nextTick()
    const element = dialog.value
    if (element && !element.open && isOpen.value) element.showModal()
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
    if (!isOpen.value) rendered.value = false
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
    if (!isOpen.value && !dialog.value?.open) return
    open.value = false
    emit('close')
    void closeDialog()
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
    if (!isOpen.value) return
    open.value = false
    emit('close')
    void closeDialog()
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

  watch(isOpen, (value) => (value ? openDialog() : closeDialog()))
  onMounted(() => {
    if (isOpen.value) void openDialog()
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
    /* UA 的 modal 居中（inset: 0; margin: auto），静止时没有 transform，
       内部 position: fixed 的元素仍相对视口定位。 */
    margin: auto;
    background: var(--klc-color-ui-surface);
    color: var(--klc-color-ui-text, #edf2f3);
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
      opacity var(--klc-motion-dur-base, 200ms) var(--klc-motion-ease-out, ease-out),
      scale var(--klc-motion-dur-base, 200ms) var(--klc-motion-ease-out, ease-out),
      translate var(--klc-motion-dur-base, 200ms) var(--klc-motion-ease-out, ease-out),
      overlay var(--klc-motion-dur-base, 200ms) allow-discrete,
      display var(--klc-motion-dur-base, 200ms) allow-discrete;
  }

  /* 退场：close() 后保持渲染直到过渡结束（display/overlay allow-discrete）。 */
  .base-modal:not([open]) {
    display: none;
    opacity: 0;
    scale: 0.98;
    translate: 0 8px;
    transition-duration: var(--klc-motion-dur-fast, 160ms);
  }

  @starting-style {
    .base-modal[open] {
      opacity: 0;
      scale: 0.96;
      translate: 0 -10px;
    }
  }

  .base-modal::backdrop {
    background: transparent;
    backdrop-filter: blur(0);
    transition:
      background var(--klc-motion-dur-base, 200ms) var(--klc-motion-ease-out, ease-out),
      backdrop-filter var(--klc-motion-dur-base, 200ms) var(--klc-motion-ease-out, ease-out),
      overlay var(--klc-motion-dur-base, 200ms) allow-discrete,
      display var(--klc-motion-dur-base, 200ms) allow-discrete;
  }

  .base-modal[open]::backdrop {
    /* 与 Agent 面板共用遮罩 token；未提供时回退到 30% 黑。 */
    background: var(--klc-color-agent-backdrop, rgb(0 0 0 / 0.3));
    backdrop-filter: blur(4px);
  }

  @starting-style {
    .base-modal[open]::backdrop {
      background: transparent;
      backdrop-filter: blur(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .base-modal,
    .base-modal:not([open]) {
      scale: none;
      translate: none;
      transition-property: opacity, overlay, display;
    }

    @starting-style {
      .base-modal[open] {
        scale: none;
        translate: none;
      }
    }
  }

  .base-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--klc-space-12, 12px) var(--klc-space-12, 12px) var(--klc-space-12, 12px)
      var(--klc-space-16, 16px);
    flex-shrink: 0;
    gap: var(--klc-space-12, 12px);
  }

  .base-header-left {
    display: flex;
    align-items: baseline;
    gap: var(--klc-space-8, 8px);
    min-width: 0;
  }

  .base-title {
    margin: 0;
    font-size: var(--klc-text-label-16-font-size, 16px);
    font-weight: 600;
    color: var(--klc-color-ui-text);
    line-height: var(--klc-text-label-16-line-height, 24px);
    letter-spacing: var(--klc-text-label-16-letter-spacing, normal);
    white-space: nowrap;
  }

  .base-subtitle {
    font-size: var(--klc-text-12-font-size, 12px);
    color: var(--klc-color-ui-muted);
    line-height: var(--klc-text-12-line-height, 16px);
    white-space: nowrap;
  }

  .base-header-right {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    flex-shrink: 0;
  }

  .base-close-btn {
    background: var(--klc-color-ui-hover);
    border: 0;
    border-radius: var(--klc-radius-md, 8px);
    width: var(--klc-density-default, 32px);
    height: var(--klc-density-default, 32px);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--klc-color-ui-muted);
    transition:
      background var(--klc-motion-dur-fast, 160ms),
      color var(--klc-motion-dur-fast, 160ms);
    padding: 0;
  }

  .base-close-btn:hover {
    background: var(--klc-color-ui-border);
    color: var(--klc-color-ui-text);
  }

  .base-close-btn:focus-visible {
    outline: 2px solid var(--klc-color-ui-accent);
    outline-offset: 2px;
  }

  .base-close-btn svg {
    width: 14px;
    height: 14px;
  }

  .base-subheader {
    flex-shrink: 0;
    padding: var(--klc-space-16, 16px);
  }

  .base-tabs {
    flex-shrink: 0;
  }

  .base-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .base-body--scrollable {
    overflow-y: auto;
  }

  .base-footer {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--klc-space-8, 8px);
    padding: var(--klc-space-12, 12px) var(--klc-space-16, 16px);
    flex-shrink: 0;
  }

  /* ── Responsive ── */
  @media (max-width: 480px) {
    .base-modal {
      min-width: 0;
      width: 100% !important;
      max-height: calc(100vh - var(--klc-space-24, 24px));
    }
  }
</style>
