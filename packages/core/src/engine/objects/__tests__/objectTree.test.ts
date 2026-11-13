import { describe, expect, it } from 'vitest'
import { createSignal } from '../../../foundation/reactivity/signal.js'
import type { PaneSpec } from '../../pane/types.js'
import type { Layer, RenderObjectDescriptor } from '../../../rendering/scene/types.js'
import { createObjectTree } from '../impl/createObjectTree.js'

/** 构造一个只带对象身份的最小图层；绘制行为与对象树无关。 */
function objectLayer(
  id: string,
  paneId: string,
  role: Layer['role'],
  z: number,
  object: RenderObjectDescriptor,
  visible = true,
): Layer {
  return {
    id,
    pane: paneId,
    role,
    z,
    visible,
    object,
    kind: 'draw-list',
    paint: () => {},
    dispose: () => {},
  }
}

/** 装饰层：没有对象身份，对象树必须忽略。 */
function chromeLayer(id: string, paneId: string, role: Layer['role'], z: number): Layer {
  return { id, pane: paneId, role, z, visible: true, kind: 'draw-list', paint: () => {}, dispose: () => {} }
}

/** 被测对象树使用的命令桩；断言只关心是否原样取回。 */
function commands(name: string) {
  return {
    setVisible: () => true,
    setLocked: () => true,
    move: () => true,
    remove: () => {
      lastRemoved = name
      return true
    },
  }
}

let lastRemoved: string | null = null

const PANES: ReadonlyArray<PaneSpec> = [
  { id: 'main', ratio: 1, role: 'price' },
  { id: 'rsi', ratio: 1, role: 'indicator' },
  { id: 'empty', ratio: 1, role: 'indicator' },
]

function createFixture() {
  lastRemoved = null
  const candleObject: RenderObjectDescriptor = {
    kind: 'system',
    label: 'K线',
    capabilities: {
      removable: false,
      hideable: true,
      orderable: true,
      movable: false,
      lockable: false,
    },
    commands: commands('candle'),
  }
  const maObject: RenderObjectDescriptor = {
    kind: 'indicator',
    label: 'MA(20)',
    capabilities: {
      removable: true,
      hideable: true,
      orderable: true,
      movable: true,
      lockable: true,
    },
    commands: commands('ma'),
  }
  const rsiObject: RenderObjectDescriptor = {
    ...maObject,
    label: 'RSI(14)',
    commands: commands('rsi'),
  }
  const layers = createSignal<ReadonlyArray<Layer>>([
    objectLayer('candle', 'main', 'primary', 50, candleObject),
    objectLayer('ma', 'main', 'indicator', 30, maObject),
    objectLayer('rsi', 'rsi', 'indicator', 30, rsiObject),
    // 装饰层没有对象身份，不进对象树。
    chromeLayer('grid', 'main', 'background', 10),
  ])
  const paneSpecs = createSignal<ReadonlyArray<PaneSpec>>(PANES)
  return {
    layers,
    paneSpecs,
    tree: createObjectTree({ layers, paneSpecs }),
  }
}

describe('createObjectTree', () => {
  it('按 pane 分组并从上层到下层排列，跳过装饰层', () => {
    const { tree } = createFixture()
    const groups = tree.groups.peek()

    expect(groups.map((group) => group.paneId)).toEqual(['main', 'rsi', 'empty'])
    expect(groups[0]?.title).toBe('K线')
    expect(groups[0]?.rows.map((row) => row.objectId)).toEqual(['candle', 'ma'])
    expect(groups[1]?.title).toBe('RSI(14)')
    expect(groups[1]?.rows.map((row) => row.objectId)).toEqual(['rsi'])
    expect(groups[2]?.title).toBeNull()
    expect(groups[2]?.rows).toEqual([])
  })

  it('行字段读自渲染对象，不复制命令', () => {
    const { tree } = createFixture()
    const candle = tree.groups.peek()[0]?.rows[0]

    expect(candle).toMatchObject({
      objectId: 'candle',
      kind: 'system',
      label: 'K线',
      band: 'main',
      z: 50,
      visible: true,
      locked: false,
      capabilities: { removable: false, movable: false, lockable: false },
    })
  })

  it('按身份取回对象自身的命令；未知身份返回 null', () => {
    const { tree } = createFixture()

    expect(tree.commandsFor('ma')?.remove()).toBe(true)
    expect(lastRemoved).toBe('ma')
    expect(tree.commandsFor('missing')).toBeNull()
  })

  it('渲染对象变化后重新发布分组', () => {
    const { tree, layers } = createFixture()
    const next = layers
      .peek()
      .map((layer) => (layer.id === 'ma' ? { ...layer, visible: false } : layer))
    layers.set(next)

    const ma = tree.groups.peek()[0]?.rows.find((row) => row.objectId === 'ma')
    expect(ma?.visible).toBe(false)
  })
})
