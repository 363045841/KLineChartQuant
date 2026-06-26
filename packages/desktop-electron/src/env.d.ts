/** Desktop platform API bridge injected by preload script. */
export interface DesktopAPI {
  store: {
    get(key: string): unknown
    set(key: string, value: unknown): void
  }
  file: {
    saveDialog(options: {
      defaultName?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }): Promise<string | null>
    saveFile(filePath: string, content: string): Promise<boolean>
    openDialog(options: {
      filters?: Array<{ name: string; extensions: string[] }>
      multiSelections?: boolean
    }): Promise<string[] | null>
    readFile(filePath: string): Promise<string>
  }
  window: {
    minimize(): void
    maximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizeChange(callback: (maximized: boolean) => void): () => void
  }
  app: {
    getVersion(): string
  }
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI
  }
}
