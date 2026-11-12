/** 页面级外观偏好：持久化用户选择，并同步同源窗口的外观更新。 */
import { type ChartSettings, normalizeSettings } from '@363045841yyt/klinechart-core/config'
import { scopedPersistenceName } from '@363045841yyt/klinechart-core/persistence-scope'
import { onScopeDispose, readonly, ref } from 'vue'

const APPEARANCE_STORAGE_KEY = '@363045841yyt/klinechart/appearance'

/** 只接受已知模式；未保存或存储损坏时使用产品默认设置。 */
function readMode(value: string | null): ChartSettings['theme'] {
  return value === 'light' || value === 'dark' || value === 'auto'
    ? value
    : normalizeSettings().theme
}

/** 外壳持有偏好，图表只接收它，避免各标签争用页面主题。 */
export function useWorkspaceAppearance() {
  const key = scopedPersistenceName(APPEARANCE_STORAGE_KEY)
  const mode = ref(readMode(localStorage.getItem(key)))

  /** 先保存再发布；刷新后与当前选择一致。 */
  function setMode(value: ChartSettings['theme']): void {
    if (value === undefined) return
    localStorage.setItem(key, value)
    mode.value = value
  }

  /** 其它同源窗口更新设置或清空存储时同步当前偏好。 */
  function onStorage(event: StorageEvent): void {
    if (event.key === key || event.key === null) mode.value = readMode(event.newValue)
  }
  window.addEventListener('storage', onStorage)
  onScopeDispose(() => window.removeEventListener('storage', onStorage))
  return { mode: readonly(mode), setMode }
}
