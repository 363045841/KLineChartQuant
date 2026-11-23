/**
 * K 线级别收藏：设备级偏好，页面内所有图表共用一份状态。
 * 收藏只影响入口的呈现，不参与周期切换与布局文档。
 */

import {
  createLocalStoragePersistence,
  type KeyValueStorage,
  type PersistenceCodec,
} from '@363045841yyt/klinechart-core'
import { isKLineLevel, type KLineLevel } from '@vue-src/components/toolbar/kLineLevel.js'
import { loadPreference } from '@vue-src/utils/loadPreference.js'
import {
  getCurrentInstance,
  inject,
  type InjectionKey,
  readonly,
  type Ref,
  ref,
} from 'vue'

/** 收藏级别的存储键；与侧栏宽度、配色偏好同属设备级设置。 */
const FAVORITES_STORAGE_KEY = 'chart.kLineLevelFavorites'

/** 持久化边界：只接受已知档位并去重，脏数据不让它进入界面。 */
const favoritesCodec: PersistenceCodec<ReadonlyArray<KLineLevel>> = {
  decode(value): ReadonlyArray<KLineLevel> | null {
    if (!Array.isArray(value)) return null
    const levels = new Set<KLineLevel>()
    for (const entry of value) {
      if (typeof entry === 'string' && isKLineLevel(entry)) levels.add(entry)
    }
    return Object.freeze([...levels])
  },
  encode(value): unknown {
    return value
  },
}

/** 收藏状态与切换入口；切换会同步写入设备偏好。 */
export interface KLineLevelFavoritesState {
  /** 已收藏档位，按收藏先后排列；展示顺序由调用方决定。 */
  readonly favoriteLevels: Readonly<Ref<ReadonlyArray<KLineLevel>>>
  isFavorite(level: KLineLevel): boolean
  toggleFavorite(level: KLineLevel): void
}

/**
 * 创建一份收藏状态。
 *
 * @param options.storage 存储后端；省略时使用浏览器 localStorage，测试可注入内存实现
 * @returns 收藏快照与读写操作
 */
export function createKLineLevelFavorites(
  options: { storage?: KeyValueStorage | null } = {},
): KLineLevelFavoritesState {
  const persistence = createLocalStoragePersistence({
    key: FAVORITES_STORAGE_KEY,
    codec: favoritesCodec,
    storage: options.storage,
  })
  const state = ref<ReadonlyArray<KLineLevel>>(
    Object.freeze(loadPreference(() => persistence.load()) ?? []),
  )
  const favoriteLevels = readonly(state)

  /** 判断档位是否已收藏。 */
  function isFavorite(level: KLineLevel): boolean {
    return state.value.includes(level)
  }

  /** 切换档位收藏并落盘；写入失败只影响下次启动的恢复，不中断本次切换。 */
  function toggleFavorite(level: KLineLevel): void {
    const current = state.value
    const next = current.includes(level)
      ? current.filter((entry) => entry !== level)
      : [...current, level]
    state.value = Object.freeze(next)
    try {
      persistence.save(state.value)
    } catch (error) {
      console.error('[KLineLevelFavorites] 收藏保存失败', error)
    }
  }

  return { favoriteLevels, isFavorite, toggleFavorite }
}

/** 宿主可为子树注入自己的收藏状态；未注入时回落到模块级共享实例。 */
export const KLINE_LEVEL_FAVORITES_KEY: InjectionKey<KLineLevelFavoritesState> =
  Symbol('KLineLevelFavorites')

let sharedFavorites: KLineLevelFavoritesState | null = null

/**
 * 读取级别收藏状态。
 *
 * @returns 宿主注入的状态；独立挂载时使用模块级共享实例
 */
export function useKLineLevelFavorites(): KLineLevelFavoritesState {
  const injected = getCurrentInstance() ? inject(KLINE_LEVEL_FAVORITES_KEY, null) : null
  if (injected !== null) return injected
  sharedFavorites ??= createKLineLevelFavorites()
  return sharedFavorites
}
