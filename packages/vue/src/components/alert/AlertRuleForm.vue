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
            <input
              v-model.number="pf.price"
              class="rule-form-input"
              type="number"
              step="0.01"
              placeholder="0.00"
            />
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
            <input
              v-model.number="pf.min"
              class="rule-form-input"
              type="number"
              step="0.01"
              placeholder="0.00"
            />
          </div>
          <span class="rule-form-range-sep">—</span>
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">最大值</label>
            <input
              v-model.number="pf.max"
              class="rule-form-input"
              type="number"
              step="0.01"
              placeholder="0.00"
            />
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
            <input
              v-model.number="pf.threshold"
              class="rule-form-input"
              type="number"
              step="0.01"
              placeholder="0.00"
            />
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
            <div class="rule-form-input-suffix-wrap">
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
          </div>
          <div class="rule-form-field rule-form-field--grow">
            <label class="rule-form-label">回溯 K 线数</label>
            <div class="rule-form-input-suffix-wrap">
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
        <label class="rule-toggle">
          <input v-model="draftOneShot" type="checkbox" />
          <span class="rule-toggle-slider"></span>
        </label>
      </div>

      <div class="rule-form-advanced-divider"></div>

      <div class="rule-form-advanced-row">
        <div class="rule-form-advanced-info">
          <span class="rule-form-advanced-label">冷却时间</span>
          <span class="rule-form-advanced-hint">同一规则再次触发的最短间隔</span>
        </div>
        <div class="rule-form-input-suffix-wrap rule-form-cooldown-wrap">
          <input
            v-model.number="draftCooldown"
            class="rule-form-input rule-form-input--cooldown"
            type="number"
            step="1000"
            min="0"
            placeholder="0"
          />
          <span class="rule-form-input-suffix">ms</span>
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
  import { ref, computed, reactive } from 'vue'

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
    { value: 'up' as const, label: '↑ 上穿' },
    { value: 'down' as const, label: '↓ 下穿' },
    { value: 'any' as const, label: '↕ 穿越' },
  ]

  const pairDirections = [
    { value: 'a-above-b' as const, label: '↑ 上穿' },
    { value: 'a-below-b' as const, label: '↓ 下穿' },
    { value: 'any' as const, label: '↕ 交叉' },
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
    border: 1px solid var(--klc-color-border-button);
    border-radius: 10px;
    background: var(--klc-color-grid-minor);
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
    color: var(--klc-color-axis-text);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.8;
  }

  /* ══════════════════════════════════════════
   Input
══════════════════════════════════════════ */
  .rule-form-input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 6px;
    background: var(--klc-color-background);
    color: var(--klc-color-foreground);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
    font-variant-numeric: tabular-nums;
  }

  .rule-form-input::placeholder {
    color: var(--klc-color-axis-text);
    opacity: 0.4;
  }

  .rule-form-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }

  /* suffix wrapper */
  .rule-form-input-suffix-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .rule-form-input-suffix-wrap .rule-form-input {
    padding-right: 28px;
  }

  .rule-form-input-suffix {
    position: absolute;
    right: 9px;
    font-size: 11px;
    font-weight: 600;
    color: var(--klc-color-axis-text);
    opacity: 0.55;
    pointer-events: none;
    user-select: none;
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
    border: 1px solid var(--klc-color-border-button);
    border-radius: 6px;
    background: var(--klc-color-background);
    color: var(--klc-color-axis-text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s,
      box-shadow 0.15s;
    text-align: left;
  }

  .rule-form-kind:hover:not(.active) {
    border-color: var(--klc-color-axis-line);
    color: var(--klc-color-foreground);
    background: var(--klc-color-tag-bg-hover);
  }

  .rule-form-kind.active {
    background: var(--klc-color-foreground);
    color: var(--klc-color-background);
    border-color: var(--klc-color-foreground);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
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
    border: 1px solid var(--klc-color-border-button);
    border-radius: 8px;
    background: var(--klc-color-background);
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
    color: var(--klc-color-axis-text);
    opacity: 0.4;
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
    padding: 6px 10px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 6px;
    background: transparent;
    color: var(--klc-color-axis-text);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s;
  }

  .rule-form-direction:hover:not(.active) {
    border-color: var(--klc-color-axis-line);
    color: var(--klc-color-foreground);
  }

  .rule-form-direction.active {
    background: var(--klc-color-foreground);
    color: var(--klc-color-background);
    border-color: var(--klc-color-foreground);
  }

  /* ══════════════════════════════════════════
   Advanced Options
══════════════════════════════════════════ */
  .rule-form-advanced {
    border: 1px solid var(--klc-color-border-button);
    border-radius: 8px;
    background: var(--klc-color-background);
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
    background: var(--klc-color-border-button);
    opacity: 0.6;
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
    color: var(--klc-color-foreground);
  }

  .rule-form-advanced-hint {
    font-size: 10px;
    color: var(--klc-color-axis-text);
    opacity: 0.6;
  }

  .rule-form-cooldown-wrap {
    flex-shrink: 0;
  }

  .rule-form-input--cooldown {
    width: 88px;
    text-align: right;
    padding-right: 30px;
  }

  /* ══════════════════════════════════════════
   Toggle Switch
══════════════════════════════════════════ */
  .rule-toggle {
    position: relative;
    display: inline-block;
    width: 34px;
    height: 20px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .rule-toggle input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .rule-toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--klc-color-border-button);
    border-radius: 999px;
    transition: background 0.2s;
  }

  .rule-toggle-slider::before {
    content: '';
    position: absolute;
    left: 3px;
    top: 3px;
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .rule-toggle input:checked + .rule-toggle-slider {
    background: #3b82f6;
  }

  .rule-toggle input:checked + .rule-toggle-slider::before {
    transform: translateX(14px);
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
      opacity 0.15s,
      box-shadow 0.15s;
  }

  .rule-form-btn-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .rule-form-btn--cancel {
    border: 1px solid var(--klc-color-border-button);
    background: transparent;
    color: var(--klc-color-axis-text);
  }

  .rule-form-btn--cancel:hover {
    border-color: var(--klc-color-axis-line);
    color: var(--klc-color-foreground);
    background: var(--klc-color-tag-bg-hover);
  }

  .rule-form-btn--save {
    border: 1px solid var(--klc-color-foreground);
    background: var(--klc-color-foreground);
    color: var(--klc-color-background);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  }

  .rule-form-btn--save:hover:not(:disabled) {
    opacity: 0.85;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .rule-form-btn--save:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    box-shadow: none;
  }
</style>
