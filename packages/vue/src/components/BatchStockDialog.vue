<template>
  <Teleport :to="teleportTarget">
    <Transition name="overlay">
      <div v-if="show" class="batch-overlay" @click="emit('close')">
        <Transition name="modal">
          <div class="batch-modal" @click.stop>
            <div class="batch-header">
              <span class="batch-title">批量设置股票代码</span>
              <button class="batch-close-btn" @click="emit('close')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="batch-body">
              <textarea
                v-model="codesText"
                class="batch-textarea"
                placeholder="每行一个股票代码&#10;例如:&#10;000001&#10;600036&#10;002415"
                rows="8"
                spellcheck="false"
              />
            </div>

            <div class="batch-footer">
              <button class="batch-btn batch-btn--cancel" @click="emit('close')">取消</button>
              <button class="batch-btn batch-btn--confirm" @click="onApply">应用</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  apply: [codes: string[]]
}>()

const teleportTarget = useFullscreenTeleportTarget()

const codes = ref<string[]>([])

const codesText = computed({
  get: () => codes.value.join('\n'),
  set: (val: string) => {
    codes.value = val
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  },
})

function onApply() {
  if (codes.value.length === 0) return
  emit('apply', codes.value)
  emit('close')
}
</script>

<style scoped>
.batch-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.batch-modal {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.15);
  min-width: 360px;
  max-width: 400px;
  width: min(92vw, 400px);
  max-height: min(600px, calc(100vh - 48px));
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.batch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px 14px 20px;
  background: var(--klc-color-background);
  border-bottom: 1px solid var(--klc-color-grid-major);
  flex-shrink: 0;
}

.batch-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--klc-color-foreground);
  line-height: 1.35;
}

.batch-close-btn {
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

.batch-close-btn:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-line);
}

.batch-close-btn svg {
  width: 14px;
  height: 14px;
}

.batch-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.batch-textarea {
  width: 100%;
  min-height: 160px;
  padding: 10px 12px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 6px;
  background: var(--klc-color-background);
  color: var(--klc-color-foreground);
  font-size: 13px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.batch-textarea:focus {
  border-color: var(--klc-color-axis-text);
}

.batch-textarea::placeholder {
  color: var(--klc-color-axis-text);
  opacity: 0.5;
}

.batch-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  background: var(--klc-color-background);
  border-top: 1px solid var(--klc-color-grid-major);
  flex-shrink: 0;
}

.batch-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  height: 32px;
  padding: 0 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
  line-height: 1;
  white-space: nowrap;
}

.batch-btn--cancel {
  background: transparent;
  border-color: var(--klc-color-axis-line);
  color: var(--klc-color-axis-text);
}

.batch-btn--cancel:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-text);
}

.batch-btn--confirm {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  color: var(--klc-color-background);
}

.batch-btn--confirm:hover {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.batch-btn--confirm:active {
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

@media (max-width: 480px) {
  .batch-overlay {
    padding: 12px;
    align-items: flex-end;
  }

  .batch-modal {
    min-width: 0;
    width: 100%;
    max-height: calc(100vh - 24px);
    border-radius: 10px;
  }

  .batch-header,
  .batch-body,
  .batch-footer {
    padding-left: 16px;
    padding-right: 16px;
  }

  .batch-footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>
