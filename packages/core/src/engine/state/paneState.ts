/** Pane 配置独立于指标执行环境；尺寸比例只存于 paneSpecs，像素布局不写回配置。 */
import { batch, computed, createSubState } from '../../foundation/reactivity/signal.js'
import { ChartWorkspaceId } from '../../foundation/types/chartView.js'
import type { ScaleType } from '../../foundation/types/scaleType.js'
import type { LayoutWorkspaces } from '../layout/index.js'
import type { PaneSpec } from '../pane/types.js'
import { MAIN_PANE_ID } from '../pane/types.js'
import { immutableMap } from './immutable.js'

type PaneWorkspace = Readonly<{
  paneSpecs: ReadonlyArray<PaneSpec>
  paneScaleTypes: ReadonlyMap<string, ScaleType>
}>

/** 创建不可变配置；调用方的数组、规格和坐标轴映射不能穿透状态边界。 */
function snapshotWorkspace(
  specs: ReadonlyArray<PaneSpec>,
  scaleTypes: ReadonlyMap<string, ScaleType>,
): PaneWorkspace {
  return Object.freeze({
    paneSpecs: Object.freeze(specs.map((spec) => Object.freeze({
      ...spec,
      ...(spec.capabilities ? { capabilities: Object.freeze({ ...spec.capabilities }) } : {}),
    }))),
    paneScaleTypes: immutableMap(new Map(scaleTypes)),
  })
}

/** 没有用户布局的工作区从单主图开始，不依赖指标目录补齐窗格。 */
function initialWorkspace(): PaneWorkspace {
  return snapshotWorkspace(
    [{ id: MAIN_PANE_ID, ratio: 1, visible: true, role: 'price' }],
    new Map(),
  )
}

/** 比较轴偏好，避免重复写入引发整张图的重投影。 */
function scaleMapsEqual(left: ReadonlyMap<string, ScaleType>, right: ReadonlyMap<string, ScaleType>): boolean {
  return left.size === right.size && [...right].every(([id, type]) => left.get(id) === type)
}

/** 配置由恢复和用户命令写入；指标是否加载不参与 pane 的存在性、顺序或高度。 */
export function createPaneState() {
  const { signals, readonly: stored } = createSubState({
    activeWorkspace: ChartWorkspaceId.KLine as ChartWorkspaceId,
    workspaces: Object.freeze({
      kline: initialWorkspace(),
      timeshare: initialWorkspace(),
    }) as Readonly<Record<ChartWorkspaceId, PaneWorkspace>>,
  })
  const current = computed(() => stored.workspaces()[stored.activeWorkspace()])
  const readonly = {
    ...stored,
    paneSpecs: computed(() => current().paneSpecs),
    paneRatios: computed(() => Object.freeze(Object.fromEntries(
      current().paneSpecs.map((spec) => [spec.id, spec.ratio]),
    ))),
    paneScaleTypes: computed(() => current().paneScaleTypes),
  }

  /** Action 直接读取原始配置，支持同一 batch 内连续提交。 */
  function currentWorkspace(): PaneWorkspace {
    return stored.workspaces.peek()[stored.activeWorkspace.peek()]
  }

  /** 用一次不可变快照提交当前工作区。 */
  function writeActive(next: PaneWorkspace): void {
    signals.workspaces.set(Object.freeze({
      ...stored.workspaces.peek(),
      [stored.activeWorkspace.peek()]: next,
    }))
  }

  /** 仅在轴偏好变化时写入，保留完整 pane 配置。 */
  function writeScaleTypes(next: ReadonlyMap<string, ScaleType>): void {
    const previous = currentWorkspace()
    if (!scaleMapsEqual(previous.paneScaleTypes, next)) {
      writeActive(snapshotWorkspace(previous.paneSpecs, next))
    }
  }

  return {
    readonly,
    getScalePreferences: (): ReadonlyMap<string, ScaleType> => currentWorkspace().paneScaleTypes,
    actions: {
      setActiveWorkspace(workspaceId: ChartWorkspaceId): void {
        if (stored.activeWorkspace.peek() !== workspaceId) signals.activeWorkspace.set(workspaceId)
      },
      /** 原样恢复完整布局，包含尚未加载指标的窗格。 */
      restoreWorkspaces(workspaces: LayoutWorkspaces): void {
        const restore = (workspaceId: ChartWorkspaceId): PaneWorkspace => snapshotWorkspace(
          workspaces[workspaceId].paneSpecs.map((spec) => ({
            ...spec,
            role: spec.id === MAIN_PANE_ID ? 'price' : 'indicator',
          })),
          new Map(Object.entries(workspaces[workspaceId].paneScaleTypes)),
        )
        signals.workspaces.set(Object.freeze({
          kline: restore(ChartWorkspaceId.KLine),
          timeshare: restore(ChartWorkspaceId.TimeShare),
        }))
      },
      /** 更新现有窗格的权重，不维护第二份比例状态。 */
      setPaneRatios(ratios: Readonly<Record<string, number>>): void {
        const previous = currentWorkspace()
        writeActive(snapshotWorkspace(previous.paneSpecs.map((spec) => ({
          ...spec, ratio: ratios[spec.id] ?? spec.ratio,
        })), previous.paneScaleTypes))
      },
      setPaneSpecs(specs: ReadonlyArray<PaneSpec>): void {
        writeActive(snapshotWorkspace(specs, currentWorkspace().paneScaleTypes))
      },
      /** 用户布局命令一次提交规格和权重；只保留仍存在的窗格轴偏好。 */
      commitLayout(ratios: Readonly<Record<string, number>>, specs: ReadonlyArray<PaneSpec>): void {
        const previous = currentWorkspace()
        const ids = new Set(specs.map((spec) => spec.id))
        writeActive(snapshotWorkspace(
          specs.map((spec) => ({ ...spec, ratio: ratios[spec.id] ?? spec.ratio })),
          new Map([...previous.paneScaleTypes].filter(([id]) => ids.has(id))),
        ))
      },
      setPaneScaleType(paneId: string, scaleType: ScaleType): void {
        const next = new Map(currentWorkspace().paneScaleTypes)
        next.set(paneId, scaleType)
        writeScaleTypes(next)
      },
      replacePaneScaleTypes: writeScaleTypes,
      removePaneScaleType(paneId: string): void {
        const next = new Map(currentWorkspace().paneScaleTypes)
        next.delete(paneId)
        writeScaleTypes(next)
      },
    },
    dispose(): void {
      batch(() => {
        signals.activeWorkspace.set(ChartWorkspaceId.KLine)
        signals.workspaces.set(Object.freeze({ kline: initialWorkspace(), timeshare: initialWorkspace() }))
      })
    },
  }
}

export type PaneStateModule = ReturnType<typeof createPaneState>
