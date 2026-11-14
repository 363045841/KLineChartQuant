/**
 * 内存文档仓库：与 IndexedDB 仓库同契约，供宿主预览和测试替换真实存储。
 */
import type { DocumentStore } from '../types.js'
import { closedFailure } from './errors.js'

/** 克隆一份值，避免调用方和仓库共享可变对象。 */
function clone<T>(value: T): T {
  return structuredClone(value)
}

/** 创建内存文档仓库；初始值按“已存在记录”处理。 */
export function createMemoryDocumentStore<T>(initial: T | null = null): DocumentStore<T> {
  let value: T | null = initial === null ? null : clone(initial)
  let disposed = false

  /** 已释放的仓库拒绝一切操作。 */
  function requireActive(): void {
    if (disposed) throw closedFailure()
  }

  return {
    async read(): Promise<T | null> {
      requireActive()
      return value === null ? null : clone(value)
    },

    async write(next: T): Promise<void> {
      requireActive()
      value = clone(next)
    },

    async update(change: (current: T | null) => T): Promise<T> {
      requireActive()
      value = clone(change(value === null ? null : clone(value)))
      return clone(value)
    },

    async remove(): Promise<void> {
      requireActive()
      value = null
    },

    async dispose(): Promise<void> {
      disposed = true
      value = null
    },
  }
}
