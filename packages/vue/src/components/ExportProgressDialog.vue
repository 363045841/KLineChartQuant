<template>
  <Teleport :to="teleportTarget">
    <Transition name="overlay">
      <div v-if="progress" class="export-overlay">
        <Transition name="modal">
          <div class="export-modal" @click.stop>
            <div class="export-header">
              <span class="export-title">导出数据</span>
              <button class="export-close-btn" @click="emit('close')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="export-body">
              <div class="export-label">{{ progress.label }}</div>
              <div class="export-bar-track">
                <div
                  class="export-bar-fill"
                  :style="{ width: pct + '%' }"
                />
              </div>
              <div class="export-counter">{{ progress.current }} / {{ progress.total }}</div>
              <button
                v-if="progress.current === progress.total"
                class="export-done-btn"
                @click="emit('close')"
              >完成</button>
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

const props = defineProps<{
  progress: { current: number; total: number; label: string } | null
}>()

const emit = defineEmits<{
  close: []
}>()

const teleportTarget = useFullscreenTeleportTarget()

const pct = computed(() => {
  if (!props.progress || props.progress.total <= 0) return 0
  return Math.min(100, Math.round((props.progress.current / props.progress.total) * 100))
})
</script>

<style scoped>
.export-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.export-modal {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.15);
  min-width: 320px;
  max-width: 380px;
  width: min(88vw, 380px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.export-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px 0 20px;
}

.export-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--klc-color-foreground);
  line-height: 1.35;
}

.export-close-btn {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 7px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--klc-color-axis-text);
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
  padding: 0;
}

.export-close-btn:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-line);
}

.export-close-btn svg {
  width: 14px;
  height: 14px;
}

.export-body {
  padding: 16px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.export-label {
  font-size: 13px;
  color: var(--klc-color-axis-text);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.export-bar-track {
  width: 100%;
  height: 6px;
  background: var(--klc-color-grid-major);
  border-radius: 999px;
  overflow: hidden;
}

.export-bar-fill {
  height: 100%;
  background: var(--klc-color-foreground);
  border-radius: 999px;
  transition: width 0.25s ease;
}

.export-counter {
  font-size: 12px;
  color: var(--klc-color-axis-text);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.export-done-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 20px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  color: var(--klc-color-background);
  align-self: center;
  transition:
    background 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
  line-height: 1;
  white-space: nowrap;
}

.export-done-btn:hover {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.export-done-btn:active {
  transform: translateY(0);
  box-shadow: none;
}

.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

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
</style>
