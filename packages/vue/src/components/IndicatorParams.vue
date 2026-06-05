<template>
  <Teleport :to="teleportTarget">
    <Transition name="overlay">
      <div v-if="visible" class="params-overlay" @click="$emit('close')">
        <Transition name="modal">
          <div class="indicator-params" @click.stop>
            <!-- 头部 -->
            <div class="params-header">
              <div class="header-left">
                <span class="params-title">{{ indicatorName }}</span>
                <span class="params-subtitle">参数设置</span>
              </div>
              <div class="header-right">
                <button
                  class="toggle-desc-btn"
                  :class="{ active: showDescription }"
                  @click="showDescription = !showDescription"
                  title="显示/隐藏说明"
                >
                  <svg viewBox="0 0 1024 1024">
                    <path d="M512 97.52381c228.912762 0 414.47619 185.563429 414.47619 414.47619s-185.563429 414.47619-414.47619 414.47619S97.52381 740.912762 97.52381 512 283.087238 97.52381 512 97.52381z m0 73.142857C323.486476 170.666667 170.666667 323.486476 170.666667 512s152.81981 341.333333 341.333333 341.333333 341.333333-152.81981 341.333333-341.333333S700.513524 170.666667 512 170.666667z m36.571429 268.190476v292.571428h-73.142858V438.857143h73.142858z m0-121.904762v73.142857h-73.142858v-73.142857h73.142858z" fill="currentColor" />
                  </svg>
                </button>
                <button class="params-close" @click="$emit('close')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- 指标描述 -->
            <Transition name="slide">
              <div v-if="showDescription && indicatorDescription" class="indicator-description">
                <p>{{ indicatorDescription }}</p>
              </div>
            </Transition>

            <!-- 体部 -->
            <div class="params-body">
              <div
                v-for="param in params"
                :key="param.key"
                class="param-item"
                :class="{ 'has-desc': showDescription && param.description }"
              >
                <div class="param-header">
                  <label class="param-label">
                    <span class="param-label-text">{{ param.label }}</span>
                    <span
                      v-if="param.min !== undefined || param.max !== undefined"
                      class="param-range"
                    >
                      {{ param.min ?? '-∞' }} ~ {{ param.max ?? '+∞' }}
                    </span>
                  </label>
                  <div class="input-wrapper">
                    <button
                      class="stepper-btn"
                      :disabled="param.min !== undefined && (localValues[param.key] ?? 0) <= param.min"
                      @click="step(param, -1)"
                    >
                      −
                    </button>
                    <input
                      v-if="param.type === 'number'"
                      type="number"
                      class="param-input"
                      :value="localValues[param.key]"
                      :min="param.min"
                      :max="param.max"
                      :step="param.step || 1"
                      @input="onInput(param.key, $event)"
                    />
                    <button
                      class="stepper-btn"
                      :disabled="param.max !== undefined && (localValues[param.key] ?? 0) >= param.max"
                      @click="step(param, 1)"
                    >
                      +
                    </button>
                  </div>
                </div>
                <Transition name="slide">
                  <div v-if="showDescription && param.description" class="param-description">
                    {{ param.description }}
                  </div>
                </Transition>
              </div>
            </div>

            <!-- 底部 -->
            <div class="params-footer">
              <button class="params-btn reset" @click="onReset">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                重置
              </button>
              <div class="footer-right">
                <button class="params-btn cancel" @click="$emit('close')">取消</button>
                <button class="params-btn confirm" @click="onConfirm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  确定
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'

export interface ParamConfig {
  key: string
  label: string
  type: 'number'
  min?: number
  max?: number
  step?: number
  default?: number
  description?: string
}

const props = defineProps<{
  visible: boolean
  indicatorId: string
  indicatorName: string
  indicatorDescription?: string
  params: ParamConfig[]
  values: Record<string, number>
}>()

const emit = defineEmits<{
  close: []
  confirm: [values: Record<string, number>]
}>()

const localValues = ref<Record<string, number>>({ ...props.values })
const showDescription = ref(true)

const teleportTarget = useFullscreenTeleportTarget()

watch(
  () => props.values,
  (newValues) => {
    localValues.value = { ...newValues }
  },
  { deep: true, immediate: true }
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) localValues.value = { ...props.values }
  }
)

function onInput(key: string, event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  if (!isNaN(value)) localValues.value[key] = value
}

function step(param: ParamConfig, direction: 1 | -1) {
  const s = param.step || 1
  let next = (localValues.value[param.key] || 0) + direction * s
  if (param.min !== undefined) next = Math.max(param.min, next)
  if (param.max !== undefined) next = Math.min(param.max, next)
  localValues.value[param.key] = parseFloat(next.toFixed(10))
}

function onReset() {
  const defaults: Record<string, number> = {}
  props.params.forEach((p) => {
    defaults[p.key] = p.default ?? props.values[p.key] ?? 0
  })
  localValues.value = defaults
}

function onConfirm() {
  emit('confirm', { ...localValues.value })
}
</script>

<style scoped>
/* ── 遮罩 ── */
.params-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* ── 弹窗 ── */
.indicator-params {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
  min-width: 340px;
  max-width: 420px;
  width: 90vw;
  overflow: hidden;
}

/* ── 头部 ── */
.params-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--klc-color-background);
  border-bottom: 1px solid var(--klc-color-grid-major);
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.params-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--klc-color-foreground);
  letter-spacing: 0.2px;
}

.params-subtitle {
  font-size: 11px;
  color: var(--klc-color-axis-text);
}

.toggle-desc-btn {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--klc-color-axis-text);
  transition: all 0.2s;
  padding: 0;
}

.toggle-desc-btn:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-line);
}

.toggle-desc-btn.active {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  color: var(--klc-color-background);
}

.toggle-desc-btn svg {
  width: 14px;
  height: 14px;
}

.params-close {
  background: var(--klc-color-tag-bg-white);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--klc-color-axis-text);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  padding: 0;
}

.params-close:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-line);
}

.params-close svg {
  width: 14px;
  height: 14px;
}

/* ── 指标描述 ── */
.indicator-description {
  padding: 12px 20px;
  background: color-mix(in srgb, var(--klc-color-alert-active) 10%, var(--klc-color-background));
  border-bottom: 1px solid color-mix(in srgb, var(--klc-color-alert-active) 20%, transparent);
}

.indicator-description p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--klc-color-alert-active);
}

/* ── 体部 ── */
.params-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.param-item {
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--klc-color-background);
  border: 1px solid var(--klc-color-grid-major);
  transition: border-color 0.2s;
}

.param-item:has(.param-input:focus) {
  border-color: var(--klc-color-axis-text);
}

.param-item.has-desc {
  padding: 10px 14px 8px;
}

.param-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.param-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.param-label-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--klc-color-foreground);
}

.param-range {
  font-size: 11px;
  color: var(--klc-color-axis-text);
}

/* ── 参数描述 ── */
.param-description {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--klc-color-border-button);
  font-size: 11px;
  line-height: 1.5;
  color: var(--klc-color-axis-text);
}

/* ── 步进输入框 ── */
.input-wrapper {
  display: flex;
  align-items: stretch;
  height: 32px;
  border: 1px solid var(--klc-color-axis-line);
  border-radius: 7px;
  overflow: hidden;
  background: var(--klc-color-tag-bg-white);
  transition: border-color 0.2s;
}

.input-wrapper:focus-within {
  border-color: var(--klc-color-axis-text);
}

.stepper-btn {
  width: 28px;
  background: var(--klc-color-grid-minor);
  border: none;
  cursor: pointer;
  font-size: 15px;
  font-weight: 400;
  color: var(--klc-color-axis-text);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
  line-height: 1;
}

.stepper-btn:hover:not(:disabled) {
  background: var(--klc-color-border-button);
  color: var(--klc-color-foreground);
}

.stepper-btn:disabled {
  color: var(--klc-color-axis-line);
  cursor: not-allowed;
}

.param-input {
  width: 60px;
  border: none;
  border-left: 1px solid var(--klc-color-grid-major);
  border-right: 1px solid var(--klc-color-grid-major);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  color: var(--klc-color-foreground);
  background: transparent;
  -moz-appearance: textfield;
  appearance: textfield;
}

.param-input::-webkit-inner-spin-button,
.param-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}

.param-input:focus {
  outline: none;
}

/* ── 底部 ── */
.params-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--klc-color-background);
  border-top: 1px solid var(--klc-color-grid-major);
}

.footer-right {
  display: flex;
  gap: 8px;
}

.params-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
  line-height: 1.4;
}

.params-btn svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

/* 重置 */
.params-btn.reset {
  background: transparent;
  border-color: var(--klc-color-axis-line);
  color: var(--klc-color-axis-text);
}

.params-btn.reset:hover {
  border-color: #c0392b;
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.08);
}

/* 取消 */
.params-btn.cancel {
  background: transparent;
  border-color: var(--klc-color-axis-line);
  color: var(--klc-color-axis-text);
}

.params-btn.cancel:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-text);
}

/* 确定 */
.params-btn.confirm {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  color: var(--klc-color-background);
}

.params-btn.confirm:hover {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.params-btn.confirm:active {
  transform: translateY(0);
  box-shadow: none;
}

/* ── 动画 ── */
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
  transform: scale(0.88) translateY(-16px);
}

.modal-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(8px);
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
}
</style>
