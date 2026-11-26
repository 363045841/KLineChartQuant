/**
 * 警报面板：全量规则分组、启停、参数与渠道的唯一 UI 语义。
 *
 * 新建由独立弹窗和 useAlertDraft 负责；这里只处理已有规则。
 */
import type { InstrumentDescriptor } from '@363045841yyt/klinechart-core/market-data'
import {
  type Alert,
  type AlertScriptDefinition,
  createAlertCatalog,
  type AlertService,
  type DefinitionRegistry,
} from '@363045841yyt/klinechart-core/controllers'
import type { ParamValues } from '@vue-src/components/params/types.js'
import { symbolIdentityKey } from '@vue-src/composables/symbol/useSymbolSearch.js'
import { coreSignalToVueRef, useSignalSource } from '@vue-src/utils/signalBridge.js'
import { computed, ref } from 'vue'

export interface AlertPanelOptions {
  readonly alerts: () => AlertService | null
  readonly definitions: DefinitionRegistry
}

/** 参数入口的三种状态：可编辑、脚本无参数、脚本定义缺失。 */
export type AlertParamsState = 'ready' | 'no-params' | 'no-script'

/** 规则行投影：脚本查找、标签与参数状态在进入模板前一次算好。 */
export interface AlertRuleRow {
  readonly rule: Alert
  readonly label: string
  readonly name?: string
  readonly paramsState: AlertParamsState
  readonly paramsHint: string
}

/** 一个品种分组；组内规则保持稳定排序。 */
interface AlertGroup {
  readonly key: string
  readonly label: string
  readonly instrument: InstrumentDescriptor
  readonly rules: readonly AlertRuleRow[]
}

/** 把规则输入过滤成参数弹窗可接受的标量。 */
function scalarInputs(values: Readonly<Record<string, unknown>>): ParamValues {
  const inputs: ParamValues = {}
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      inputs[key] = value
    }
  }
  return inputs
}

/** 分组标题只展示品种与交易所；完整名称留给 title 提示。 */
function groupLabel(instrument: InstrumentDescriptor): string {
  const { symbol, exchange } = instrument
  return exchange ? `${symbol} · ${exchange}` : symbol
}

/**
 * 把规则投影成 UI 行：脚本查找、标签与参数状态只做一次。
 *
 * @param rule 规则快照
 * @param scripts 当前警报脚本目录
 * @returns 模板可直接消费的行视图
 */
export function projectAlertRule(
  rule: Alert,
  scripts: readonly AlertScriptDefinition[],
): AlertRuleRow {
  const script = scripts.find((item) => item.id === rule.script.definitionId)
  const paramsState: AlertParamsState = !script
    ? 'no-script'
    : script.inputs.length === 0
      ? 'no-params'
      : 'ready'
  return {
    rule,
    label: script?.label ?? rule.name,
    ...(script?.name === undefined ? {} : { name: script.name }),
    paramsState,
    paramsHint:
      paramsState === 'no-script'
        ? '脚本不可用'
        : paramsState === 'no-params'
          ? '该脚本没有参数'
          : '编辑参数',
  }
}

/**
 * 创建警报面板的状态与规则命令。
 *
 * @param options 警报服务读取函数
 * @returns 分组投影、折叠状态与规则命令
 */
export function useAlertPanel(options: AlertPanelOptions) {
  const scripts = coreSignalToVueRef(createAlertCatalog(options.definitions))
  const rules = useSignalSource(
    () => options.alerts()?.alerts,
    (value) => value,
    () => [],
  )
  const error = ref<string | null>(null)
  const collapsedGroups = ref<ReadonlySet<string>>(new Set())
  const paramsRuleId = ref<string | null>(null)
  const paramsVisible = ref(false)

  function fail(cause: unknown): void {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }

  function clearError(): void {
    error.value = null
  }

  function scriptFor(rule: Alert): AlertScriptDefinition | undefined {
    return scripts.value.find((script) => script.id === rule.script.definitionId)
  }

  const groups = computed<readonly AlertGroup[]>(() => {
    const byKey = new Map<string, { instrument: InstrumentDescriptor; rows: AlertRuleRow[] }>()
    for (const rule of rules.value) {
      const key = symbolIdentityKey(rule.symbol.instrument)
      const row = projectAlertRule(rule, scripts.value)
      const group = byKey.get(key)
      if (group) group.rows.push(row)
      else byKey.set(key, { instrument: rule.symbol.instrument, rows: [row] })
    }
    return [...byKey.entries()]
      .map(([key, group]) => ({
        key,
        label: groupLabel(group.instrument),
        instrument: group.instrument,
        rules: group.rows.slice().sort((left, right) => left.label.localeCompare(right.label)),
      }))
      .sort((left, right) => left.instrument.symbol.localeCompare(right.instrument.symbol))
  })

  function isCollapsed(key: string): boolean {
    return collapsedGroups.value.has(key)
  }

  function toggleGroup(key: string): void {
    const next = new Set(collapsedGroups.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsedGroups.value = next
  }

  function setEnabled(rule: Alert, enabled: boolean): void {
    try {
      options.alerts()?.setEnabled(rule.id, enabled)
      clearError()
    } catch (cause) {
      fail(cause)
    }
  }

  function removeRule(rule: Alert): void {
    try {
      options.alerts()?.remove(rule.id)
      clearError()
    } catch (cause) {
      fail(cause)
    }
  }

  const paramsRule = computed(() =>
    rules.value.find((rule) => rule.id === paramsRuleId.value),
  )
  const paramsScript = computed(() =>
    paramsRule.value === undefined ? undefined : scriptFor(paramsRule.value),
  )
  const paramsValues = computed<ParamValues>(() => {
    const script = paramsScript.value
    const rule = paramsRule.value
    if (!script || !rule) return {}
    const values: ParamValues = {}
    for (const input of script.inputs) {
      if (input.default !== undefined) values[input.key] = input.default
    }
    return { ...values, ...scalarInputs(rule.script.inputs) }
  })

  function openParams(rule: Alert): void {
    if (!scriptFor(rule)) {
      error.value = `脚本不可用：${rule.script.definitionId}`
      paramsRuleId.value = null
      paramsVisible.value = false
      return
    }
    clearError()
    paramsRuleId.value = rule.id
    paramsVisible.value = true
  }

  function closeParams(): void {
    paramsVisible.value = false
  }

  function confirmParams(values: ParamValues): void {
    const rule = paramsRule.value
    const script = paramsScript.value
    if (!rule || !script) return
    try {
      options.alerts()?.update(rule.id, {
        script: { definitionId: script.id, inputs: values },
      })
      paramsVisible.value = false
      clearError()
    } catch (cause) {
      fail(cause)
    }
  }

  return {
    error,
    groups,
    isCollapsed,
    toggleGroup,
    setEnabled,
    removeRule,
    paramsScript,
    paramsValues,
    paramsVisible,
    openParams,
    closeParams,
    confirmParams,
  }
}
