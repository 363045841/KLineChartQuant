/** 指标选择器的展示名称、说明与参数表。 */
import { computed, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import {
  getIndicatorDescriptors,
  resolveCanonicalIndicatorId,
  resolveIndicatorDefinitionId,
} from '../../indicators/indicatorDefinitionRegistry.js'
import { type IndicatorInputDef, IndicatorKind } from '../../indicators/indicatorMetadata.js'

export interface ParamConfig {
  key: string
  label: string
  type: 'number' | 'select' | 'string' | 'boolean'
  min?: number
  max?: number
  step?: number
  default?: number | string | boolean
  options?: ReadonlyArray<{ value: string; label: string }>
  description?: string
  /** 仅当依赖参数取指定值时显示；条件只影响编辑入口。 */
  visibleWhen?: { key: string; values: readonly (number | string | boolean)[] }
}

export interface Indicator {
  source?: import('../../indicators/indicatorMetadata.js').IndicatorSource
  id: string
  label: string
  name: string
  pane: 'main' | 'sub'
  description?: string
  params?: ParamConfig[]
}

function normalizeId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// UI-only metadata that don't belong in the @Indicator decorator (rendering layer)
const uiMeta: Record<
  string,
  {
    name?: string
    description: string
    params?: ParamConfig[]
  }
> = {
  structure: {
    name: 'SMC 结构',
    description:
      'Swing / BOS / CHOCH 识别市场结构转换，突破结构（BOS）确认趋势，趋势反转（CHOCH）提示反转。',
    params: [
      {
        key: 'leftWindow',
        label: '左窗口',
        type: 'number',
        min: 1,
        max: 20,
        step: 1,
        default: 2,
        description: '摆点左侧 K 线数',
      },
      {
        key: 'rightWindow',
        label: '右窗口',
        type: 'number',
        min: 1,
        max: 20,
        step: 1,
        default: 2,
        description: '摆点右侧 K 线数',
      },
    ],
  },
  zones: {
    name: 'SMC 区域',
    description: 'FVG（公允价值缺口）和 Order Block（订单块）识别机构交易行为中的关键流动性区域。',
    params: [
      {
        key: 'obLookback',
        label: 'OB 回溯',
        type: 'number',
        min: 1,
        max: 50,
        step: 1,
        default: 5,
        description: 'Order Block 回溯窗口',
      },
    ],
  },
  volumeprofile: {
    name: '成交量分布',
    description:
      'Volume Profile 显示各价位成交量分布，识别高量区域（价值区）和低量区域（缺口），POC 为成交量最大价位。',
    params: [
      {
        key: 'bins',
        label: '分箱数',
        type: 'number',
        min: 5,
        max: 100,
        step: 1,
        default: 24,
        description: '价格分箱数',
      },
      {
        key: 'lookback',
        label: '回溯',
        type: 'number',
        min: 0,
        max: 500,
        step: 1,
        default: 0,
        description: '0=全部数据',
      },
      {
        key: 'valueAreaPercent',
        label: '价值区%',
        type: 'number',
        min: 0.1,
        max: 1,
        step: 0.05,
        default: 0.7,
        description: '价值区占比',
      },
    ],
  },
}

/** 静态目录中计算参数与展示默认项合并后的参数表。 */
type RuntimeDefaultParams = Readonly<Record<string, unknown>>

/** 组装参数配置：结构来自 uiMeta，默认值优先取自注册表声明的计算参数与展示默认项。 */
function buildParamConfigs(
  params: ReadonlyArray<ParamConfig> | undefined,
  runtimeDefaults: RuntimeDefaultParams,
): ParamConfig[] | undefined {
  if (!params) return undefined
  return params.map((param) => {
    const runtimeDefault = runtimeDefaults[param.key]
    // 注册表未声明该 key 或值非数字时保留 uiMeta 默认值。
    return typeof runtimeDefault === 'number' || typeof runtimeDefault === 'string'
      ? { ...param, default: runtimeDefault }
      : param
  })
}

/** 脚本输入声明的默认值决定参数编辑类型；声明了 options 的字符串参数渲染为下拉。 */
function scriptParamConfigs(
  defaults: RuntimeDefaultParams,
  inputDefs?: Readonly<Record<string, IndicatorInputDef>>,
): ParamConfig[] {
  return Object.entries(defaults).flatMap(([key, value]): ParamConfig[] => {
    if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean')
      return []
    const options = inputDefs?.[key]?.options
    return [
      {
        key,
        label: inputDefs?.[key]?.title ?? key,
        type: options?.length
          ? 'select'
          : typeof value === 'number'
            ? 'number'
            : typeof value === 'boolean'
              ? 'boolean'
              : 'string',
        default: value,
        min: inputDefs?.[key]?.min,
        max: inputDefs?.[key]?.max,
        step: inputDefs?.[key]?.step,
        ...(options?.length
          ? { options: options.map((option) => ({ value: option, label: option })) }
          : {}),
      },
    ]
  })
}

/**
 * 指标展示目录由静态目录派生；uiMeta 是编译期常量，因此派生只依赖注册表。
 * 采用响应式 computed：注册表修订号变化时自动重建，不再维护手工比较的影子缓存。
 * 首次读取时才创建，保持内置目录的懒登记。
 */
let indicatorCatalog: ReadonlySignal<readonly Indicator[]> | null = null

/** 读取展示目录快照。 */
function readIndicatorCatalog(): readonly Indicator[] {
  indicatorCatalog ??= computed(() => {
    // getIndicatorDescriptors 内部读取修订号，使本 computed 订阅注册表变更。
    return getIndicatorDescriptors()
      .filter((def) => def.kind === IndicatorKind.Indicator)
      .map((def) => {
        const key = normalizeId(def.name)
        const ui = uiMeta[key]
        const runtimeDefaults = {
          ...def.defaultParams,
          ...def.defaultOptions,
        }
        return {
          id: resolveCanonicalIndicatorId(def),
          source: def.source,
          label: def.displayName,
          name:
            def.source === 'script'
              ? (def.title ?? def.displayName)
              : (ui?.name ?? def.displayName),
          pane: def.category === 'main' ? ('main' as const) : ('sub' as const),
          description: def.source === 'script' ? def.info : ui?.description,
          params:
            def.source === 'script'
              ? scriptParamConfigs(runtimeDefaults, def.inputDefs)
              : buildParamConfigs(ui?.params, runtimeDefaults),
        }
      })
      .sort((a, b) => {
        const paneOrder = a.pane === 'main' ? 0 : 1
        const paneOrderB = b.pane === 'main' ? 0 : 1
        return paneOrder - paneOrderB || a.label.localeCompare(b.label)
      })
  })
  return indicatorCatalog()
}

/** 返回全部展示目录项。 */
export function allIndicators(): Indicator[] {
  return [...readIndicatorCatalog()]
}

/** 按展示名、内部名或别名解析展示目录项。 */
export function findIndicator(id: string): Indicator | undefined {
  const norm = normalizeId(id)
  const indicators = readIndicatorCatalog()
  const direct = indicators.find((i) => normalizeId(i.id) === norm || normalizeId(i.label) === norm)
  if (direct) return direct
  // 兼容内部 name / 别名输入：先解析为规范 ID 再匹配
  const canonicalId = resolveIndicatorDefinitionId(id)
  if (!canonicalId) return undefined
  const canonical = normalizeId(canonicalId)
  return indicators.find((i) => normalizeId(i.id) === canonical)
}

export function isSubIndicatorId(id: string): boolean {
  const indicator = findIndicator(id)
  return indicator?.pane === 'sub'
}
