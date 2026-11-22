/** 对象轴的唯一命令入口：先校验身份与所属容器，再写状态并投影。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import {
  isPriceAxisRangeMode,
  PRICE_AXIS_RANGE_MODE,
} from '@/foundation/config/priceAxisRangeMode.js'
import { batch } from '@/foundation/reactivity/signal.js'
import { ScaleType } from '@/foundation/types/scaleType.js'
import type { ObjectAxesApi, ObjectAxesDependencies } from '../axisTypes.js'

/** API 不缓存业务绑定；每次从对象状态的统一投影读取。 */
export function createObjectAxesApi(deps: ObjectAxesDependencies): ObjectAxesApi {
  const requireAxis = (axisId: string) => {
    const paneId = deps.getAxisPaneId(axisId)
    if (paneId === undefined)
      throw new KLineChartError(GENERIC_ERROR_CODES.NOT_REGISTERED, `轴未注册：${axisId}`)
    const pane = deps.getPane(paneId)
    if (!pane)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `轴 ${axisId} 所属 Pane ${paneId} 不存在`,
      )
    return pane.axis(axisId)
  }
  /** 合法轴在生命周期入口已初始化配置，缺项代表状态损坏，不能由消费方补默认值。 */
  const requireState = (axisId: string) => {
    const state = deps.ranges.readonly.paneRanges.peek()[axisId]
    if (state === undefined)
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, `轴状态未初始化：${axisId}`)
    return state
  }
  return {
    list: () => deps.listBindings(),
    bindingFor(objectId) {
      const binding = deps.listBindings().find((item) => item.objectId === objectId)
      if (!binding)
        throw new KLineChartError(GENERIC_ERROR_CODES.NOT_REGISTERED, `对象未绑定轴：${objectId}`)
      return binding
    },
    get: requireAxis,
    configuration(axisId) {
      const axis = requireAxis(axisId)
      return {
        scaleType: axis.getScaleType(),
        rangeMode: requireState(axisId).rangeMode,
        availableRangeModes: deps.availableRangeModes(axisId),
        baseValue: axis.getBasePrice(),
      }
    },
    setScaleType(axisId, type, baseValue) {
      if (!Object.values(ScaleType).includes(type))
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `非法轴变换类型：${type}`)
      const axis = requireAxis(axisId)
      const base = baseValue === undefined ? axis.getBasePrice() : baseValue
      if (type === ScaleType.Percent && (base === null || !Number.isFinite(base) || base === 0))
        throw new KLineChartError(
          GENERIC_ERROR_CODES.INVALID_PARAM,
          `轴 ${axisId} 的百分比变换必须提供非零基准值`,
        )
      batch(() => {
        if (baseValue !== undefined) deps.ranges.actions.setBaseValue(axisId, baseValue)
        deps.paneState.actions.setPaneScaleType(axisId, type)
      })
      deps.project()
    },
    setRangeMode(axisId, mode) {
      if (!isPriceAxisRangeMode(mode))
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `非法轴范围模式：${mode}`)
      if (!deps.availableRangeModes(axisId).includes(mode))
        throw new KLineChartError(
          GENERIC_ERROR_CODES.INVALID_PARAM,
          `轴 ${axisId} 在当前视图下不支持范围模式：${mode}`,
        )
      const axis = requireAxis(axisId)
      if (mode === PRICE_AXIS_RANGE_MODE.Manual)
        deps.ranges.actions.useManualMode(axis.getDisplayRange(), axisId)
      else deps.ranges.actions.useAutoMode(axisId, mode)
      deps.project()
    },
    resetRange(axisId) {
      requireAxis(axisId)
      deps.ranges.actions.resetRange(axisId)
      deps.project()
    },
    translate(axisId, deltaY) {
      if (!Number.isFinite(deltaY))
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '轴平移量必须为有限数值')
      const axis = requireAxis(axisId)
      const state = requireState(axisId)
      if (state.rangeMode !== PRICE_AXIS_RANGE_MODE.Manual || state.range === null)
        throw new KLineChartError(
          GENERIC_ERROR_CODES.INVALID_STATE,
          `轴 ${axisId} 没有已初始化的手动范围`,
        )
      deps.ranges.actions.setRange(axis.translateRange(state.range, deltaY), axisId)
      deps.project()
    },
    scale(axisId, deltaY, anchorY) {
      if (!Number.isFinite(deltaY) || (anchorY !== undefined && !Number.isFinite(anchorY)))
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '轴缩放量和锚点必须为有限数值')
      const axis = requireAxis(axisId)
      const state = requireState(axisId)
      if (state.rangeMode !== PRICE_AXIS_RANGE_MODE.Manual || state.range === null)
        throw new KLineChartError(
          GENERIC_ERROR_CODES.INVALID_STATE,
          `轴 ${axisId} 没有已初始化的手动范围`,
        )
      deps.ranges.actions.setRange(axis.scaleRange(state.range, deltaY, anchorY), axisId)
      deps.project()
    },
    hitTest(paneId, x) {
      if (!Number.isFinite(x))
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '轴命中坐标必须为有限数值')
      if (!deps.getPane(paneId))
        throw new KLineChartError(GENERIC_ERROR_CODES.NOT_REGISTERED, `Pane 未注册：${paneId}`)
      const layout = deps.getLayout(paneId)
      return (
        Object.entries(layout).find(
          ([, column]) => x >= column.left && x < column.left + column.width,
        )?.[0] ?? null
      )
    },
  }
}
