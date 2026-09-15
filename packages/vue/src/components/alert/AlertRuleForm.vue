<template>
  <div class="rule-form">
    <!-- 规则名称 -->
    <div class="rule-form-field">
      <label class="rule-form-label">规则名称</label>
      <input
        v-model="draftName"
        class="rule-form-input"
        placeholder="例如：价格突破100"
        maxlength="40"
      />
    </div>

    <!-- 条件类型 -->
    <div class="rule-form-field">
      <label class="rule-form-label">条件类型</label>
      <div class="rule-form-kinds">
        <button
          v-for="kind in predicateKinds"
          :key="kind.value"
          class="rule-form-kind"
          :class="{ active: draftKind === kind.value }"
          @click="draftKind = kind.value"
        >
          <span class="rule-form-kind-icon" v-html="kind.icon"></span>
          {{ kind.label }}
        </button>
      </div>
    </div>

    <!-- 参数区 -->
    <div class="rule-form-params-card">
      <template v-if="draftKind === 'price-cross'">
        <div class="rule-form-params-row">
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">触发价格</label>
            <div class="rule-form-stepper">
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="减少"
                :disabled="!canStep(pf.price, 0.01, -1)"
                @click="pf.price = stepped(pf.price, 0.01, -1)"
              >
                <IconTablerMinus aria-hidden="true" />
              </button>
              <input
                v-model.number="pf.price"
                class="rule-form-input"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="增加"
                @click="pf.price = stepped(pf.price, 0.01, 1)"
              >
                <IconTablerPlus aria-hidden="true" />
              </button>
            </div>
          </div>
          <div class="rule-form-field">
            <label class="rule-form-label">方向</label>
            <div class="rule-form-directions">
              <button
                v-for="d in crossDirections"
                :key="d.value"
                class="rule-form-direction"
                :class="{ active: pf.direction === d.value }"
                @click="pf.direction = d.value"
              >
                <component :is="d.icon" class="rule-form-direction-icon" aria-hidden="true" />
                {{ d.label }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-if="draftKind === 'price-in-range' || draftKind === 'price-out-of-range'">
        <div class="rule-form-params-row">
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">最小值</label>
            <div class="rule-form-stepper">
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="减少"
                :disabled="!canStep(pf.min, 0.01, -1)"
                @click="pf.min = stepped(pf.min, 0.01, -1)"
              >
                <IconTablerMinus aria-hidden="true" />
              </button>
              <input
                v-model.number="pf.min"
                class="rule-form-input"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="增加"
                @click="pf.min = stepped(pf.min, 0.01, 1)"
              >
                <IconTablerPlus aria-hidden="true" />
              </button>
            </div>
          </div>
          <span class="rule-form-range-sep">—</span>
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">最大值</label>
            <div class="rule-form-stepper">
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="减少"
                :disabled="!canStep(pf.max, 0.01, -1)"
                @click="pf.max = stepped(pf.max, 0.01, -1)"
              >
                <IconTablerMinus aria-hidden="true" />
              </button>
              <input
                v-model.number="pf.max"
                class="rule-form-input"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="增加"
                @click="pf.max = stepped(pf.max, 0.01, 1)"
              >
                <IconTablerPlus aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-if="draftKind === 'indicator-cross'">
        <div class="rule-form-params-row">
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">指标</label>
            <input v-model="pf.indicatorId" class="rule-form-input" placeholder="例如 MA, MACD" />
          </div>
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">阈值</label>
            <div class="rule-form-stepper">
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="减少"
                :disabled="!canStep(pf.threshold, 0.01, -1)"
                @click="pf.threshold = stepped(pf.threshold, 0.01, -1)"
              >
                <IconTablerMinus aria-hidden="true" />
              </button>
              <input
                v-model.number="pf.threshold"
                class="rule-form-input"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="增加"
                @click="pf.threshold = stepped(pf.threshold, 0.01, 1)"
              >
                <IconTablerPlus aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <div class="rule-form-field">
          <label class="rule-form-label">方向</label>
          <div class="rule-form-directions">
            <button
              v-for="d in crossDirections"
              :key="d.value"
              class="rule-form-direction"
              :class="{ active: pf.direction === d.value }"
              @click="pf.direction = d.value"
            >
              <component :is="d.icon" class="rule-form-direction-icon" aria-hidden="true" />
              {{ d.label }}
            </button>
          </div>
        </div>
      </template>

      <template v-if="draftKind === 'indicator-cross-indicator'">
        <div class="rule-form-params-row rule-form-params-row--cross">
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">指标 A</label>
            <input v-model="pf.aId" class="rule-form-input" placeholder="例如 MA" />
          </div>
          <div class="rule-form-field">
            <label class="rule-form-label">关系</label>
            <div class="rule-form-directions">
              <button
                v-for="d in pairDirections"
                :key="d.value"
                class="rule-form-direction"
                :class="{ active: pf.direction === d.value }"
                @click="pf.direction = d.value"
              >
                <component :is="d.icon" class="rule-form-direction-icon" aria-hidden="true" />
                {{ d.label }}
              </button>
            </div>
          </div>
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">指标 B</label>
            <input v-model="pf.bId" class="rule-form-input" placeholder="例如 MACD" />
          </div>
        </div>
      </template>

      <template v-if="draftKind === 'volume-spike'">
        <div class="rule-form-params-row">
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">倍数</label>
            <div class="rule-form-stepper">
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="减少"
                :disabled="!canStep(pf.multipleOfAvg, 0.1, -1, 1)"
                @click="pf.multipleOfAvg = stepped(pf.multipleOfAvg, 0.1, -1, 1)"
              >
                <IconTablerMinus aria-hidden="true" />
              </button>
              <div class="rule-form-stepper-field">
                <input
                  v-model.number="pf.multipleOfAvg"
                  class="rule-form-input"
                  type="number"
                  step="0.1"
                  min="1"
                  placeholder="2.0"
                />
                <span class="rule-form-input-suffix">×</span>
              </div>
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="增加"
                @click="pf.multipleOfAvg = stepped(pf.multipleOfAvg, 0.1, 1, 1)"
              >
                <IconTablerPlus aria-hidden="true" />
              </button>
            </div>
          </div>
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">回溯 K 线数</label>
            <div class="rule-form-stepper">
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="减少"
                :disabled="!canStep(pf.lookbackBars, 1, -1, 1)"
                @click="pf.lookbackBars = stepped(pf.lookbackBars, 1, -1, 1)"
              >
                <IconTablerMinus aria-hidden="true" />
              </button>
              <div class="rule-form-stepper-field">
                <input
                  v-model.number="pf.lookbackBars"
                  class="rule-form-input"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="20"
                />
                <span class="rule-form-input-suffix">根</span>
              </div>
              <button
                type="button"
                class="rule-form-stepper-btn"
                aria-label="增加"
                @click="pf.lookbackBars = stepped(pf.lookbackBars, 1, 1, 1)"
              >
                <IconTablerPlus aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 高级选项 -->
    <div class="rule-form-advanced">
      <div class="rule-form-advanced-row">
        <div class="rule-form-advanced-info">
          <span class="rule-form-advanced-label">单次触发</span>
          <span class="rule-form-advanced-hint">触发后自动禁用本规则</span>
        </div>
        <ToggleSwitch v-model="draftOneShot" aria-label="单次触发" />
      </div>

      <div class="rule-form-advanced-divider"></div>

      <div class="rule-form-advanced-row">
        <div class="rule-form-advanced-info">
          <span class="rule-form-advanced-label">冷却时间</span>
          <span class="rule-form-advanced-hint">同一规则再次触发的最短间隔</span>
        </div>
        <div class="rule-form-stepper rule-form-stepper--cooldown">
          <button
            type="button"
            class="rule-form-stepper-btn"
            aria-label="减少"
            :disabled="!canStep(draftCooldown, 1000, -1, 0)"
            @click="draftCooldown = stepped(draftCooldown, 1000, -1, 0)"
          >
            <IconTablerMinus aria-hidden="true" />
          </button>
          <div class="rule-form-stepper-field">
            <input
              v-model.number="draftCooldown"
              class="rule-form-input"
              type="number"
              step="1000"
              min="0"
              placeholder="0"
            />
            <span class="rule-form-input-suffix">ms</span>
          </div>
          <button
            type="button"
            class="rule-form-stepper-btn"
            aria-label="增加"
            @click="draftCooldown = stepped(draftCooldown, 1000, 1, 0)"
          >
            <IconTablerPlus aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="rule-form-actions">
      <button class="rule-form-btn rule-form-btn--cancel" @click="$emit('cancel')">取消</button>
      <button class="rule-form-btn rule-form-btn--save" :disabled="!isValid" @click="handleSave">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          class="rule-form-btn-icon"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        保存规则
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type {
    AlertPredicate,
    AlertRule,
    CrossDirection,
    IndicatorCrossPairDirection,
  } from '@363045841yyt/klinechart-core'
  import { computed, reactive, ref } from 'vue'
  import IconTablerArrowDown from '~icons/tabler/arrow-down'
  import IconTablerArrowUp from '~icons/tabler/arrow-up'
  import IconTablerArrowsUpDown from '~icons/tabler/arrows-up-down'
  import IconTablerMinus from '~icons/tabler/minus'
  import IconTablerPlus from '~icons/tabler/plus'
  import ToggleSwitch from '../common/ToggleSwitch.vue'

  const props = defineProps<{ rule?: AlertRule }>()

  const emit = defineEmits<{
    save: [rule: AlertRule]
    cancel: []
  }>()

  const predicateKinds = [
    {
      value: 'price-cross' as const,
      label: '价格穿越',
      icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 10 L8 6 L14 10"/><line x1="8" y1="2" x2="8" y2="14"/></svg>`,
    },
    {
      value: 'price-in-range' as const,
      label: '价格在区间',
      icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="10" height="6" rx="1"/></svg>`,
    },
    {
      value: 'price-out-of-range' as const,
      label: '价格超出区间',
      icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="10" height="6" rx="1"/><line x1="8" y1="2" x2="8" y2="4"/><line x1="8" y1="12" x2="8" y2="14"/></svg>`,
    },
    {
      value: 'indicator-cross' as const,
      label: '指标穿越阈值',
      icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8 Q5 4 8 8 Q11 12 14 8"/><line x1="2" y1="6" x2="14" y2="6" stroke-dasharray="2 2"/></svg>`,
    },
    {
      value: 'indicator-cross-indicator' as const,
      label: '指标交叉',
      icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 11 Q8 2 14 5"/><path d="M2 5 Q8 14 14 11"/></svg>`,
    },
    {
      value: 'volume-spike' as const,
      label: '成交量异常',
      icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="9" width="2" height="5"/><rect x="6" y="6" width="2" height="8"/><rect x="10" y="2" width="2" height="12" fill="currentColor" opacity=".3"/><rect x="10" y="2" width="2" height="12"/></svg>`,
    },
  ]

  const crossDirections = [
    { value: 'up' as const, label: '上穿', icon: IconTablerArrowUp },
    { value: 'down' as const, label: '下穿', icon: IconTablerArrowDown },
    { value: 'any' as const, label: '穿越', icon: IconTablerArrowsUpDown },
  ]

  const pairDirections = [
    { value: 'a-above-b' as const, label: '上穿', icon: IconTablerArrowUp },
    { value: 'a-below-b' as const, label: '下穿', icon: IconTablerArrowDown },
    { value: 'any' as const, label: '交叉', icon: IconTablerArrowsUpDown },
  ]

  const draftName = ref(props.rule?.name ?? '')
  const draftKind = ref<AlertPredicate['kind']>(props.rule?.predicate.kind ?? 'price-cross')
  const draftOneShot = ref(props.rule?.oneShot ?? false)
  const draftCooldown = ref(props.rule?.cooldownMs ?? 0)

  const pf = reactive({
    price: (props.rule?.predicate.kind === 'price-cross'
      ? props.rule.predicate.price
      : 0) as number,
    direction: (props.rule?.predicate.kind === 'price-cross'
      ? props.rule.predicate.direction
      : props.rule?.predicate.kind === 'indicator-cross'
        ? props.rule.predicate.direction
        : props.rule?.predicate.kind === 'indicator-cross-indicator'
          ? props.rule.predicate.direction
          : 'up') as CrossDirection | IndicatorCrossPairDirection,
    min: (props.rule?.predicate.kind === 'price-in-range' ||
    props.rule?.predicate.kind === 'price-out-of-range'
      ? props.rule.predicate.min
      : 0) as number,
    max: (props.rule?.predicate.kind === 'price-in-range' ||
    props.rule?.predicate.kind === 'price-out-of-range'
      ? props.rule.predicate.max
      : 0) as number,
    indicatorId: (props.rule?.predicate.kind === 'indicator-cross'
      ? props.rule.predicate.indicatorId
      : '') as string,
    threshold: (props.rule?.predicate.kind === 'indicator-cross'
      ? props.rule.predicate.threshold
      : 0) as number,
    aId: (props.rule?.predicate.kind === 'indicator-cross-indicator'
      ? props.rule.predicate.aId
      : '') as string,
    bId: (props.rule?.predicate.kind === 'indicator-cross-indicator'
      ? props.rule.predicate.bId
      : '') as string,
    multipleOfAvg: (props.rule?.predicate.kind === 'volume-spike'
      ? props.rule.predicate.multipleOfAvg
      : 2) as number,
    lookbackBars: (props.rule?.predicate.kind === 'volume-spike'
      ? props.rule.predicate.lookbackBars
      : 20) as number,
  })

  /**
   * 按步长增减数值，并在 [min, max] 内钳制，规避浮点误差。
   * @param current 当前值，空值按 0 处理
   * @param step 步长
   * @param direction 1 增加，-1 减少
   * @param min 下界（默认无界）
   * @param max 上界（默认无界）
   * @returns 步进后的数值
   */
  function stepped(
    current: number,
    step: number,
    direction: 1 | -1,
    min = -Infinity,
    max = Infinity,
  ): number {
    const base = Number.isFinite(current) ? current : 0
    const next = Math.min(max, Math.max(min, base + direction * step))
    return parseFloat(next.toFixed(10))
  }

  /**
   * 判断当前值在该方向是否仍可步进，用于按钮禁用态。
   * @param current 当前值
   * @param step 步长
   * @param direction 1 增加，-1 减少
   * @param min 下界（默认无界）
   * @param max 上界（默认无界）
   * @returns 可步进返回 true
   */
  function canStep(
    current: number,
    step: number,
    direction: 1 | -1,
    min = -Infinity,
    max = Infinity,
  ): boolean {
    const base = Number.isFinite(current) ? current : 0
    const next = base + direction * step
    return next >= min && next <= max
  }

  const isValid = computed(() => draftName.value.trim().length > 0)

  function buildPredicate(): AlertPredicate {
    switch (draftKind.value) {
      case 'price-cross':
        return { kind: 'price-cross', price: pf.price, direction: pf.direction as CrossDirection }
      case 'price-in-range':
        return { kind: 'price-in-range', min: pf.min, max: pf.max }
      case 'price-out-of-range':
        return { kind: 'price-out-of-range', min: pf.min, max: pf.max }
      case 'indicator-cross':
        return {
          kind: 'indicator-cross',
          indicatorId: pf.indicatorId,
          threshold: pf.threshold,
          direction: pf.direction as CrossDirection,
        }
      case 'indicator-cross-indicator':
        return {
          kind: 'indicator-cross-indicator',
          aId: pf.aId,
          bId: pf.bId,
          direction: pf.direction as IndicatorCrossPairDirection,
        }
      case 'volume-spike':
        return {
          kind: 'volume-spike',
          multipleOfAvg: pf.multipleOfAvg,
          lookbackBars: pf.lookbackBars,
        }
      default:
        return { kind: 'price-cross', price: 0, direction: 'up' }
    }
  }

  function handleSave() {
    if (!isValid.value) return
    const rule: AlertRule = {
      id: props.rule?.id ?? `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: draftName.value.trim(),
      predicate: buildPredicate(),
      enabled: props.rule?.enabled ?? true,
      oneShot: draftOneShot.value,
      cooldownMs: draftCooldown.value > 0 ? draftCooldown.value : undefined,
    }
    emit('save', rule)
  }
</script>

<style scoped>
  /* ══════════════════════════════════════════
   Form Shell
══════════════════════════════════════════ */
  .rule-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 10px;
    background: var(--klc-color-ui-card);
    margin-bottom: 10px;
  }

  /* ══════════════════════════════════════════
   Field
══════════════════════════════════════════ */
  .rule-form-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .rule-form-field--grow {
    flex: 1;
    min-width: 0;
  }

  .rule-form-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--klc-color-ui-muted);
    letter-spacing: 0.06em;
  }

  /* ══════════════════════════════════════════
   Input
══════════════════════════════════════════ */
  .rule-form-input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    background: var(--klc-color-ui-input);
    color: var(--klc-color-ui-text);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
    font-variant-numeric: tabular-nums;
  }

  .rule-form-input::placeholder {
    color: var(--klc-color-ui-muted);
    opacity: 0.7;
  }

  .rule-form-input:focus {
    border-color: var(--klc-color-ui-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-ui-accent) 24%, transparent);
  }

  /* 隐藏原生 number 步进器，改由自定义 stepper 提供加减 */
  .rule-form-input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .rule-form-input[type='number']::-webkit-inner-spin-button,
  .rule-form-input[type='number']::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* ══════════════════════════════════════════
   Number Stepper
══════════════════════════════════════════ */
  .rule-form-stepper {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    background: var(--klc-color-ui-input);
    overflow: hidden;
    box-sizing: border-box;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .rule-form-stepper:focus-within {
    border-color: var(--klc-color-ui-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-ui-accent) 24%, transparent);
  }

  .rule-form-stepper-btn {
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

  .rule-form-stepper-btn:hover:not(:disabled) {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .rule-form-stepper-btn:disabled {
    color: var(--klc-color-ui-border);
    cursor: not-allowed;
  }

  .rule-form-stepper-btn svg {
    width: 14px;
    height: 14px;
  }

  .rule-form-stepper-field {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .rule-form-stepper .rule-form-input {
    flex: 1;
    min-width: 0;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-left: 1px solid var(--klc-color-ui-border);
    border-right: 1px solid var(--klc-color-ui-border);
    border-radius: 0;
    background: transparent;
    text-align: center;
  }

  .rule-form-stepper .rule-form-input:focus {
    border-color: var(--klc-color-ui-border);
    box-shadow: none;
  }

  .rule-form-stepper-field .rule-form-input {
    padding-right: 26px;
  }

  .rule-form-input-suffix {
    position: absolute;
    right: 9px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 11px;
    font-weight: 600;
    color: var(--klc-color-ui-muted);
    pointer-events: none;
    user-select: none;
  }

  .rule-form-stepper--cooldown {
    width: 132px;
    flex-shrink: 0;
  }

  /* ══════════════════════════════════════════
   Kind Selector
══════════════════════════════════════════ */
  .rule-form-kinds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
  }

  .rule-form-kind {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    background: var(--klc-color-ui-background);
    color: var(--klc-color-ui-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s;
    text-align: left;
  }

  .rule-form-kind:hover:not(.active) {
    border-color: var(--klc-color-ui-border-strong);
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
  }

  .rule-form-kind.active {
    background: var(--klc-color-ui-accent);
    color: var(--klc-color-ui-on-accent);
    border-color: var(--klc-color-ui-accent);
  }

  .rule-form-kind-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    opacity: 0.75;
  }

  .rule-form-kind-icon :deep(svg) {
    width: 16px;
    height: 16px;
  }

  /* ══════════════════════════════════════════
   Params Card
══════════════════════════════════════════ */
  .rule-form-params-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-background);
  }

  .rule-form-params-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .rule-form-params-row--cross {
    align-items: flex-end;
  }

  .rule-form-range-sep {
    padding-bottom: 9px;
    color: var(--klc-color-ui-muted);
    font-size: 14px;
    flex-shrink: 0;
  }

  /* ══════════════════════════════════════════
   Direction Buttons
══════════════════════════════════════════ */
  .rule-form-directions {
    display: flex;
    gap: 4px;
  }

  .rule-form-direction {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    background: var(--klc-color-ui-input);
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s;
  }

  .rule-form-direction-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .rule-form-direction:hover:not(.active) {
    border-color: var(--klc-color-ui-border-strong);
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
  }

  .rule-form-direction.active {
    background: var(--klc-color-ui-accent);
    color: var(--klc-color-ui-on-accent);
    border-color: var(--klc-color-ui-accent);
  }

  /* ══════════════════════════════════════════
   Advanced Options
══════════════════════════════════════════ */
  .rule-form-advanced {
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-background);
    overflow: hidden;
  }

  .rule-form-advanced-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 12px;
  }

  .rule-form-advanced-divider {
    height: 1px;
    background: var(--klc-color-ui-border);
  }

  .rule-form-advanced-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .rule-form-advanced-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--klc-color-ui-text);
  }

  .rule-form-advanced-hint {
    font-size: 10px;
    color: var(--klc-color-ui-muted);
  }

  /* ══════════════════════════════════════════
   Actions
══════════════════════════════════════════ */
  .rule-form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 2px;
  }

  .rule-form-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 16px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s,
      opacity 0.15s;
  }

  .rule-form-btn-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .rule-form-btn--cancel {
    border: 1px solid var(--klc-color-ui-border);
    background: var(--klc-color-ui-input);
    color: var(--klc-color-ui-secondary-button-text);
  }

  .rule-form-btn--cancel:hover {
    border-color: var(--klc-color-ui-border-strong);
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
  }

  .rule-form-btn--save {
    border: 1px solid var(--klc-color-ui-accent);
    background: var(--klc-color-ui-accent);
    color: var(--klc-color-ui-on-accent);
  }

  .rule-form-btn--save:hover:not(:disabled) {
    border-color: var(--klc-color-ui-accent-strong);
    background: var(--klc-color-ui-accent-strong);
  }

  .rule-form-btn--save:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
