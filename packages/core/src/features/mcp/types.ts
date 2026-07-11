export interface ToolCall {
  name: string
  input: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  error?: string
  data?: unknown
}

export type ToolCallHandler = (call: ToolCall) => ToolResult | Promise<ToolResult>

export interface ControllerDescription {
  controllerId: string
  summary: string
  facts: Readonly<Record<string, string | number | boolean | null>>
  warnings?: ReadonlyArray<string>
}
