<template>
  <Teleport :to="teleportTarget">
    <Transition name="overlay">
      <div
        v-if="show"
        class="base-overlay"
        :style="{ zIndex, padding: overlayPadding }"
        @click="closeOnOverlay ? emit('close') : undefined"
      >
        <Transition :name="modalTransitionName">
          <div
            class="base-modal"
            :style="modalStyle"
            @click.stop
          >
            <div v-if="$slots.header || title" class="base-header">
              <slot name="header">
                <div class="base-header-left">
                  <span class="base-title">{{ title }}</span>
                  <span v-if="subtitle" class="base-subtitle">{{ subtitle }}</span>
                </div>
              </slot>
              <div v-if="showClose" class="base-header-right">
                <slot name="header-extra" />
                <button class="base-close-btn" @click="emit('close')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div v-if="$slots.subheader" class="base-subheader">
              <slot name="subheader" />
            </div>

            <div class="base-body" :style="{ padding: bodyPadding }">
              <slot />
            </div>

            <div v-if="$slots.footer" class="base-footer" :style="{ justifyContent: footerAlign }">
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'

const props = withDefaults(
  defineProps<{
    show: boolean
    title?: string
    subtitle?: string
    zIndex?: number
    width?: string
    maxWidth?: string
    maxHeight?: string
    overlayPadding?: string
    bodyPadding?: string
    footerAlign?: 'flex-end' | 'center' | 'flex-start' | 'space-between'
    closeOnOverlay?: boolean
    showClose?: boolean
    transitionVariant?: 'default' | 'compact'
  }>(),
  {
    title: '',
    subtitle: '',
    zIndex: 1000,
    width: 'min(92vw, 400px)',
    maxWidth: '',
    maxHeight: 'min(600px, calc(100vh - 48px))',
    overlayPadding: '24px',
    bodyPadding: '16px 20px',
    footerAlign: 'flex-end',
    closeOnOverlay: true,
    showClose: true,
    transitionVariant: 'default',
  },
)

const emit = defineEmits<{
  close: []
}>()

const teleportTarget = useFullscreenTeleportTarget()

const modalTransitionName = computed(() =>
  props.transitionVariant === 'compact' ? 'modal-compact' : 'modal',
)

const modalStyle = computed(() => ({
  width: props.width,
  maxWidth: props.maxWidth || undefined,
  maxHeight: props.maxHeight,
}))
</script>

<style scoped>
.base-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.base-modal {
  background: var(--klc-color-background);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.base-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px 14px 20px;
  background: var(--klc-color-background);
  border-bottom: 1px solid var(--klc-color-grid-major);
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
  color: var(--klc-color-foreground);
  line-height: 1.35;
}

.base-subtitle {
  font-size: 11px;
  color: var(--klc-color-axis-text);
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
  background: var(--klc-color-background);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 7px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--klc-color-axis-text);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  padding: 0;
}

.base-close-btn:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-line);
}

.base-close-btn svg {
  width: 14px;
  height: 14px;
}

.base-subheader {
  flex-shrink: 0;
  padding: 16px 20px;
  background: var(--klc-color-background);
  border-bottom: 1px solid var(--klc-color-grid-major);
}

.base-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--klc-color-background);
}

.base-body::-webkit-scrollbar {
  width: 8px;
}

.base-body::-webkit-scrollbar-track {
  background: var(--klc-color-background);
}

.base-body::-webkit-scrollbar-thumb {
  background: var(--klc-color-axis-line);
  border: 2px solid var(--klc-color-background);
  border-radius: 999px;
}

.base-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  background: var(--klc-color-background);
  border-top: 1px solid var(--klc-color-grid-major);
  flex-shrink: 0;
}

/* ── Overlay transition ── */
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

/* ── Modal transition (default variant) ── */
.modal-enter-active {
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active {
  transition: all 0.16s ease-in;
}

.modal-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(-10px);
}

.modal-leave-to {
  opacity: 0;
  transform: scale(0.98) translateY(8px);
}

/* ── Modal transition (compact variant) ── */
.modal-compact-enter-active {
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-compact-leave-active {
  transition: all 0.16s ease-in;
}

.modal-compact-enter-from {
  opacity: 0;
  transform: scale(0.88) translateY(-16px);
}

.modal-compact-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(8px);
}

/* ── Responsive ── */
@media (max-width: 480px) {
  .base-overlay {
    padding: 12px;
    align-items: flex-end;
  }

  .base-modal {
    min-width: 0;
    width: 100% !important;
    max-height: calc(100vh - 24px);
    border-radius: 10px;
  }
}
</style>
