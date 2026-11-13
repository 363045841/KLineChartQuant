/**
 * 系统渲染对象状态：图表自带对象（K 线等）的显隐与层带内顺序。
 *
 * 用户对象各自持有顺序（指标 ordinal、绘图 zIndex）；系统对象没有领域文档，
 * 因此统一放在这里，并随布局文档一起存档。
 */

import { createSubState } from '../../foundation/reactivity/signal.js'

/** 系统对象状态快照；对象身份由渲染层注册表定义。 */
export interface SystemObjectSnapshot {
  /** 被隐藏的对象身份。 */
  readonly hidden: ReadonlyArray<string>
  /** 对象身份到层带内 z 的覆盖；缺省使用渲染层默认值。 */
  readonly z: Readonly<Record<string, number>>
  /** 对象身份到 paneId 的覆盖；缺省使用注册表里的初始 Pane。 */
  readonly paneId: Readonly<Record<string, string>>
}

const EMPTY: SystemObjectSnapshot = Object.freeze({
  hidden: Object.freeze([]),
  z: Object.freeze({}),
  paneId: Object.freeze({}),
})

/** 冻结外部输入，隔离调用方对数组/对象的后续修改。 */
function snapshot(input?: Partial<SystemObjectSnapshot>): SystemObjectSnapshot {
  return Object.freeze({
    hidden: Object.freeze([...(input?.hidden ?? [])]),
    z: Object.freeze({ ...(input?.z ?? {}) }),
    paneId: Object.freeze({ ...(input?.paneId ?? {}) }),
  })
}

/** 创建系统对象状态；写入保持不可变快照。 */
export function createSystemObjectState() {
  const { signals, readonly } = createSubState({
    state: EMPTY as SystemObjectSnapshot,
  })

  const write = (next: SystemObjectSnapshot): void => {
    const current = signals.state.peek()
    if (
      next.hidden.length === current.hidden.length &&
      next.hidden.every((id, index) => id === current.hidden[index]) &&
      Object.keys(next.z).length === Object.keys(current.z).length &&
      Object.entries(next.z).every(([id, value]) => current.z[id] === value) &&
      Object.keys(next.paneId).length === Object.keys(current.paneId).length &&
      Object.entries(next.paneId).every(([id, value]) => current.paneId[id] === value)
    ) {
      return
    }
    signals.state.set(next)
  }

  return {
    readonly,
    actions: {
      /** 设置单个系统对象的显隐；隐藏集合保持唯一且有序。 */
      setHidden(objectId: string, hidden: boolean): boolean {
        const current = signals.state.peek()
        const exists = current.hidden.includes(objectId)
        if (exists === hidden) return false
        write(
          snapshot({
            hidden: hidden
              ? [...current.hidden, objectId]
              : current.hidden.filter((id) => id !== objectId),
            z: current.z,
            paneId: current.paneId,
          }),
        )
        return true
      },
      /** 设置单个系统对象的 z；非有限数拒绝写入。 */
      setZ(objectId: string, z: number): boolean {
        if (!Number.isFinite(z)) return false
        const current = signals.state.peek()
        if (current.z[objectId] === z) return false
        write(
          snapshot({
            hidden: current.hidden,
            z: { ...current.z, [objectId]: z },
            paneId: current.paneId,
          }),
        )
        return true
      },
      /** 设置单个系统对象所属 Pane；空值拒绝写入。 */
      setPane(objectId: string, paneId: string): boolean {
        if (paneId.length === 0) return false
        const current = signals.state.peek()
        if (current.paneId[objectId] === paneId) return false
        write(
          snapshot({
            hidden: current.hidden,
            z: current.z,
            paneId: { ...current.paneId, [objectId]: paneId },
          }),
        )
        return true
      },
      /** 从布局文档恢复；省略时回到默认状态。 */
      restore(input?: Partial<SystemObjectSnapshot>): void {
        signals.state.set(snapshot(input))
      },
    },
    dispose(): void {
      signals.state.set(EMPTY)
    },
  }
}

export type SystemObjectStateModule = ReturnType<typeof createSystemObjectState>
