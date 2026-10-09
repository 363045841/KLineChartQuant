// 本文件实现图表偏好设置的唯一写原语：UI 控件、命令面板与 Agent 工具调用同一组方法（ADR 0006）。
import { type Static, Type } from 'typebox'

import { Tool } from '../../foundation/agent/chartToolRegistry.js'
import { ToolInputValidationError } from '../../foundation/agent/errors.js'
import {
  type ChartSettings,
  DEFAULT_SETTINGS,
  resolveSettingDefault,
  type SettingItem,
} from '../../foundation/config/chartSettings.js'
import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'

/** 颜色配置不在 DEFAULT_SETTINGS 中，但同样属于用户偏好，可被读取、写入与恢复默认。 */
export const COLOR_PRESET_SETTINGS_KEY = 'colorPresetSettings'

const SETTING_ITEMS = DEFAULT_SETTINGS as unknown as ReadonlyArray<SettingItem>
const SETTING_ITEM_BY_KEY = new Map(SETTING_ITEMS.map((item) => [item.key, item]))

/** 设置值：布尔、枚举字符串或数值；colorPresetSettings 为对象，由 kernel 归一化。 */
const SettingsUpdateToolParameters = Type.Object(
  {
    values: Type.Record(Type.String({ minLength: 1 }), Type.Unknown()),
  },
  { additionalProperties: false },
)

const SettingsResetToolParameters = Type.Object(
  {
    /** 要恢复默认的设置 key；省略时恢复全部设置。 */
    keys: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
  },
  { additionalProperties: false },
)

const SettingsGetToolParameters = Type.Object({}, { additionalProperties: false })

export type SettingsUpdateInput = Static<typeof SettingsUpdateToolParameters>
export type SettingsResetInput = Static<typeof SettingsResetToolParameters>

/** 一次写入的结果：真正变化的 key 及其写入前的值，调用方据此提供撤销。 */
export interface SettingsChangeResult {
  readonly changed: ReadonlyArray<string>
  readonly previous: Readonly<Partial<ChartSettings>>
}

/** Agent 读取的设置快照：当前值与可写 schema，均为可序列化数据。 */
export interface SettingsSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly schema: ReadonlyArray<{
    readonly key: string
    readonly label: string
    readonly type: SettingItem['type']
    readonly group?: string
    readonly options?: ReadonlyArray<string>
    readonly min?: number
    readonly max?: number
  }>
}

/** SettingsCommands 只依赖 kernel 只读快照与唯一写入口。 */
export interface SettingsCommandsDependencies {
  readonly settings: ReadonlySignal<Readonly<ChartSettings>>
  /** 合并写入 kernel.settings（ChartController.updateSettingsFacade）。 */
  readonly apply: (patch: Partial<ChartSettings>) => void
}

/** 返回全部可写 key：DEFAULT_SETTINGS 与颜色配置。 */
export function listSettingKeys(): ReadonlyArray<string> {
  return [...SETTING_ITEM_BY_KEY.keys(), COLOR_PRESET_SETTINGS_KEY]
}

/**
 * 计算若干 key 的默认值。colorPresetSettings 的默认值为空对象（即使用主题预设原色）。
 *
 * @param keys - 设置 key；省略时返回全部 key 的默认值
 * @returns 默认值片段
 */
export function resolveSettingDefaults(keys?: ReadonlyArray<string>): Partial<ChartSettings> {
  const targets = keys ?? listSettingKeys()
  const defaults: Record<string, unknown> = {}
  for (const key of targets) {
    if (key === COLOR_PRESET_SETTINGS_KEY) {
      defaults[key] = {}
      continue
    }
    const item = SETTING_ITEM_BY_KEY.get(key)
    if (item) defaults[key] = resolveSettingDefault(item.default)
  }
  return defaults as Partial<ChartSettings>
}

/** 校验单个设置值；失败时返回给调用方（含 Agent）可直接修正的原因。 */
function validateSettingValue(key: string, value: unknown): string | null {
  if (key === COLOR_PRESET_SETTINGS_KEY) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? null
      : `${key} must be an object`
  }
  const item = SETTING_ITEM_BY_KEY.get(key)
  if (!item) return `unknown setting "${key}"; known keys: ${listSettingKeys().join(', ')}`
  if (item.type === 'boolean') {
    return typeof value === 'boolean' ? null : `${key} must be a boolean`
  }
  if (item.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${key} must be a number`
    if (item.min !== undefined && value < item.min) return `${key} must be >= ${item.min}`
    if (item.max !== undefined && value > item.max) return `${key} must be <= ${item.max}`
    return null
  }
  if (typeof value !== 'string') return `${key} must be a string`
  const options = item.options?.map((option) => option.value)
  if (options && !options.includes(value)) {
    return `${key} must be one of: ${options.join(', ')}`
  }
  return null
}

function sameSettingValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/**
 * 设置的唯一写原语。UI 控件、命令面板与 Agent 均调用这些方法，
 * 不再存在对话框草稿、工具栏副本或旁路持久化。
 */
export class SettingsCommands {
  constructor(private readonly dependencies: SettingsCommandsDependencies) {}

  /** 当前生效设置（kernel.settings 冻结快照）。 */
  get current(): Readonly<ChartSettings> {
    return this.dependencies.settings.peek()
  }

  /** 读取全部用户偏好及其可写 schema。 */
  @Tool({
    name: 'settings_get',
    label: 'Get chart settings',
    description:
      'Read the current chart preferences (theme, grid, axes, time zone, tooltip, renderer, cache limit, colors) and the schema of writable keys with their allowed values.',
    parameters: SettingsGetToolParameters,
    safety: 'read-only',
  })
  async getSettings(
    _input: Static<typeof SettingsGetToolParameters> = {},
  ): Promise<SettingsSnapshot> {
    const settings = this.current
    const values: Record<string, unknown> = {}
    for (const key of listSettingKeys()) values[key] = settings[key]
    return {
      values,
      schema: SETTING_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        type: item.type,
        ...(item.group ? { group: item.group } : {}),
        ...(item.options ? { options: item.options.map((option) => option.value) } : {}),
        ...(item.min !== undefined ? { min: item.min } : {}),
        ...(item.max !== undefined ? { max: item.max } : {}),
      })),
    }
  }

  /**
   * 写入一个或多个设置并立即生效；与设置对话框中的控件是同一入口。
   * 返回写入前的值，调用方可用它撤销。
   */
  @Tool({
    name: 'settings_update',
    label: 'Update chart settings',
    description:
      'Apply one or more chart preferences immediately, e.g. {"values":{"theme":"light","showGridLines":false}}. Call settings_get first for allowed keys and values. The same action backs the settings dialog, so the user sees the change at once.',
    parameters: SettingsUpdateToolParameters,
    safety: 'destructive',
    executionMode: 'sequential',
  })
  async updateSettings(input: SettingsUpdateInput): Promise<SettingsChangeResult> {
    return this.applyValues(input.values)
  }

  /** 将指定设置（默认全部）恢复为默认值，返回恢复前的值以便撤销。 */
  @Tool({
    name: 'settings_reset',
    label: 'Reset chart settings',
    description:
      'Restore chart preferences to their defaults. Pass "keys" to reset only those settings; omit it to reset everything. Returns the previous values.',
    parameters: SettingsResetToolParameters,
    safety: 'destructive',
    executionMode: 'sequential',
  })
  async resetSettings(input: SettingsResetInput = {}): Promise<SettingsChangeResult> {
    return this.resetValues(input.keys)
  }

  /** 同步恢复默认（UI 使用，便于立即提供 Undo）；与 settings_reset 工具共用实现。 */
  resetValues(keys?: ReadonlyArray<string>): SettingsChangeResult {
    const unknown = (keys ?? []).filter((key) => !listSettingKeys().includes(key))
    if (unknown.length > 0) {
      throw new ToolInputValidationError(
        `The settings are invalid: unknown setting(s) ${unknown.join(', ')}`,
      )
    }
    return this.applyValues(resolveSettingDefaults(keys ?? listSettingKeys()))
  }

  /** 同步写入（UI 控件使用，避免一次微任务延迟）；校验规则与工具入口一致。 */
  applyValues(values: Readonly<Record<string, unknown>>): SettingsChangeResult {
    const errors: string[] = []
    for (const [key, value] of Object.entries(values)) {
      const error = validateSettingValue(key, value)
      if (error) errors.push(error)
    }
    if (errors.length > 0) {
      throw new ToolInputValidationError(`The settings are invalid: ${errors.join('; ')}`)
    }
    const current = this.current
    const changed: string[] = []
    const previous: Record<string, unknown> = {}
    const patch: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(values)) {
      if (sameSettingValue(current[key], value)) continue
      changed.push(key)
      // 未设置的 key 以默认值作为“写入前的值”，保证撤销输入总能通过校验。
      previous[key] = current[key] ?? resolveSettingDefaults([key])[key]
      patch[key] = value
    }
    if (changed.length > 0) this.dependencies.apply(patch as Partial<ChartSettings>)
    return { changed, previous: previous as Partial<ChartSettings> }
  }
}

/** 创建绑定到某个图表实例的设置命令。 */
export function createSettingsCommands(
  dependencies: SettingsCommandsDependencies,
): SettingsCommands {
  return new SettingsCommands(dependencies)
}
