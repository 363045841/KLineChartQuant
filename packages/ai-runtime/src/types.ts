export interface McpToolSchema {
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  safety: 'readonly' | 'mutates-state' | 'destroys-state'
}

export type JsonSchema =
  | {
      type: 'object'
      properties: Record<string, JsonSchema>
      required?: string[]
      additionalProperties?: boolean
      description?: string
    }
  | { type: 'array'; items: JsonSchema; description?: string }
  | { type: 'string'; enum?: ReadonlyArray<string>; description?: string }
  | { type: 'number'; minimum?: number; maximum?: number; description?: string }
  | { type: 'integer'; minimum?: number; maximum?: number; description?: string }
  | { type: 'boolean'; description?: string }
  | { type: 'null'; description?: string }
  | { oneOf: JsonSchema[]; description?: string }
  | { anyOf: JsonSchema[]; description?: string }

export interface ControllerDescription {
  controllerId: string
  summary: string
  facts: Readonly<Record<string, string | number | boolean | null>>
  warnings?: ReadonlyArray<string>
}

export interface SerializedChartState {
  schemaVersion: 1
  snapshotTakenAt: string
  label?: string
  controllers: {
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
}
