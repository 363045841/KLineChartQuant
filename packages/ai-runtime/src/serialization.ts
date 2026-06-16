import type { ChartAlertsEntry, SerializedChartState } from './types'

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
  alerts?: ReadonlyArray<ChartAlertsEntry>
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

function validateViewport(vp: unknown): boolean {
  if (vp === undefined) return true
  if (typeof vp !== 'object' || vp === null) return false
  const o = vp as Record<string, unknown>
  return typeof o.zoomLevel === 'number' && typeof o.visibleFrom === 'number' && typeof o.visibleTo === 'number'
}

// fallow-ignore-next-line complexity
function validateControllers(
  c: unknown,
): c is SerializedChartState['controllers'] {
  if (typeof c !== 'object' || c === null) return false
  const ctrl = c as Record<string, unknown>

  if (!validateViewport(ctrl.viewport)) return false
  if (ctrl.theme !== undefined && ctrl.theme !== 'light' && ctrl.theme !== 'dark') return false
  if (ctrl.indicators !== undefined && !Array.isArray(ctrl.indicators)) return false
  if (ctrl.alerts !== undefined && !Array.isArray(ctrl.alerts)) return false

  return true
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
  if (!validateControllers(root.controllers)) {
    throw new ChartSerializationError(
      'INVALID_CONTROLLERS',
      'controllers fields failed validation — types or structure mismatch.',
    )
  }
  return root as SerializedChartState
}
