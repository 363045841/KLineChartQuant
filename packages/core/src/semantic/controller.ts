import { EventBus } from '../plugin/EventBus'
import type { CustomMarkerEntity } from '../engine/marker/registry'
import { SemanticConfigValidator } from './validator'
import { getBuiltinIndicatorDefinitions } from '../engine/indicators/registerBuiltins'
import { getRegisteredIndicatorDefinition } from '../engine/indicators/indicatorDefinitionRegistry'
import type { IndicatorMetadata } from '../engine/indicators/indicatorMetadata'
import type {
  SemanticChartConfig,
  ApplyResult,
  MainIndicatorConfig,
  SubIndicatorConfig,
  CustomMarker,
  DataConfig,
} from './types'
import type { SubIndicatorType as CoreSubIndicatorType } from '../engine/renderers/Indicator'
import type { KLineData } from '../controllers/types'

export type SemanticEventType = 'config:loading' | 'config:ready' | 'config:error'

export type DataFetcher = (
  source: string,
  config: {
    symbol: string
    startDate: string
    endDate: string
    period: string
    adjust: string
  },
) => Promise<ReadonlyArray<KLineData>>

let _dataFetcher: DataFetcher | null = null

function normalizeIndicatorId(id: string): string {
  return id.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function getSemanticIndicatorDefinition(type: string): IndicatorMetadata | undefined {
  const registered = getRegisteredIndicatorDefinition(type)
  if (registered) return registered

  const normalizedType = normalizeIndicatorId(type)
  return getBuiltinIndicatorDefinitions().find((definition) => {
    const candidates = [definition.name, definition.displayName, ...(definition.aliases ?? [])]
    return candidates.some((candidate) => normalizeIndicatorId(candidate) === normalizedType)
  })
}

export function __setDataFetcher(fetcher: DataFetcher | null): void {
  _dataFetcher = fetcher
}

async function getDataFetcher(): Promise<DataFetcher> {
  if (_dataFetcher === null) {
    throw new Error(
      '[SemanticChartController] No data fetcher registered. ' +
        'Call __setDataFetcher(...) before applying a config that requires data fetching.',
    )
  }
  return _dataFetcher
}

export interface SemanticChartAdapter {
  updateData(data: ReadonlyArray<KLineData>): void
  updateRendererConfig(name: string, config: Record<string, unknown>): void
  clearSubPanes(): void
  createSubPane(paneId: string, indicatorId: CoreSubIndicatorType, params?: Record<string, unknown>): boolean
  clearCustomMarkers(): void
  updateCustomMarkers(markers: ReadonlyArray<CustomMarkerEntity>): void
}

export class SemanticChartController {
  private chart: SemanticChartAdapter
  private validator: SemanticConfigValidator
  private events: EventBus

  constructor(chart: SemanticChartAdapter) {
    this.chart = chart
    this.validator = new SemanticConfigValidator()
    this.events = new EventBus()
  }

  async applyConfig(config: SemanticChartConfig): Promise<ApplyResult> {
    const validation = await this.validator.validate(config)
    if (!validation.valid) {
      return { success: false, errors: validation.errors }
    }

    const security = this.validator.securityCheck(config)
    if (!security.passed) {
      return { success: false, errors: security.violations }
    }

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

  on(event: SemanticEventType, handler: (data?: unknown) => void): void {
    this.events.on(event, handler)
  }

  off(event: SemanticEventType, handler: (data?: unknown) => void): void {
    this.events.off(event, handler)
  }

  private async doApplyConfig(config: SemanticChartConfig): Promise<void> {
    const fetcher = await getDataFetcher()
    const data = await fetcher(config.data.source, {
      symbol: config.data.symbol,
      startDate: config.data.startDate,
      endDate: config.data.endDate,
      period: config.data.period,
      adjust: config.data.adjust,
    })
    this.chart.updateData(data)

    if (config.indicators) {
      this.applyIndicators(config.indicators.main, config.indicators.sub)
    }

    if (config.markers) {
      this.applyMarkers(config.markers.customMarkers, config.data.period)
    }

    if (config.chart) {
      this.applyChartOptions(config.chart)
    }
  }

  private applyIndicators(main?: MainIndicatorConfig[], sub?: SubIndicatorConfig[]): void {
    if (main) {
      for (const indicator of main) {
        if (!indicator.enabled) continue
        getSemanticIndicatorDefinition(indicator.type)?.semantic?.apply?.(this.chart, indicator)
      }
    }

    this.chart.clearSubPanes()

    if (sub) {
      for (const indicator of sub) {
        this.applySubIndicator(indicator)
      }
    }
  }

  private applySubIndicator(indicator: SubIndicatorConfig): void {
    if (!indicator.enabled) return
    const { type, params } = indicator
    const paneId = `${type}_0`
    const indicatorId = type
    const success = this.chart.createSubPane(paneId, indicatorId as CoreSubIndicatorType, params)
    if (!success) {
      console.warn(`[Semantic] Failed to create sub pane for ${type}`)
    }
  }

  private applyMarkers(markers?: CustomMarker[], period?: DataConfig['period']): void {
    if (!markers || markers.length === 0) {
      this.chart.clearCustomMarkers()
      return
    }
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
    if (options.autoScrollToRight !== undefined) {
    }
  }
}

function parseDateToTimestamp(dateStr: string, _period: DataConfig['period']): number {
  const hasTime = dateStr.includes(' ')
  if (hasTime) {
    const [datePart, timePart] = dateStr.split(' ')
    const parts = datePart!.split('-').map(Number)
    const year = parts[0]!
    const month = parts[1]!
    const day = parts[2]!
    const timeParts = timePart!.split(':').map(Number)
    const hour = timeParts[0]!
    const minute = timeParts[1]!
    return Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0)
  } else {
    const parts = dateStr.split('-').map(Number)
    const year = parts[0]!
    const month = parts[1]!
    const day = parts[2]!
    return Date.UTC(year, month - 1, day, 0 - 8, 0, 0, 0)
  }
}
