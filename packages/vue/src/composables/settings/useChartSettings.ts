/**
 * 图表设置的 Vue 入口（ADR 0006）：读取只订阅 controller.settings 信号，写入只调用
 * controller.settingsCommands —— 与 Agent 的 settings_update / settings_reset 工具是同一组方法。
 * Vue 侧不持有任何设置副本或草稿。
 */
import type { SettingsChangeResult } from '@363045841yyt/klinechart-core'
import {
  type ChartSettings,
  chartSettingsPersistence,
  resolveSettings,
} from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { type ComputedRef, type InjectionKey, inject, provide, type Ref, watch } from 'vue'

import { useControllerSignal } from '../chart/useControllerSignal.js'

/** 当前图表 controller 的注入键；KLineChart 提供，设置对话框、命令面板等子组件注入。 */
export const KLC_CHART_CONTROLLER_KEY: InjectionKey<Ref<ChartController | null>> =
  Symbol('klc-chart-controller')

/** 由 KLineChart 调用：向子树提供当前 controller。 */
export function provideChartController(controller: Ref<ChartController | null>): void {
  provide(KLC_CHART_CONTROLLER_KEY, controller)
}

/** 注入当前 controller；不在图表子树中时返回 null。 */
export function injectChartController(): Ref<ChartController | null> | null {
  return inject(KLC_CHART_CONTROLLER_KEY, null)
}

const NO_CHANGE: SettingsChangeResult = Object.freeze({ changed: [], previous: {} })

export interface ChartSettingsHandle {
  /** kernel.settings 的只读投影。 */
  readonly settings: ComputedRef<Readonly<ChartSettings>>
  /** 立即写入（同 settings_update）；返回写入前的值。 */
  update(values: Readonly<Record<string, unknown>>): SettingsChangeResult
  /** 恢复默认（同 settings_reset）；返回恢复前的值，供 Undo 使用。 */
  reset(keys: ReadonlyArray<string>): SettingsChangeResult
}

/**
 * 绑定某个 controller 的设置读写。controller 未就绪时读取分层解析结果、写入为空操作。
 *
 * @param controller - 图表 controller 引用
 * @param fallback - controller 未就绪时的只读快照
 */
export function useChartSettings(
  controller: Ref<ChartController | null>,
  fallback: () => ChartSettings = () => resolveSettings(),
): ChartSettingsHandle {
  const settings = useControllerSignal(controller, (ctrl) => ctrl.settings, fallback)

  function update(values: Readonly<Record<string, unknown>>): SettingsChangeResult {
    const commands = controller.value?.settingsCommands
    return commands ? commands.applyValues(values) : NO_CHANGE
  }

  function reset(keys: ReadonlyArray<string>): SettingsChangeResult {
    const commands = controller.value?.settingsCommands
    return commands ? commands.resetValues(keys) : NO_CHANGE
  }

  return { settings, update, reset }
}

/**
 * 设置持久化：订阅 kernel.settings，任何来源（UI、命令面板、Agent）的写入都落盘。
 * 返回 `suspend(fn)`：在其中执行的写入（如受控 settings prop 的同步）不落盘。
 *
 * @param controller - 图表 controller 引用
 */
export function persistChartSettings(controller: Ref<ChartController | null>): {
  suspend<T>(fn: () => T): T
} {
  let suspended = 0
  let lastSaved: string | null = null

  watch(
    controller,
    (ctrl, _previous, onCleanup) => {
      if (!ctrl) return
      // 以挂载时的快照为基线，只持久化之后的变更。
      lastSaved = JSON.stringify(ctrl.settings.peek())
      const unsubscribe = ctrl.settings.subscribe(() => {
        const next = ctrl.settings.peek()
        const serialized = JSON.stringify(next)
        if (serialized === lastSaved) return
        lastSaved = serialized
        if (suspended > 0) return
        chartSettingsPersistence.save(next)
      })
      onCleanup(unsubscribe)
    },
    { immediate: true },
  )

  return {
    suspend<T>(fn: () => T): T {
      suspended += 1
      try {
        return fn()
      } finally {
        suspended -= 1
      }
    },
  }
}
