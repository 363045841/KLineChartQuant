<template>
  <!-- z-index 高于指标选择弹窗(1000)，避免被其 Teleport 重排后遮挡 -->
  <BaseModal
    :show="visible"
    :title="indicatorName"
    subtitle="参数设置"
    width="90vw"
    max-width="420px"
    transition-variant="compact"
    overlay-padding="0"
    footer-align="space-between"
    :z-index="1100"
    @close="$emit('close')"
  >
    <template #header-extra>
      <button
        type="button"
        class="toggle-desc-btn"
        :class="{ active: showDescription }"
        title="显示/隐藏说明"
        aria-label="显示或隐藏参数说明"
        :aria-pressed="showDescription"
        @click="showDescription = !showDescription"
      >
        <IconTablerInfoCircle aria-hidden="true" />
      </button>
    </template>

    <Transition name="slide">
      <div v-if="showDescription && indicatorDescription" class="indicator-description">
        <p>{{ indicatorDescription }}</p>
      </div>
    </Transition>

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
            <span v-if="param.min !== undefined || param.max !== undefined" class="param-range">
              {{ param.min ?? '-∞' }} ~ {{ param.max ?? '+∞' }}
            </span>
          </label>
          <div class="input-wrapper">
            <button
              type="button"
              class="stepper-btn"
              aria-label="减少"
              :disabled="param.min !== undefined && (localValues[param.key] ?? 0) <= param.min"
              @click="step(param, -1)"
            >
              <IconTablerMinus aria-hidden="true" />
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
              type="button"
              class="stepper-btn"
              aria-label="增加"
              :disabled="param.max !== undefined && (localValues[param.key] ?? 0) >= param.max"
              @click="step(param, 1)"
            >
              <IconTablerPlus aria-hidden="true" />
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

    <template #footer>
      <BaseButton @click="onReset">重置</BaseButton>
      <div class="footer-right">
        <BaseButton @click="$emit('close')">取消</BaseButton>
        <BaseButton @click="onConfirm">确定</BaseButton>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'

  import IconTablerInfoCircle from '~icons/tabler/info-circle'
  import IconTablerMinus from '~icons/tabler/minus'
  import IconTablerPlus from '~icons/tabler/plus'

  import BaseButton from './BaseButton.vue'
  import BaseModal from './BaseModal.vue'

  interface ParamConfig {
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

  watch(
    () => props.values,
    (newValues) => {
      localValues.value = { ...newValues }
    },
    { deep: true, immediate: true },
  )

  watch(
    () => props.visible,
    (visible) => {
      if (visible) localValues.value = { ...props.values }
    },
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
  /* ── 指标描述 ── */
  .indicator-description {
    padding: 8px 12px;
    background: var(--klc-color-ui-control-background);
    border-radius: 6px;
    margin-bottom: 12px;
  }

  .indicator-description p {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--klc-color-ui-muted);
  }

  /* ── 体部 ── */
  .params-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .param-item {
    padding: 8px 12px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid transparent;
    transition: background 0.15s ease;
  }

  .param-item:has(.param-input:focus) {
    background: var(--klc-color-ui-hover);
  }

  .param-item.has-desc {
    padding: 8px 12px 6px;
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
    color: var(--klc-color-ui-text);
  }

  .param-range {
    font-size: 11px;
    color: var(--klc-color-ui-muted);
  }

  /* ── 参数描述 ── */
  .param-description {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dashed var(--klc-color-ui-border);
    font-size: 11px;
    line-height: 1.4;
    color: var(--klc-color-ui-muted);
  }

  /* ── 描述切换按钮 ── */
  .toggle-desc-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .toggle-desc-btn:hover {
    background: var(--klc-color-ui-border);
    color: var(--klc-color-ui-text);
  }

  .toggle-desc-btn.active {
    color: var(--klc-color-ui-accent);
  }

  .toggle-desc-btn svg {
    width: 15px;
    height: 15px;
  }

  /* ── 步进输入框 ── */
  .input-wrapper {
    display: flex;
    align-items: stretch;
    height: 30px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--klc-color-ui-control-background);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .input-wrapper:focus-within {
    border-color: var(--klc-color-ui-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-ui-accent) 24%, transparent);
  }

  .stepper-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .stepper-btn:hover:not(:disabled) {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .stepper-btn:disabled {
    color: var(--klc-color-ui-border);
    cursor: not-allowed;
  }

  .stepper-btn svg {
    width: 14px;
    height: 14px;
  }

  .param-input {
    width: auto;
    field-sizing: content;
    min-width: 60px;
    padding: 0 8px;
    border: none;
    border-left: 1px solid var(--klc-color-ui-border);
    border-right: 1px solid var(--klc-color-ui-border);
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    color: var(--klc-color-ui-text);
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
  .footer-right {
    display: flex;
    gap: 8px;
  }

  /* ── 动画 ── */
  .slide-enter-active,
  .slide-leave-active {
    transition: all 0.2s ease;
    overflow: hidden;
    max-height: 200px;
  }

  .slide-enter-from,
  .slide-leave-to {
    opacity: 0;
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    margin-top: 0;
    margin-bottom: 0;
  }
</style>
