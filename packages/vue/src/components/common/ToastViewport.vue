<!--
  Toast 视口：渲染 useToast() 队列。
  - 只有最后挂载的视口渲染（模态 dialog 内的视口优先），避免重复与 inert 遮挡；
  - 支持 Popover API 时以 popover="manual" 进入 top layer，新 toast 到达时提升到最上层，
    全屏与其他弹层之上都可见；
  - aria-live="polite"；悬停或键盘聚焦时暂停计时；Esc 关闭当前聚焦的 toast。
-->
<template>
  <section
    v-if="isActive"
    ref="region"
    class="klc-toast-viewport"
    :class="`klc-toast-viewport--${placement}`"
    :popover="native ? 'manual' : undefined"
    :aria-label="regionLabel"
    @pointerenter="store.pause(hoverSource)"
    @pointerleave="store.resume(hoverSource)"
    @focusin="store.pause(focusSource)"
    @focusout="onFocusOut"
  >
    <ol class="klc-toast-viewport__list" aria-live="polite" aria-relevant="additions text">
      <TransitionGroup name="klc-toast">
        <li
          v-for="toast in toasts"
          :key="toast.id"
          class="klc-toast"
          :class="`klc-toast--${toast.tone}`"
          :data-toast-id="toast.id"
          @keydown.escape.stop.prevent="store.dismiss(toast.id, 'close')"
        >
          <div class="klc-toast__text">
            <p class="klc-toast__message">{{ toast.message }}</p>
            <p v-if="toast.description" class="klc-toast__description">
              {{ toast.description }}
            </p>
          </div>
          <button
            v-if="toast.action"
            type="button"
            class="klc-toast__action"
            @click="runAction(toast)"
          >
            {{ toast.action.label }}
          </button>
          <button
            type="button"
            class="klc-toast__close"
            :aria-label="closeLabel"
            @click="store.dismiss(toast.id, 'close')"
          >
            <IconX aria-hidden="true" />
          </button>
        </li>
      </TransitionGroup>
    </ol>
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, useId, useTemplateRef, watch } from 'vue'
  import IconX from '~icons/tabler/x'

  import { supportsPopover } from '../../composables/overlay/platform.js'
  import { type ToastItem, useToastStore } from '../../composables/toast/useToast.js'

  const props = withDefaults(
    defineProps<{
      placement?: 'bottom-end' | 'bottom-center' | 'top-center'
      regionLabel?: string
      closeLabel?: string
    }>(),
    {
      placement: 'bottom-end',
      regionLabel: '通知',
      closeLabel: '关闭通知',
    },
  )

  const store = useToastStore()
  const token = Symbol('toast-viewport')
  const uid = useId()
  const hoverSource = `hover:${uid}`
  const focusSource = `focus:${uid}`
  const native = supportsPopover()
  const region = useTemplateRef<HTMLElement>('region')

  const isActive = computed(() => store.activeViewport.value === token)
  const toasts = computed(() => (isActive.value ? store.toasts.value : []))

  let unregister: (() => void) | null = null
  onMounted(() => {
    unregister = store.registerViewport(token)
  })
  onBeforeUnmount(() => {
    store.resume(hoverSource)
    store.resume(focusSource)
    unregister?.()
  })

  /** 把视口提升到 top layer 最上层（新 toast 到达、全屏切换后）。 */
  function raise(): void {
    const element = region.value
    if (!native || !element) return
    try {
      if (element.matches(':popover-open')) element.hidePopover()
      element.showPopover()
    } catch {
      // 元素尚未连接到文档。
    }
  }

  watch(
    () => [isActive.value, store.toasts.value.length] as const,
    ([active, length], previous) => {
      if (!active) return
      const grew = !previous || length > previous[1] || !previous[0]
      if (grew) void nextTick(raise)
    },
    { immediate: true },
  )

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null
    if (next && region.value?.contains(next)) return
    store.resume(focusSource)
  }

  async function runAction(toast: ToastItem): Promise<void> {
    const action = toast.action
    if (!action) return
    store.dismiss(toast.id, 'action')
    await action.onAction()
  }
</script>

<style scoped>
  .klc-toast-viewport {
    position: fixed;
    inset: auto;
    z-index: var(--klc-z-index-toast, 1150);
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: visible;
    pointer-events: none;
    /* 关闭态（无 popover 支持时）也保持可见，作为常驻的 live region。 */
    display: block;
  }

  .klc-toast-viewport--bottom-end {
    right: var(--klc-space-16, 16px);
    bottom: var(--klc-space-16, 16px);
  }

  .klc-toast-viewport--bottom-center {
    bottom: var(--klc-space-16, 16px);
    left: 50%;
    translate: -50% 0;
  }

  .klc-toast-viewport--top-center {
    top: var(--klc-space-16, 16px);
    left: 50%;
    translate: -50% 0;
  }

  .klc-toast-viewport__list {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--klc-space-8, 8px);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .klc-toast {
    display: flex;
    align-items: center;
    gap: var(--klc-space-12, 12px);
    box-sizing: border-box;
    width: min(360px, calc(100vw - 2 * var(--klc-space-16, 16px)));
    padding: var(--klc-space-8, 8px) var(--klc-space-8, 8px) var(--klc-space-8, 8px)
      var(--klc-space-12, 12px);
    border-radius: var(--klc-radius-md, 8px);
    background: var(--klc-color-ui-surface);
    box-shadow: var(--klc-elevation-3), var(--klc-elevation-hairline);
    color: var(--klc-color-ui-text);
    pointer-events: auto;
  }

  .klc-toast--danger {
    box-shadow:
      var(--klc-elevation-3),
      inset 3px 0 0 var(--klc-color-ui-danger-text);
  }

  .klc-toast--success {
    box-shadow:
      var(--klc-elevation-3),
      inset 3px 0 0 var(--klc-color-ui-success);
  }

  .klc-toast__text {
    flex: 1 1 auto;
    min-width: 0;
  }

  .klc-toast__message,
  .klc-toast__description {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .klc-toast__message {
    font-size: var(--klc-text-label-13-font-size, 13px);
    font-weight: var(--klc-text-label-13-font-weight, 500);
    line-height: var(--klc-text-label-13-line-height, 18px);
  }

  .klc-toast__description {
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: var(--klc-text-12-line-height, 16px);
  }

  .klc-toast__action,
  .klc-toast__close {
    flex: 0 0 auto;
    display: inline-grid;
    place-items: center;
    border: 0;
    border-radius: var(--klc-radius-sm, 6px);
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  .klc-toast__action {
    min-height: var(--klc-density-compact, 24px);
    padding: 0 var(--klc-space-8, 8px);
    color: var(--klc-color-ui-accent);
    font-size: var(--klc-text-label-13-font-size, 13px);
    font-weight: 600;
  }

  .klc-toast__close {
    width: var(--klc-density-compact, 24px);
    height: var(--klc-density-compact, 24px);
    padding: 0;
    color: var(--klc-color-ui-muted);
  }

  .klc-toast__close svg {
    width: 14px;
    height: 14px;
  }

  .klc-toast__action:hover,
  .klc-toast__close:hover {
    background: var(--klc-color-ui-hover);
  }

  .klc-toast__action:focus-visible,
  .klc-toast__close:focus-visible {
    outline: 2px solid var(--klc-color-ui-accent);
    outline-offset: 1px;
  }

  .klc-toast-enter-active,
  .klc-toast-leave-active {
    transition:
      opacity var(--klc-motion-dur-toast, 400ms) var(--klc-motion-ease-expo, ease-out),
      translate var(--klc-motion-dur-toast, 400ms) var(--klc-motion-ease-expo, ease-out);
  }

  .klc-toast-leave-active {
    transition-duration: var(--klc-motion-dur-fast, 160ms);
  }

  .klc-toast-enter-from {
    opacity: 0;
    translate: 0 8px;
  }

  .klc-toast-leave-to {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .klc-toast-enter-active,
    .klc-toast-leave-active {
      transition: opacity var(--klc-motion-dur-fast, 160ms) linear;
    }

    .klc-toast-enter-from {
      translate: none;
    }
  }
</style>
