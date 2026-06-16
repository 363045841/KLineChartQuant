import type { ToolCall, ToolResult, ControllerDescription } from '@363045841yyt/klinechart-core'

export interface SessionHandle {
  readonly sessionId: string
  executeTool(call: ToolCall): Promise<ToolResult>
}

export class SessionRegistry {
  private sessions = new Map<string, SessionHandle>()
  private states = new Map<string, Record<string, ControllerDescription>>()

  register(sessionId: string, handle: SessionHandle): void {
    this.sessions.set(sessionId, handle)
    this.states.set(sessionId, {})
  }

  unregister(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.states.delete(sessionId)
  }

  get(sessionId: string): SessionHandle | undefined {
    return this.sessions.get(sessionId)
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys())
  }

  updateState(
    sessionId: string,
    descriptions: Record<string, ControllerDescription>,
  ): void {
    const existing = this.states.get(sessionId)
    if (existing) {
      this.states.set(sessionId, { ...existing, ...descriptions })
    }
  }

  getState(
    sessionId: string,
  ): Record<string, ControllerDescription> | undefined {
    return this.states.get(sessionId)
  }

  getSummary(sessionId: string): string {
    const descriptions = this.states.get(sessionId)
    if (!descriptions) return 'No state available.'

    const parts: string[] = []
    for (const desc of Object.values(descriptions)) {
      parts.push(`[${desc.controllerId}] ${desc.summary}`)
    }
    return parts.length > 0 ? parts.join(' | ') : 'No controllers described.'
  }
}
