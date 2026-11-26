/**
 * 新建警报草稿：脚本选择、品种选择与创建策略的唯一 UI 语义。
 *
 * 警报面板只负责展示与规则操作；新建使用独立弹窗和独立草稿。
 */
import type { InstrumentDescriptor } from '@363045841yyt/klinechart-core/market-data'
import {
  type AlertScriptDefinition,
  alertCatalog,
  type AlertService,
  type SymbolSpec,
} from '@363045841yyt/klinechart-core/controllers'
import { coreSignalToVueRef } from '@vue-src/utils/signalBridge.js'
import { computed, ref, shallowRef } from 'vue'

export interface AlertDraftOptions {
  readonly alerts: () => AlertService | null
  /** 当前图表品种快照；新建默认使用它的品种、周期与复权。 */
  readonly currentSpec: () => SymbolSpec | null
}

/**
 * 创建新建警报草稿。
 *
 * @param options 警报服务与当前品种快照读取函数
 * @returns 脚本/品种选择、可用性与创建命令
 */
export function useAlertDraft(options: AlertDraftOptions) {
  const scripts = coreSignalToVueRef(alertCatalog)
  const definitionId = ref<string | null>(null)
  const targetSpec = shallowRef<SymbolSpec | null>(options.currentSpec())
  const error = ref<string | null>(null)

  const instrument = computed<InstrumentDescriptor | null>(
    () => targetSpec.value?.instrument ?? null,
  )
  const selectedScript = computed<AlertScriptDefinition | undefined>(() =>
    scripts.value.find((script) => script.id === definitionId.value),
  )
  const canAdd = computed(() => Boolean(selectedScript.value && instrument.value))

  /** 重开草稿：品种回到当前图表快照，脚本清空。 */
  function reset(): void {
    definitionId.value = null
    targetSpec.value = options.currentSpec()
    error.value = null
  }

  function selectScript(nextDefinitionId: string): void {
    definitionId.value = nextDefinitionId
    error.value = null
  }

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
    const spec = targetSpec.value
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
    scripts,
    definitionId,
    instrument,
    error,
    selectedScript,
    canAdd,
    reset,
    selectScript,
    selectInstrument,
    confirm,
  }
}
