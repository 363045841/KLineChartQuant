<template>
  <Teleport :to="teleportTarget">
    <dialog
      v-if="rendered"
      ref="dialog"
      class="base-modal"
      :class="{ 'base-modal--closing': closing }"
      :style="modalStyle"
      @cancel.prevent="closeDialog(true)"
      @click.self="closeOnOverlay && closeDialog(true)"
      @close="handleClose"
    >
    <div v-if="$slots.header || $slots.title || title" class="base-header">
      <slot name="header">
        <div class="base-header-left">
          <span class="base-title"><slot name="title">{{ title }}</slot></span>
          <span v-if="subtitle" class="base-subtitle">{{ subtitle }}</span>
        </div>
      </slot>
      <div v-if="showClose" class="base-header-right">
        <slot name="header-extra" />
        <button class="base-close-btn" @click="closeDialog(true)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget.js'

  const props = withDefaults(
    defineProps<{
      show: boolean
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
    }>(),
    {
      title: '',
      subtitle: '',
      width: 'min(92vw, 400px)',
      maxWidth: '',
      maxHeight: 'min(600px, calc(100vh - 48px))',
      overlayPadding: '24px',
      bodyPadding: '16px 20px',
      bodyScrollable: true,
      footerAlign: 'flex-end',
      closeOnOverlay: true,
      showClose: true,
    },
  )

  const emit = defineEmits<{
    close: []
  }>()

  const teleportTarget = useFullscreenTeleportTarget()
  const dialog = ref<HTMLDialogElement>()
  const rendered = ref(props.show)
  const closing = ref(false)
  const closeDuration = 160
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let intentionalClose = false

  const modalStyle = computed(() => ({
    width: props.width,
    maxWidth: props.maxWidth
      ? `min(${props.maxWidth}, calc(100vw - ${props.overlayPadding} - ${props.overlayPadding}))`
      : `calc(100vw - ${props.overlayPadding} - ${props.overlayPadding})`,
    maxHeight: `min(${props.maxHeight}, calc(100vh - ${props.overlayPadding} - ${props.overlayPadding}))`,
  }))

  const openDialog = async () => {
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = undefined
    closing.value = false
    rendered.value = true
    await nextTick()
    if (dialog.value && !dialog.value.open) dialog.value.showModal()
  }

  const closeDialog = (notifyParent: boolean) => {
    if (closing.value) return
    if (!dialog.value?.open) {
      rendered.value = false
      if (notifyParent) emit('close')
      return
    }

    closing.value = true
    closeTimer = setTimeout(() => {
      intentionalClose = true
      dialog.value?.close()
      intentionalClose = false
      rendered.value = false
      closing.value = false
      if (notifyParent) emit('close')
    }, closeDuration)
  }

  watch(
    () => props.show,
    (show) => (show ? openDialog() : closeDialog(false)),
  )
  onMounted(() => props.show && openDialog())
  onBeforeUnmount(() => closeTimer && clearTimeout(closeTimer))

  const handleClose = () => {
    rendered.value = false
    closing.value = false
    if (!intentionalClose) emit('close')
  }
</script>

<style scoped>
  .base-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    margin: 0;
    transform: translate(-50%, -50%);
    background: var(--klc-color-ui-surface);
    color: var(--klc-color-ui-text, #edf2f3);
    border: 0;
    border-radius: 10px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 0;
    animation: dialog-enter 0.22s ease-out;
    transition:
      opacity 0.16s ease-in,
      transform 0.16s ease-in;
  }

  .base-modal::backdrop {
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    transition:
      background 0.16s ease-in,
      backdrop-filter 0.16s ease-in;
  }

  .base-modal--closing {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.98) translateY(8px);
  }

  .base-modal--closing::backdrop {
    background: transparent;
    backdrop-filter: blur(0);
  }

  @keyframes dialog-enter {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.96) translateY(-10px);
    }
  }

  .base-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px 14px 20px;
    flex-shrink: 0;
    gap: 12px;
  }

  .base-header-left {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .base-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--klc-color-ui-text);
    line-height: 1.35;
    white-space: nowrap;
  }

  .base-subtitle {
    font-size: 11px;
    color: var(--klc-color-ui-muted);
    line-height: 1.3;
    white-space: nowrap;
  }

  .base-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .base-close-btn {
    background: var(--klc-color-ui-hover);
    border: 0;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--klc-color-ui-muted);
    transition:
      background 0.15s,
      color 0.15s;
    padding: 0;
  }

  .base-close-btn:hover {
    background: var(--klc-color-ui-border);
    color: var(--klc-color-ui-text);
  }

  .base-close-btn svg {
    width: 14px;
    height: 14px;
  }

  .base-subheader {
    flex-shrink: 0;
    padding: 16px 20px;
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
    gap: 8px;
    padding: 12px 20px;
    flex-shrink: 0;
  }

  /* ── Responsive ── */
  @media (max-width: 480px) {
    .base-modal {
      min-width: 0;
      width: 100% !important;
      max-height: calc(100vh - 24px);
      border-radius: 10px;
    }
  }
</style>
