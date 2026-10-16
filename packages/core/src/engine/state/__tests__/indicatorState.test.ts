/** 验证指标状态写入，使用正式装配的计算参数契约。 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  registerIndicatorDefinition,
  registerIndicatorDescriptor,
} from '../../indicators/indicatorDefinitionRegistry'
import { CCIIndicatorDefinition } from '../../renderers/Indicator/cci'
import { VolumeIndicatorDefinition } from '../../renderers/subVolume'
import { createIndicatorState, type IndicatorInstanceSpec } from '../indicatorState'
import { createPaneState } from '../paneState'

beforeAll(() => {
  registerIndicatorDefinition(CCIIndicatorDefinition)
  registerIndicatorDefinition(VolumeIndicatorDefinition)
})

describe('indicatorState', () => {
  it.each([
    { source: 'native' as const, category: 'main' as const },
    { source: 'native' as const, category: 'sub' as const },
    { source: 'script' as const, category: 'main' as const },
    { source: 'script' as const, category: 'sub' as const },
  ])(
    '目录发布后按 $source 定义的 $category 位置派生，不使用写入入口的位置',
    ({ source, category }) => {
      const indicatorId = `placement-${source}-${category}`
      const state = createIndicatorState()
      const pane = createPaneState(state.readonly.workspaces)
      state.actions.upsertMain(indicatorId, { n: 2 })
      expect(state.readonly.instances.peek()).toEqual([])
      registerIndicatorDescriptor({
        name: indicatorId,
        displayName: indicatorId,
        source,
        kind: 'indicator',
        category,
        indicatorType: 'other',
        defaultPaneId: category === 'main' ? 'main' : `sub_${indicatorId}`,
      })
      const instance = state.readonly.instances.peek()[0]!
      expect(instance.role).toBe(category)
      expect(instance.paneId).toBe(category === 'main' ? 'main' : `pane:main:${indicatorId}`)
      expect(pane.readonly.paneSpecs.peek().map((spec) => spec.id)).toEqual(
        category === 'main' ? ['main'] : ['main', instance.paneId],
      )
      expect(state.readonly.configurations.peek().kline[0]).not.toHaveProperty('role')
      expect(state.readonly.configurations.peek().kline[0]).not.toHaveProperty('paneId')
    },
  )
  it('restores independent user indicators for kline and timeshare workspaces', () => {
    const m = createIndicatorState()
    m.actions.restoreWorkspaces({
      kline: {
        instances: [
          {
            instanceId: 'main:ENE',
            indicatorId: 'ENE',
            layoutId: 'pane:main:ENE',
            ordinal: 0,
            params: { period: 20 },
          },
        ],
        paneRatios: { main: 1 },
        paneSpecs: [{ id: 'main', ratio: 1 }],
        paneScaleTypes: {},
      },
      timeshare: {
        instances: [
          {
            instanceId: 'main:MA',
            indicatorId: 'MA',
            layoutId: 'pane:main:MA',
            ordinal: 0,
            params: { period: 5 },
          },
        ],
        paneRatios: { main: 1 },
        paneSpecs: [{ id: 'main', ratio: 1 }],
        paneScaleTypes: {},
      },
    })

    expect(m.readonly.instances.peek().map((instance) => instance.indicatorId)).toEqual(['ENE'])
    m.actions.setActiveWorkspace('timeshare')
    expect(m.readonly.instances.peek().map((instance) => instance.indicatorId)).toEqual(['MA'])
  })

  it('upsert adds and merges params immutably', () => {
    const m = createIndicatorState()
    m.actions.upsertMain('MA', { period1: 5 })
    expect(m.readonly.instances()).toEqual([
      {
        instanceId: 'main:MA',
        indicatorId: 'MA',
        paneId: 'main',
        role: 'main',
        ordinal: 0,
        params: { period1: 5 },
      },
    ])
    const first = m.readonly.instances()
    m.actions.upsertMain('MA', { period1: 10, color: 'red' })
    const second = m.readonly.instances()
    expect(second).not.toBe(first)
    expect(second[0]?.params).toEqual({ period1: 10, color: 'red' })
    expect(first[0]?.params).toEqual({ period1: 5 })
    expect(m.readonly.configRevision()).toBe(2)
  })

  it('advances configRevision for calculation params but not presentation options', () => {
    const state = createIndicatorState()
    state.actions.upsertSub({
      indicatorId: 'CCI',
      paneId: 'CCI_0',
      params: { period: 14, showCCI: true },
    })
    const initialRevision = state.readonly.configRevision()

    state.actions.setSubParams('CCI_0', { showCCI: false })
    expect(state.readonly.configRevision()).toBe(initialRevision)

    state.actions.setSubParams('CCI_0', { period: 20 })
    expect(state.readonly.configRevision()).toBe(initialRevision + 1)
  })

  it('toggles hidden without touching calculation config or params', () => {
    const state = createIndicatorState()
    state.actions.upsertMain('MA', { period: 5 })
    state.actions.upsertSub({ paneId: 'RSI_0', indicatorId: 'CCI', params: { period1: 6 } })
    const subInstanceId = state.readonly.subPanes()[0]!.instanceId
    const revision = state.readonly.configRevision()

    state.actions.setIndicatorHidden('main:MA', true)
    state.actions.setIndicatorHidden(subInstanceId, true)

    expect(state.readonly.instances()).toEqual([
      expect.objectContaining({ instanceId: 'main:MA', hidden: true, params: { period: 5 } }),
      expect.objectContaining({ instanceId: subInstanceId, hidden: true }),
    ])
    expect(state.readonly.subPanes()).toEqual([
      expect.objectContaining({ paneId: 'RSI_0', hidden: true }),
    ])
    // 隐藏属于展示配置，不参与计算身份，不触发重新计算。
    expect(state.readonly.configRevision()).toBe(revision)

    state.actions.setIndicatorHidden('main:MA', false)
    expect(state.readonly.instances()[0]).not.toHaveProperty('hidden')
    expect(state.readonly.configRevision()).toBe(revision)
  })

  it('remove and clear', () => {
    const m = createIndicatorState()
    m.actions.upsertMain('MA', {})
    m.actions.upsertMain('ENE', {})
    m.actions.removeMain('MA')
    expect(m.readonly.instances().some((instance) => instance.indicatorId === 'MA')).toBe(false)
    expect(m.readonly.instances().some((instance) => instance.indicatorId === 'ENE')).toBe(true)
    m.actions.clearMain()
    expect(m.readonly.instances()).toEqual([])
  })

  it('readonly has no set at runtime', () => {
    const m = createIndicatorState()
    expect(Reflect.get(m.readonly.instances, 'set')).toBeUndefined()
  })

  it('setParams only works when entry exists', () => {
    const m = createIndicatorState()
    m.actions.setMainParams('MA', { period: 10 })
    expect(m.readonly.instances()).toEqual([])
    m.actions.upsertMain('MA', { period: 5 })
    m.actions.setMainParams('MA', { period: 10 })
    expect(m.readonly.instances()[0]?.params).toEqual({ period: 10 })
  })

  it('external mutation of returned instances or params does not alter store', () => {
    const m = createIndicatorState()
    m.actions.upsertMain('MA', { period: 5 })
    const instances = m.readonly.instances() as IndicatorInstanceSpec[]
    const entry = instances[0]!
    expect(() =>
      instances.push({
        instanceId: 'hack:main',
        indicatorId: 'HACK',
        paneId: 'main',
        role: 'main',
        ordinal: 0,
        params: {},
      }),
    ).toThrow()
    expect(() => {
      ;(entry.params as Record<string, number>).period = 99
    }).toThrow()
    expect(m.readonly.instances()[0]?.params).toEqual({ period: 5 })
    expect(m.readonly.instances().some((instance) => instance.indicatorId === 'HACK')).toBe(false)
  })

  it('replaceAllMain deep-copies instances so caller mutation is ignored', () => {
    const m = createIndicatorState()
    const params = { period: 5 }
    const input = [
      {
        instanceId: 'legacy:main',
        indicatorId: 'MA',
        paneId: 'main',
        role: 'main' as const,
        ordinal: 0,
        params: params as Record<string, number>,
      },
    ]
    m.actions.replaceAllMain(input)
    input.push({
      instanceId: 'legacy:main:boll',
      indicatorId: 'ENE',
      paneId: 'main',
      role: 'main',
      ordinal: 0,
      params: { period: 20 },
    })
    params.period = 99
    expect(m.readonly.instances()).toEqual([
      expect.objectContaining({ instanceId: 'legacy:main', ordinal: 0, indicatorId: 'MA' }),
    ])
  })

  it('stores main and sub indicators in one ordered instance collection', () => {
    const m = createIndicatorState()
    m.actions.upsertSub({ paneId: 'RSI_0', indicatorId: 'CCI', params: { period1: 6 } })
    const subInstanceId = m.readonly.subPanes()[0]!.instanceId
    m.actions.upsertMain('MA', { period: 5 })

    expect(m.readonly.instances()).toEqual([
      expect.objectContaining({ instanceId: 'main:MA', ordinal: 0, indicatorId: 'MA' }),
      expect.objectContaining({ instanceId: subInstanceId, ordinal: 0, indicatorId: 'CCI' }),
    ])
    expect(m.readonly.subPanes()).toEqual([
      expect.objectContaining({ instanceId: subInstanceId, ordinal: 0, indicatorId: 'CCI' }),
    ])
  })

  it('keeps one main instance per indicator and one sub instance per pane', () => {
    const m = createIndicatorState()
    m.actions.upsertMain('MA', { period: 5 })
    m.actions.upsertMain('MA', { color: 'red' })
    m.actions.upsertSub({ paneId: 'RSI_0', indicatorId: 'CCI', params: { period1: 6 } })
    const firstSubId = m.readonly.subPanes()[0]!.instanceId
    m.actions.upsertSub({ paneId: 'RSI_0', indicatorId: 'MACD', params: { fast: 12 } })
    m.actions.upsertSub({ paneId: 'RSI_1', indicatorId: 'CCI', params: { period1: 14 } })
    const secondSubId = m.readonly.subPanes()[1]!.instanceId
    expect(firstSubId).not.toBe(secondSubId)

    expect(m.readonly.instances()).toEqual([
      {
        instanceId: 'main:MA',
        indicatorId: 'MA',
        paneId: 'main',
        role: 'main',
        ordinal: 0,
        params: { period: 5, color: 'red' },
      },
      {
        instanceId: firstSubId,
        indicatorId: 'MACD',
        paneId: 'RSI_0',
        role: 'sub',
        ordinal: 0,
        params: { fast: 12 },
      },
      {
        instanceId: secondSubId,
        indicatorId: 'CCI',
        paneId: 'RSI_1',
        role: 'sub',
        ordinal: 0,
        params: { period1: 14 },
      },
    ])
  })
})
