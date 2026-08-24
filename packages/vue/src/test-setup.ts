/** Shared browser API shims for Vue Renderer tests. */
import { afterEach, vi } from 'vitest'

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>()

  get length(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.entries.delete(key)
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value))
  }
}

if (!window.localStorage) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  })
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn<(query: string) => MediaQueryList>().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
    addListener: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    dispatchEvent: vi.fn<(event: Event) => boolean>().mockReturnValue(false),
  })),
})

function scrollToStub(options?: ScrollToOptions): void
function scrollToStub(x: number, y: number): void
function scrollToStub(_optionsOrX?: ScrollToOptions | number, _y?: number): void {
  return
}

HTMLElement.prototype.scrollTo = scrollToStub

class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverStub

afterEach(() => {
  document.body.replaceChildren()
  window.localStorage.clear()
  vi.useRealTimers()
})
