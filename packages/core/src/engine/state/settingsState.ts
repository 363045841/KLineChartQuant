/** 用户偏好设置状态模块：解析、迁移与冻结快照。 */
import { batch, createSubState } from '../../foundation/reactivity/signal'
import {
  migrateStoredSettings,
  resolveSettings,
  type ChartSettings,
} from '../../foundation/config/chartSettings'
import { deepFreezeSnapshot } from './immutable'

function normalizePartial(partial?: Partial<ChartSettings>): Partial<ChartSettings> {
  if (!partial) return {}
  return migrateStoredSettings(partial as Record<string, unknown>)
}

function snapshotSettings(partial?: Partial<ChartSettings>): Readonly<ChartSettings> {
  return deepFreezeSnapshot(resolveSettings(normalizePartial(partial))) as Readonly<ChartSettings>
}

function settingsEqual(a: Readonly<ChartSettings>, b: Readonly<ChartSettings>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (key === 'colorPresetSettings') {
      if (JSON.stringify(a.colorPresetSettings) !== JSON.stringify(b.colorPresetSettings)) {
        return false
      }
      continue
    }
    if (!Object.is(a[key], b[key])) return false
  }
  return true
}

export function createSettingsState(initial?: Partial<ChartSettings>) {
  const { signals, readonly } = createSubState({
    settings: snapshotSettings(initial) as Readonly<ChartSettings>,
  })

  const write = (next: Readonly<ChartSettings>) => {
    if (settingsEqual(signals.settings.peek(), next)) return
    signals.settings.set(next)
  }

  return {
    readonly,
    actions: {
      replace(partial?: Partial<ChartSettings>) {
        write(snapshotSettings(partial))
      },
      patch(partial: Partial<ChartSettings>) {
        const merged = { ...signals.settings.peek(), ...normalizePartial(partial) }
        write(snapshotSettings(merged))
      },
    },
    dispose() {
      batch(() => {
        signals.settings.set(snapshotSettings({}))
      })
    },
  }
}

export type SettingsStateModule = ReturnType<typeof createSettingsState>
