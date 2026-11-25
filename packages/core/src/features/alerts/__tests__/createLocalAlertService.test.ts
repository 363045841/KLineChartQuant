/**
 * 本地警报服务：条件来自脚本事件，服务只负责频率、冷却、过期、日志与恢复。
 */
import { describe, expect, it, vi } from 'vitest'

import type { SymbolSpec } from '@/controllers/types.js'
import {
  type CalculationDefinition,
  createCalculationHub,
  createDataIdentity,
  createFeedKey,
  createLocalCalculationKey,
  type FeedSnapshot,
  type ScriptAlertEvent,
} from '@/engine/calculation/index.js'
import { makeSymbolSpec } from '@/engine/data/__tests__/helpers/symbolSpecFixture.js'
import { createMemoryDocumentStore } from '@/foundation/persistence/index.js'
import {
  type Alert,
  type AlertDraft,
  type AlertFiresDocument,
  type AlertRulesDocument,
  alertStatus,
  createLocalAlertService,
} from '../index.js'

const SCRIPT = 'alert-script'
const SYMBOL: SymbolSpec = makeSymbolSpec({
  id: 'BTC',
  symbol: 'BTCUSDT',
  source: 'test',
  period: '1',
  adjust: 'none',
})
const IDENTITY = createDataIdentity({
  source: 'test',
  instrument: 'BTC',
  period: '1',
  adjustment: 'none',
  defaultPeriod: '1d',
  defaultAdjustment: 'none',
})
const FEED = createFeedKey(IDENTITY)
/** 与服务内部一致的计算键；用于观察结果是否已提交。 */
const REQUEST_KEY = createLocalCalculationKey({
  definitionId: SCRIPT,
  inputs: {},
  context: {},
})

/** 一份行情快照；时间轴决定 bar 收盘结算点。 */
function feed(dataRevision: number, timestamps: readonly number[]): FeedSnapshot {
  return {
    identity: IDENTITY,
    dataRevision,
    marketRevision: 0,
    timestamps,
    data: timestamps.map((timestamp) => ({
      timestamp,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    })),
    change: { start: 0, end: timestamps.length },
  }
}

/** 事件工厂；默认是实时事件，历史事件显式传 false。 */
function alertEvent(time: number, price = 10, live = true): ScriptAlertEvent {
  return { kind: 'alert', message: 'cross', time, barIndex: 0, price, live }
}

/** 搭建真实 Hub + 内存存储 + 本地服务。 */
async function harness(options?: {
  maxFires?: number
  maxFiresPerAlert?: number
  maxAlerts?: number
}) {
  let clock = 1_000
  let events: ScriptAlertEvent[] = []
  let failing = false
  const definition: CalculationDefinition = {
    definitionId: SCRIPT,
    dependency: { kind: 'stateful' },
    compute: async () => {
      if (failing) throw new Error('script failed')
      return { series: 0, events }
    },
  }
  const hub = createCalculationHub({
    resolveDefinition: (id) => (id === SCRIPT ? definition : undefined),
  })
  const rules = createMemoryDocumentStore<AlertRulesDocument>(null)
  const fires = createMemoryDocumentStore<AlertFiresDocument>(null)
  const notifier = { notify: vi.fn() }
  const playSound = vi.fn()
  const service = await createLocalAlertService({
    hub,
    rules,
    fires,
    notifier,
    playSound,
    now: () => clock,
    limits: options,
  })

  return {
    hub,
    rules,
    fires,
    service,
    notifier,
    playSound,
    setEvents(next: ScriptAlertEvent[]) {
      events = next
    },
    setFailing(value: boolean) {
      failing = value
    },
    setClock(value: number) {
      clock = value
    },
  }
}

/** 创建一条默认警报；测试只覆盖差异。 */
function draft(overrides: Partial<AlertDraft> = {}): AlertDraft {
  return {
    name: 'BTC breakout',
    condition: { definitionId: SCRIPT, inputs: {} },
    symbol: SYMBOL,
    frequency: 'per-bar',
    message: '{{ticker}} {{interval}} {{close}}',
    channels: ['in-app'],
    ...overrides,
  }
}

describe('alertStatus', () => {
  const base: Alert = {
    id: 'a',
    name: 'a',
    condition: { definitionId: SCRIPT, inputs: {} },
    symbol: SYMBOL,
    frequency: 'all',
    message: 'm',
    channels: ['in-app'],
    enabled: true,
    createdAt: 0,
  }

  it.each([
    [{}, 'active'],
    [{ enabled: false }, 'paused'],
    [{ expiresAt: 10 }, 'expired'],
    [{ lastError: 'boom' }, 'error'],
    [{ frequency: 'once' as const, lastFiredAt: 1 }, 'triggered'],
  ] as const)('%o → %s', (patch, expected) => {
    expect(alertStatus({ ...base, ...patch }, 100)).toBe(expected)
  })
})

describe('local alert service', () => {
  it('ignores history events and fires on live events', async () => {
    const h = await harness()
    const alert = h.service.create(draft())
    h.setEvents([alertEvent(1, 10, false)])

    await h.hub.updateFeed(feed(1, [1]))
    await vi.waitFor(() => expect(h.hub.get(FEED, REQUEST_KEY)).toBeDefined())
    expect(h.service.history()).toHaveLength(0)

    h.setEvents([alertEvent(2, 11)])
    await h.hub.updateFeed(feed(2, [1, 2]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(1))

    const fire = h.service.history()[0]!
    expect(fire.alertId).toBe(alert.id)
    expect(fire.price).toBe(11)
    expect(fire.message).toBe('BTCUSDT 1 11')
    expect(fire.source.ticker).toBe('BTCUSDT')
    expect(fire.source.interval).toBe('1')
    expect(h.notifier.notify).toHaveBeenCalledOnce()
    h.service.dispose()
    h.hub.dispose()
  })

  it('fires once per bar and honors cooldown', async () => {
    const h = await harness()
    h.service.create(draft({ frequency: 'per-bar', cooldownMs: 5_000 }))
    h.setEvents([alertEvent(1, 10, false)])
    await h.hub.updateFeed(feed(1, [1]))
    await vi.waitFor(() => expect(h.hub.get(FEED, REQUEST_KEY)).toBeDefined())

    h.setEvents([alertEvent(2), alertEvent(2)])
    await h.hub.updateFeed(feed(2, [1, 2]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(1))

    h.setClock(2_000)
    h.setEvents([alertEvent(3)])
    await h.hub.updateFeed(feed(3, [1, 2, 3]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(1))

    h.setClock(10_000)
    h.setEvents([alertEvent(4)])
    await h.hub.updateFeed(feed(4, [1, 2, 3, 4]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(2))
    h.service.dispose()
    h.hub.dispose()
  })

  it('settles per-bar-close events only after the bar closes', async () => {
    const h = await harness()
    h.service.create(draft({ frequency: 'per-bar-close' }))
    h.setEvents([])
    await h.hub.updateFeed(feed(1, [1]))
    await vi.waitFor(() => expect(h.hub.get(FEED, REQUEST_KEY)).toBeDefined())

    h.setEvents([alertEvent(1, 9)])
    await h.hub.updateFeed(feed(2, [1]))
    await vi.waitFor(() => expect(h.hub.get(FEED, REQUEST_KEY)?.dataRevision).toBe(2))
    expect(h.service.history()).toHaveLength(0)

    h.setEvents([])
    await h.hub.updateFeed(feed(3, [1, 2]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(1))
    expect(h.service.history()[0]!.price).toBe(9)
    h.service.dispose()
    h.hub.dispose()
  })

  it('treats once as terminal until re-enabled, and re-arms on enable', async () => {
    const h = await harness()
    const alert = h.service.create(draft({ frequency: 'once' }))
    h.setEvents([alertEvent(1, 10, false)])
    await h.hub.updateFeed(feed(1, [1]))
    await vi.waitFor(() => expect(h.hub.get(FEED, REQUEST_KEY)).toBeDefined())

    h.setEvents([alertEvent(2)])
    await h.hub.updateFeed(feed(2, [1, 2]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(1))
    expect(alertStatus(h.service.get(alert.id)!, 2_000)).toBe('triggered')

    h.service.setEnabled(alert.id, false)
    expect(alertStatus(h.service.get(alert.id)!, 2_000)).toBe('paused')
    h.service.setEnabled(alert.id, true)
    expect(alertStatus(h.service.get(alert.id)!, 2_000)).toBe('active')

    h.setEvents([alertEvent(3)])
    await h.hub.updateFeed(feed(3, [1, 2, 3]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(2))
    h.service.dispose()
    h.hub.dispose()
  })

  it('does not fire after expiry and keeps failures visible', async () => {
    const h = await harness()
    h.service.create(draft({ expiresAt: 1_500 }))
    h.setEvents([alertEvent(1, 10, false)])
    await h.hub.updateFeed(feed(1, [1]))
    await vi.waitFor(() => expect(h.hub.get(FEED, REQUEST_KEY)).toBeDefined())

    h.setClock(1_000)
    h.setEvents([alertEvent(2)])
    await h.hub.updateFeed(feed(2, [1, 2]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(1))

    h.setClock(2_000)
    h.setEvents([alertEvent(3)])
    await h.hub.updateFeed(feed(3, [1, 2, 3]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(1))

    const failing = h.service.create(draft({ name: 'failing' }))
    h.setFailing(true)
    await h.hub.updateFeed(feed(4, [1, 2, 3, 4]))
    await vi.waitFor(() => expect(h.service.get(failing.id)?.lastError).toBe('script failed'))
    expect(alertStatus(h.service.get(failing.id)!, 2_000)).toBe('error')

    h.setFailing(false)
    await h.hub.updateFeed(feed(5, [1, 2, 3, 4, 5]))
    await vi.waitFor(() => expect(h.service.get(failing.id)?.lastError).toBeUndefined())
    h.service.dispose()
    h.hub.dispose()
  })

  it('restores rules and history from storage', async () => {
    const h = await harness()
    h.service.create(draft())
    h.setEvents([alertEvent(1, 10, false)])
    await h.hub.updateFeed(feed(1, [1]))
    await vi.waitFor(() => expect(h.hub.get(FEED, REQUEST_KEY)).toBeDefined())
    h.setEvents([alertEvent(2)])
    await h.hub.updateFeed(feed(2, [1, 2]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(1))

    await vi.waitFor(async () => {
      expect((await h.rules.read())?.alerts).toHaveLength(1)
      expect((await h.fires.read())?.fires).toHaveLength(1)
    })
    h.service.dispose()
    h.hub.dispose()

    const restoredHub = createCalculationHub({ resolveDefinition: () => undefined })
    const restored = await createLocalAlertService({
      hub: restoredHub,
      rules: h.rules,
      fires: h.fires,
      now: () => 2_000,
    })
    expect(restored.alerts.peek()).toHaveLength(1)
    expect(restored.history()).toHaveLength(1)
    restored.dispose()
    restoredHub.dispose()
  })

  it('bounds history and supports clearing one alert', async () => {
    const h = await harness({ maxFires: 2, maxFiresPerAlert: 1 })
    const first = h.service.create(draft({ name: 'first' }))
    const second = h.service.create(draft({ name: 'second' }))
    h.setEvents([alertEvent(1, 10, false)])
    await h.hub.updateFeed(feed(1, [1]))
    await vi.waitFor(() => expect(h.hub.get(FEED, REQUEST_KEY)).toBeDefined())
    h.setEvents([alertEvent(2)])
    await h.hub.updateFeed(feed(2, [1, 2]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(2))
    h.setEvents([alertEvent(3)])
    await h.hub.updateFeed(feed(3, [1, 2, 3]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(2))
    expect(h.service.history().filter((fire) => fire.alertId === first.id)).toHaveLength(1)

    h.service.clearHistory(first.id)
    expect(h.service.history().every((fire) => fire.alertId === second.id)).toBe(true)
    h.service.dispose()
    h.hub.dispose()
  })

  it('removes a rule, keeps history, and rejects unknown ids', async () => {
    const h = await harness()
    const alert = h.service.create(draft())
    h.setEvents([alertEvent(1, 10, false)])
    await h.hub.updateFeed(feed(1, [1]))
    await vi.waitFor(() => expect(h.hub.get(FEED, REQUEST_KEY)).toBeDefined())
    h.setEvents([alertEvent(2)])
    await h.hub.updateFeed(feed(2, [1, 2]))
    await vi.waitFor(() => expect(h.service.history()).toHaveLength(1))

    h.service.remove(alert.id)
    expect(h.service.get(alert.id)).toBeNull()
    expect(h.service.history()).toHaveLength(1)
    expect(() => h.service.remove(alert.id)).toThrow('Unknown alert')
    h.service.dispose()
    h.hub.dispose()
  })
})
