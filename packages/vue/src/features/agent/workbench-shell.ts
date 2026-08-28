export interface AgentPanelWidthStorage {
  load(): number | null | undefined
  save(width: number): void
}
