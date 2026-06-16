import type { SerializedChartState } from './types'

const SCHEMA_VERSION = 1 as const

export class ChartSerializationError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ChartSerializationError'
    this.code = code
  }
}

export interface ChartSnapshotInput {
  label?: string
  viewport?: { zoomLevel: number; visibleFrom: number; visibleTo: number }
  theme?: 'light' | 'dark'
  indicators?: ReadonlyArray<{
    definitionId: string
    params: Readonly<Record<string, number | string | boolean>>
  }>
  alerts?: ReadonlyArray<{
    id: string
    name: string
    predicate: unknown
    oneShot: boolean
    cooldownMs?: number
  }>
}

export function serialize(
  snapshot: ChartSnapshotInput,
): SerializedChartState {
  const controllers: SerializedChartState['controllers'] = {}
  if (snapshot.viewport !== undefined) controllers.viewport = snapshot.viewport
  if (snapshot.theme !== undefined) controllers.theme = snapshot.theme
  if (snapshot.indicators !== undefined)
    controllers.indicators = snapshot.indicators
  if (snapshot.alerts !== undefined) controllers.alerts = snapshot.alerts
  const out: SerializedChartState = {
    schemaVersion: SCHEMA_VERSION,
    snapshotTakenAt: new Date().toISOString(),
    controllers,
  }
  if (snapshot.label !== undefined) out.label = snapshot.label
  return out
}

export function deserialize(json: string): SerializedChartState {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new ChartSerializationError(
      'INVALID_JSON',
      `Could not parse SerializedChartState as JSON: ${(err as Error).message}`,
    )
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ChartSerializationError(
      'NOT_OBJECT',
      'SerializedChartState root must be an object.',
    )
  }
  const root = parsed as Partial<SerializedChartState>
  if (root.schemaVersion !== SCHEMA_VERSION) {
    throw new ChartSerializationError(
      'SCHEMA_VERSION_MISMATCH',
      `Expected schemaVersion ${SCHEMA_VERSION}, got ${String(root.schemaVersion)}.`,
    )
  }
  if (
    typeof root.snapshotTakenAt !== 'string' ||
    Number.isNaN(Date.parse(root.snapshotTakenAt))
  ) {
    throw new ChartSerializationError(
      'INVALID_TIMESTAMP',
      'snapshotTakenAt must be an ISO 8601 string.',
    )
  }
  if (typeof root.controllers !== 'object' || root.controllers === null) {
    throw new ChartSerializationError(
      'MISSING_CONTROLLERS',
      'controllers object is required.',
    )
  }
  return root as SerializedChartState
}
