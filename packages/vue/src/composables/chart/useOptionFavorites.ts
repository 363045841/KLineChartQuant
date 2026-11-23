/**
 * 工具栏选项收藏的通用实现：一组互斥选项里按设备偏好记住常用项。
 * 存储键、值域校验与注入键由调用方给，级别与复权共用同一份读写逻辑。
 */

import {
  createLocalStoragePersistence,
  type KeyValueStorage,
  type PersistenceCodec,
} from '@363045841yyt/klinechart-core'
import { loadPreference } from '@vue-src/utils/loadPreference.js'
import {
  computed,
  type ComputedRef,
  getCurrentInstance,
  inject,
  type InjectionKey,
  shallowRef,
} from 'vue'

/** 收藏状态与切换入口；切换会同步写入设备偏好。 */
export interface OptionFavoritesState<T extends string> {
  /** 已收藏选项，按收藏先后排列；展示顺序由调用方决定。 */
  readonly favoriteOptions: ComputedRef<ReadonlyArray<T>>
  isFavorite(option: T): boolean
  toggleFavorite(option: T): void
}

/** 一份收藏存储的配置。 */
export interface OptionFavoritesConfig<T extends string> {
  /** 设备偏好键；每种选项集合必须各自独立。 */
  readonly storageKey: string
  /** 值域校验：只有已知选项才能进入收藏。 */
  readonly isValidOption: (value: string) => value is T
}

/** 一组选项的收藏入口：注入键、测试用工厂与组件读取入口。 */
export interface OptionFavoritesStore<T extends string> {
  /** 宿主可为子树提供自己的收藏状态；测试也用它注入替身。 */
  readonly key: InjectionKey<OptionFavoritesState<T>>
  create(options?: { storage?: KeyValueStorage | null }): OptionFavoritesState<T>
  use(): OptionFavoritesState<T>
}

/**
 * 创建一组选项的收藏入口。
 *
 * @param config 存储键与值域校验
 * @returns 注入键、工厂与组件读取入口
 */
export function createOptionFavoritesStore<T extends string>(
  config: OptionFavoritesConfig<T>,
): OptionFavoritesStore<T> {
  const codec: PersistenceCodec<ReadonlyArray<T>> = {
    decode(value): ReadonlyArray<T> | null {
      if (!Array.isArray(value)) return null
      const options = new Set<T>()
      for (const entry of value) {
        if (typeof entry === 'string' && config.isValidOption(entry)) options.add(entry)
      }
      return Object.freeze([...options])
    },
    encode(value): unknown {
      return value
    },
  }
  const key: InjectionKey<OptionFavoritesState<T>> = Symbol(config.storageKey)
  let shared: OptionFavoritesState<T> | null = null

  /** 创建一份收藏状态；storage 省略时用浏览器 localStorage，测试可注入内存实现。 */
  function create(options: { storage?: KeyValueStorage | null } = {}): OptionFavoritesState<T> {
    const persistence = createLocalStoragePersistence({
      key: config.storageKey,
      codec,
      storage: options.storage,
    })
    const state = shallowRef<ReadonlyArray<T>>(
      Object.freeze(loadPreference(() => persistence.load()) ?? []),
    )
    const favoriteOptions = computed(() => state.value)

    /** 判断选项是否已收藏。 */
    function isFavorite(option: T): boolean {
      return state.value.includes(option)
    }

    /** 切换选项收藏并落盘；写入失败只影响下次启动的恢复，不中断本次切换。 */
    function toggleFavorite(option: T): void {
      const current = state.value
      const next = current.includes(option)
        ? current.filter((entry) => entry !== option)
        : [...current, option]
      state.value = Object.freeze(next)
      try {
        persistence.save(state.value)
      } catch (error) {
        console.error(`[OptionFavorites] ${config.storageKey} 保存失败`, error)
      }
    }

    return { favoriteOptions, isFavorite, toggleFavorite }
  }

  /** 读取本组件树的收藏状态；未注入时回落到模块级共享实例。 */
  function use(): OptionFavoritesState<T> {
    const injected = getCurrentInstance() ? inject(key, null) : null
    if (injected !== null) return injected
    shared ??= create()
    return shared
  }

  return { key, create, use }
}
