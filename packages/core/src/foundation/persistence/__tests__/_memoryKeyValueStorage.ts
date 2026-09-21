/**
 * 持久化原语测试共享替身：内存 KeyValueStorage，保留最近一次写入值并记录调用。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */
import { vi } from 'vitest'

import type { KeyValueStorage } from '../localStoragePersistence.js'

/** 创建内存 KeyValueStorage 替身；initial 为预置的原始字符串值。 */
export function createMemoryKeyValueStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: vi.fn((_key: string): string | null => value),
    setItem: vi.fn((_key: string, next: string): void => {
      value = next
    }),
    removeItem: vi.fn((_key: string): void => {
      value = null
    }),
  } satisfies KeyValueStorage
}
