/**
 * 语义化图表控制器
 * 负责校验配置、应用配置、状态反馈
 */

import { EventBus } from '@/plugin/EventBus'
import { fetchKLineData } from '@/api/data'
import type { Chart } from '@/core/chart'
import type { CustomMarkerEntity } from '@/core/marker/registry'
import { SemanticConfigValidator } from './validator'
import type {
  SemanticChartConfig,
  ApplyResult,
  MainIndicatorConfig,
  SubIndicatorConfig,
  CustomMarker,
  DataConfig,
} from './types'
import type { SubIndicatorType as CoreSubIndicatorType } from '@/core/renderers/Indicator'

/** 状态事件类型 */
export type SemanticEventType = 'config:loading' | 'config:ready' | 'config:error'

export class SemanticChartController {
  private chart: Chart
  private validator: SemanticConfigValidator
  private events: EventBus

  constructor(chart: Chart) {
    this.chart = chart
    this.validator = new SemanticConfigValidator()
    this.events = new EventBus()
  }

  /**
   * 应用语义化配置
   */
  async applyConfig(config: SemanticChartConfig): Promise<ApplyResult> {
    // 1. Schema 校验
    const validation = await this.validator.validate(config)
    if (!validation.valid) {
      return { success: false, errors: validation.errors }
    }

    // 2. 安全校验（同步）
    const security = this.validator.securityCheck(config)
    if (!security.passed) {
      return { success: false, errors: security.violations }
    }

    // 3. 应用配置
    this.events.emit('config:loading', undefined)
    try {
      await this.doApplyConfig(config)
      this.events.emit('config:ready', undefined)
      return { success: true }
    } catch (error) {
      this.events.emit('config:error', error)
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      }
    }
  }

  /**
   * 订阅状态事件
   */
  on(event: SemanticEventType, handler: (data?: unknown) => void): void {
    this.events.on(event, handler)
  }

  /**
   * 取消订阅
   */
  off(event: SemanticEventType, handler: (data?: unknown) => void): void {
    this.events.off(event, handler)
  }

  // ============ 私有方法 ============

  /**
   * 应用语义化 UI 配置
   * @param config 语义化配置
   */
  private async doApplyConfig(config: SemanticChartConfig): Promise<void> {
    console.log('[Semantic] doApplyConfig start, data config:', config.data)

    // 1. 获取数据
    const data = await fetchKLineData(config.data.source, {
      symbol: config.data.symbol,
      startDate: config.data.startDate,
      endDate: config.data.endDate,
      period: config.data.period,
      adjust: config.data.adjust,
    })
    console.log('[Semantic] fetched data:', data.length, 'items')
    // 请求 chart 更新数据
    this.chart.updateData(data)

    // 2. 应用指标配置
    if (config.indicators) {
      console.log('[Semantic] applying indicators:', config.indicators)
      this.applyIndicators(config.indicators.main, config.indicators.sub)
    }

    // 3. 应用标记配置
    if (config.markers) {
      console.log('[Semantic] applying markers:', config.markers.customMarkers?.length, 'markers')
      this.applyMarkers(config.markers.customMarkers, config.data.period)
    }

    // 4. 应用图表选项
    if (config.chart) {
      this.applyChartOptions(config.chart)
    }

    console.log('[Semantic] doApplyConfig done')
  }

  private applyIndicators(main?: MainIndicatorConfig[], sub?: SubIndicatorConfig[]): void {
    // 主图指标
    if (main) {
      for (const indicator of main) {
        if (!indicator.enabled) continue

        switch (indicator.type) {
          case 'MA':
            this.applyMAIndicator(indicator)
            break
          case 'BOLL':
            this.applyBOLLIndicator(indicator)
            break
          case 'EXPMA':
            this.applyEXPMAIndicator(indicator)
            break
          case 'ENE':
            this.applyENEIndicator(indicator)
            break
        }
      }
    }

    // 副图指标：先清除现有副图，再创建新的
    this.chart.clearSubPanes()

    if (sub) {
      for (const indicator of sub) {
        this.applySubIndicator(indicator)
      }
    }
  }

  private applyMAIndicator(indicator: { type: 'MA'; enabled: boolean; params?: { periods: number[] } }): void {
    const periods = indicator.params?.periods || [5, 10, 20, 30, 60]

    // 将 periods 数组转换为 MAFlags 格式
    const maFlags: { ma5?: boolean; ma10?: boolean; ma20?: boolean; ma30?: boolean; ma60?: boolean } = {}
    for (const p of periods) {
      if (p === 5) maFlags.ma5 = true
      else if (p === 10) maFlags.ma10 = true
      else if (p === 20) maFlags.ma20 = true
      else if (p === 30) maFlags.ma30 = true
      else if (p === 60) maFlags.ma60 = true
    }

    console.log('[Semantic] applyMAIndicator, periods:', periods, 'maFlags:', maFlags)

    // 调用 Chart 的渲染器配置接口
    this.chart.updateRendererConfig('ma', maFlags)
  }

  private applyBOLLIndicator(indicator: {
    type: 'BOLL'
    enabled: boolean
    params?: { period?: number; multiplier?: number }
  }): void {
    const config = {
      period: indicator.params?.period || 20,
      multiplier: indicator.params?.multiplier || 2,
    }
    // 只更新配置，不设置启用状态
    // 启用状态由 UI 层 (activeIndicators watch) 控制
    this.chart.updateRendererConfig('boll', config)
  }

  private applyEXPMAIndicator(indicator: {
    type: 'EXPMA'
    enabled: boolean
    params?: { fastPeriod?: number; slowPeriod?: number }
  }): void {
    const config = {
      fastPeriod: indicator.params?.fastPeriod || 12,
      slowPeriod: indicator.params?.slowPeriod || 50,
    }
    this.chart.updateRendererConfig('expma', config)
  }

  private applyENEIndicator(indicator: {
    type: 'ENE'
    enabled: boolean
    params?: { period?: number; deviation?: number }
  }): void {
    const config = {
      period: indicator.params?.period || 10,
      deviation: indicator.params?.deviation || 11,
    }
    this.chart.updateRendererConfig('ene', config)
  }

  private applySubIndicator(indicator: SubIndicatorConfig): void {
    if (!indicator.enabled) return

    const { type, params } = indicator

    // 生成 paneId（格式：'RSI_0', 'MACD_0'）
    const paneId = `${type}_0`

    // 直接调用 Chart 的副图创建 API
    const success = this.chart.createSubPane(paneId, type as CoreSubIndicatorType, params)
    if (!success) {
      console.warn(`[Semantic] Failed to create sub pane for ${type}`)
    }
  }

  private applyMarkers(markers?: CustomMarker[], period?: DataConfig['period']): void {
    if (!markers || markers.length === 0) {
      this.chart.clearCustomMarkers()
      return
    }
    // 将 date 字符串转换为 timestamp，生成 CustomMarkerEntity
    const entities: CustomMarkerEntity[] = markers.map((marker) => ({
      id: marker.id,
      date: marker.date,
      timestamp: parseDateToTimestamp(marker.date, period || 'daily'),
      shape: marker.shape,
      groupKey: marker.groupKey,
      offset: marker.offset,
      style: marker.style,
      label: marker.label,
      metadata: marker.metadata,
    }))
    this.chart.updateCustomMarkers(entities)
  }

  private applyChartOptions(options: { kWidth?: number; kGap?: number; autoScrollToRight?: boolean }): void {
    // 注意：Chart 类可能需要扩展以支持动态更新选项
    if (options.autoScrollToRight !== undefined) {
      // 设置自动滚动
    }
  }
}

/**
 * 解析日期字符串为 Unix 毫秒时间戳
 * @param dateStr 日期字符串，格式：YYYY-MM-DD 或 YYYY-MM-DD HH:mm
 * @param period K线周期（预留，用于未来支持不同时区处理）
 * @returns Unix 毫秒时间戳（上海时区，与 K 线数据一致）
 */
function parseDateToTimestamp(dateStr: string, _period: DataConfig['period']): number {
  // 判断是否包含时间部分
  const hasTime = dateStr.includes(' ')

  if (hasTime) {
    // YYYY-MM-DD HH:mm 格式
    const [datePart, timePart] = dateStr.split(' ')
    const parts = datePart!.split('-').map(Number)
    const year = parts[0]!
    const month = parts[1]!
    const day = parts[2]!
    const timeParts = timePart!.split(':').map(Number)
    const hour = timeParts[0]!
    const minute = timeParts[1]!
    // 上海时区 = UTC+8
    return Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0)
  } else {
    // YYYY-MM-DD 格式
    const parts = dateStr.split('-').map(Number)
    const year = parts[0]!
    const month = parts[1]!
    const day = parts[2]!
    // 上海时区 00:00 = UTC 前一天 16:00
    // 与 ymdToShanghaiTimestamp 保持一致
    return Date.UTC(year, month - 1, day, 0 - 8, 0, 0, 0)
  }
}
