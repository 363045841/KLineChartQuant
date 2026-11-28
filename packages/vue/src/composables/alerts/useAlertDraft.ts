/**
 * 新建警报草稿：选中脚本、品种选择与创建策略的唯一 UI 语义。
 *
 * 脚本目录由 AlertScriptSelector 自己订阅，本模块只接收选中的定义；
 * 警报面板只负责展示与规则操作，新建使用独立弹窗和独立草稿。
 */
import type {
  AlertScriptDefinition,
  AlertService,
} from '@363045841yyt/klinechart-core/controllers'
import type { SymbolSpec } from '@363045841yyt/klinechart-core'
import type { InstrumentDescriptor } from '@363045841yyt/klinechart-core/market-data'
import { computed, ref, shallowRef } from 'vue'

export interface AlertDraftOptions {
  readonly alerts: () => AlertService | null
  /** 当前图表品种快照；新建默认使用它的品种、周期与复权。 */
  readonly currentSpec: () => SymbolSpec | null
}

/** 新建弹窗实际消费的脚本字段；目录项的其它字段只属于选择器。 */
export type AlertScriptSelection = Pick<AlertScriptDefinition, 'id' | 'label'>

/**
 * 创建新建警报草稿。
 *
 * @param options 警报服务与当前品种快照读取函数
 * @returns 脚本/品种选择、可用性与创建命令
 */
export function useAlertDraft(options: AlertDraftOptions) {
  const selectedScript = shallowRef<AlertScriptSelection | null>(null)
  const targetSpec = shallowRef<SymbolSpec | null>(options.currentSpec())
  const error = ref<string | null>(null)

  const instrument = computed<InstrumentDescriptor | null>(
    () => targetSpec.value?.instrument ?? null,
  )
  const canAdd = computed(() => Boolean(selectedScript.value && targetSpec.value && alertSpec(targetSpec.value)))

  /** 草稿只提交品种明确支持的完整 K 线选择。 */
  function alertSpec(spec: SymbolSpec): SymbolSpec | null {
    const bars = spec.instrument.capabilities.bars
    if (!bars) return null
    const period = bars.periods.find((period) => period === spec.period) ?? bars.periods[0]
    const adjust = bars.adjustments.find((adjust) => adjust === spec.adjust) ?? bars.adjustments[0]
    return period === undefined || adjust === undefined ? null : { instrument: spec.instrument, period, adjust }
  }

  /** 重开草稿：清空脚本并回到当前图表品种。 */
  function reset(): void {
    selectedScript.value = null
    targetSpec.value = options.currentSpec()
    error.value = null
  }

  /** 记录选择器给出的脚本身份与展示名；草稿不保存目录项的其它字段。 */
  function selectScript(script: AlertScriptSelection): void {
    selectedScript.value = script
    error.value = null
  }

  /** 切换作用品种，保留草稿里的周期与复权。 */
  function selectInstrument(next: InstrumentDescriptor): void {
    const current = targetSpec.value
    targetSpec.value = current ? { ...current, instrument: next } : { instrument: next }
    error.value = null
  }

  /**
   * 提交草稿。
   *
   * 同一脚本在同一品种已有规则时只重新启用，不新增重复规则。
   *
   * @returns 创建或启用成功时为 true
   */
  function confirm(): boolean {
    const alerts = options.alerts()
    const script = selectedScript.value
    const spec = targetSpec.value && alertSpec(targetSpec.value)
    if (!alerts || !script || !spec) return false

    try {
      const existing = alerts
        .list({ symbol: spec })
        .find((rule) => rule.script.definitionId === script.id)
      if (existing) {
        alerts.setEnabled(existing.id, true)
      } else {
        alerts.create({
          name: script.label,
          script: { definitionId: script.id, inputs: {} },
          symbol: spec,
          message: '{{message}}',
          channels: ['in-app'],
        })
      }
      error.value = null
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      return false
    }
  }

  return {
    selectedScript,
    instrument,
    error,
    canAdd,
    reset,
    selectScript,
    selectInstrument,
    confirm,
  }
}
