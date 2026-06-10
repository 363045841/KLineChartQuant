/**
 * IndicatorMetadata - 指标元数据定义
 *
 * 支持动态注册指标的核心数据结构
 * 每个指标通过 metadata 描述其状态 key、渲染器工厂等元信息
 */

import type { PluginHost, RendererPluginWithHost } from '../../plugin'
import type { IndicatorConfigSnapshot, IndicatorSeriesBundle } from './workerProtocol'
import type { KLineData } from '../../types/price'

export type IndicatorId = string

export interface IndicatorRendererOptions {
    paneId: string
    indicatorId: IndicatorId
    params?: Record<string, unknown>
}

export interface IndicatorScaleRendererOptions {
    paneId: string
    indicatorId: IndicatorId
    axisWidth: number
    yPaddingPx: number
    getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
}

/**
 * 指标分类：主图/副图
 */
export type IndicatorCategory = 'main' | 'sub' | 'oscillator' | 'volume'

/**
 * State key 生成器类型
 * - 主图指标：常量字符串
 * - 副图指标：函数，接收 paneId 返回 key
 */
export type StateKey = string | ((paneId: string) => string)

/**
 * 渲染器工厂函数
 */
export type RendererFactory = (options?: IndicatorRendererOptions) => RendererPluginWithHost

export type ScaleRendererFactory = (options: IndicatorScaleRendererOptions) => RendererPluginWithHost

export type IndicatorConfigUpdater = (
    scheduler: unknown,
    params: Record<string, unknown>,
    paneId: string,
) => void

export interface IndicatorSemanticChartAdapter {
    updateRendererConfig(name: string, config: Record<string, unknown>): void
}

export interface IndicatorVisibleRange {
    start: number
    end: number
}

export interface IndicatorPriceRange {
    min: number
    max: number
}

export type IndicatorPriceRangeComputer = (
    bundle: IndicatorSeriesBundle,
    visibleRange: IndicatorVisibleRange,
) => IndicatorPriceRange | null

export type IndicatorRenderStateComposer = (
    bundle: IndicatorSeriesBundle,
    visibleRange: IndicatorVisibleRange,
    timestamp: number,
) => unknown

export interface IndicatorVisibleStateComposeContext {
    bundle: IndicatorSeriesBundle
    visibleRange: IndicatorVisibleRange
    timestamp: number
    active: boolean
}

export type IndicatorVisibleStateComposer = (
    context: IndicatorVisibleStateComposeContext,
) => unknown

/**
 * 标题值项：颜色 + 数值 + 标签
 */
export interface TitleValueItem {
    label: string
    value: number
    color: string
}

/**
 * 标题信息：指标名称 + 参数 + 各线实时值
 */
export interface TitleInfo {
    name: string
    params?: number[]
    values?: TitleValueItem[]
}

/**
 * 获取标题信息的回调类型
 */
export type GetTitleInfoFn = (
    data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    host: PluginHost,
    paneId: string,
) => TitleInfo | null

/**
 * 指标计算描述符
 * 描述每个指标的计算逻辑，供 IndicatorRuntime 驱动
 *
 * - 主线程：直接调用 compute
 * - Worker：用 computeKey 从 calculators 模块映射到实际函数
 * - 自定义运行时指标：无 computeKey，仅主线程 inline 运行
 */
export interface IndicatorRuntimeDescriptor<C = any> {
    /** configSnapshot 中的 key，默认等于 name（如 'macd'） */
    configKey?: string
    /** paneId 在 configSnapshot 中的 key（如 'macdPaneId'），可省略 */
    paneIdKey?: string
    /** 默认配置值 */
    defaultConfig: C
    /** 计算函数（主线程直接调用，Worker 用 computeKey 桥接） */
    compute: (data: KLineData[], config: C) => unknown
    /** Worker 端计算键名，映射到 calculators 模块的导出 */
    computeKey: string
}

/**
 * 指标元数据接口
 */
export interface IndicatorMetadata<T = unknown> {
    /**
     * 指标唯一标识
     * 如：'ma', 'boll', 'rsi', 'customIndicator'
     */
    name: string

    /**
     * 可选别名，用于兼容 UI/API 中的大写 ID 或历史名称。
     */
    aliases?: readonly string[]

    /**
     * 显示名称（用于日志和调试）
     */
    displayName: string

    /**
     * 分类：主图/副图
     */
    category: IndicatorCategory

    /**
     * StateStore key
     * - 主图指标：常量字符串（如 'indicator:ma:main'）
     * - 副图指标：函数 (paneId) => string
     */
    stateKey: StateKey

    /**
     * 在 configSnapshot 中的 paneId 字段名
     * 用于从配置中获取当前 pane ID
     */
    paneIdField?: string

    /**
     * 渲染器工厂函数
     * 调用时创建该指标的渲染器实例
     */
    rendererFactory: RendererFactory

    /**
     * 专用坐标轴渲染器工厂。未提供时可回退到 scale 通用配置。
     */
    scaleRendererFactory?: ScaleRendererFactory

    /**
     * 通用指标坐标轴配置。
     */
    scale?: {
        indicatorKey?: string
        label?: string
        decimals?: number
    }

    /**
     * 默认 pane ID
     * - 主图指标：'main'
     * - 副图指标：如 'sub_RSI'
     */
    defaultPaneId: string

    /**
     * 是否启用（可选条件判断）
     * 用于副图指标根据配置决定是否参与计算
     */
    isEnabled?: (config: IndicatorConfigSnapshot) => boolean

    /**
     * 指标配置更新入口。内置和用户自定义指标都应通过 metadata 分发。
     */
    updateConfig?: IndicatorConfigUpdater

    /**
     * 将指标计算结果写入 StateStore
     * @param host - PluginHost
     * @param state - 计算结果（由 composeRenderStates 或 composeVisibleSubIndicatorStates 产出）
     * @param paneId - 目标 pane ID（从 configSnapshot 读取）
     */
    applyResult?: (host: PluginHost, state: unknown, paneId: string) => void

    /**
     * 是否允许在主图显示（部分副图指标可切换至主图）
     * - true：指标可放置在主图（如 WMA/SAR/Pivot 等叠加类指标）
     * - false/undefined：仅限副图显示
     */
    allowMainPane?: boolean

    /**
     * 主图指标启停相关配置。
     */
    mainPane?: {
        rendererName: string
        toActiveConfig?: (params: Record<string, unknown>, active: boolean) => Record<string, unknown> | null
        computePriceRange?: IndicatorPriceRangeComputer
        composeRenderState?: IndicatorRenderStateComposer
    }

    visibleState?: {
        compose: IndicatorVisibleStateComposer
    }

    /**
     * 计算描述符（可选）
     * 提供后，IndicatorRuntime 可据此自动调度计算，无需手写展开
     */
    runtime?: IndicatorRuntimeDescriptor

    /**
     * 语义配置应用入口。
     */
    semantic?: {
        apply?: (chart: IndicatorSemanticChartAdapter, indicator: T) => void
    }

    /**
     * 标题信息获取回调（决定 pane 标题栏显示内容）
     * - 副图指标：由 paneTitle 渲染器调用
     * - 主图指标：由 mainIndicatorLegend 渲染器调用
     * 未提供时 fallback 到 displayName
     */
    getTitleInfo?: GetTitleInfoFn
}

/**
 * 提取 stateKey 对应的实际 key 值
 * @param stateKey - 可以是字符串或函数
 * @param paneId - pane ID（副图指标需要）
 * @returns 实际的 state key 字符串
 */
export function resolveStateKey(stateKey: StateKey, paneId?: string): string {
    if (typeof stateKey === 'function') {
        if (!paneId) {
            throw new Error('[IndicatorMetadata] Pane ID required for dynamic state key')
        }
        return stateKey(paneId)
    }
    return stateKey
}
