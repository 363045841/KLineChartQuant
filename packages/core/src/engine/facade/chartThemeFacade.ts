/**
 * ChartThemeFacade —— 图表主题偏好与生效主题信号。
 */
import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import type { ChartStateKernel } from '../state/chartStateKernel'

/** Theme Facade 所需依赖。 */
export interface ChartThemeFacadeDependencies {
  kernel: ChartStateKernel
  scheduleDraw: () => void
}

/** 提供主题领域的公开操作。 */
export class ChartThemeFacade {
  constructor(private readonly deps: ChartThemeFacadeDependencies) {}

  /** 返回由用户偏好与系统主题派生的有效主题。 */
  get effective(): ReadonlySignal<'light' | 'dark'> {
    return this.deps.kernel.effectiveTheme$
  }

  /** 设置用户主题偏好并请求重绘。 */
  set(theme: 'light' | 'dark'): void {
    this.deps.kernel.settings.actions.patch({ theme })
    this.deps.scheduleDraw()
  }

  /** 注入系统主题；仅自动主题偏好需要重绘。 */
  setSystem(theme: 'light' | 'dark'): void {
    this.deps.kernel.systemTheme.actions.setSystemTheme(theme)
    if (this.deps.kernel.settings.readonly.settings.peek().theme === 'auto') {
      this.deps.scheduleDraw()
    }
  }
}
