import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCalculationHub } from '../../../engine/calculation/index.js'
import { makeSymbolSpec } from '../../../engine/data/__tests__/helpers/symbolSpecFixture.js'
import { clearIndicatorStoreForTest, registerIndicators } from '../../../engine/indicators/pipeline/index.js'
import { createMemoryDocumentStore } from '../../../foundation/persistence/index.js'
import { createAlertService, decodeRules, type AlertDraft, type AlertFiresDocument, type AlertFrequency, type AlertRulesDocument } from '../index.js'
import { alertFeedIdentity } from '../impl/alertSymbol.js'

const symbol = makeSymbolSpec({ id: 'BTC', symbol: 'BTCUSDT', source: 'binance', period: '1', adjust: 'none' })
const script = { definitionId: 'PriceCross', inputs: {} }
const identity = alertFeedIdentity(symbol)
const draft: AlertDraft = { name: 'PriceCross', script, symbol, channels: ['in-app'], message: '{{message}}' }

afterEach(clearIndicatorStoreForTest)

async function setup(frequency: AlertFrequency) {
  registerIndicators([{
    kind: 'descriptor',
    candidate: { key: script.definitionId, origin: 'third-party', identity: 'native' },
    descriptor: {
      kind: 'alert', frequency, name: script.definitionId, displayName: 'Price cross',
      category: 'sub', defaultPaneId: 'sub_alert', defaultInputs: { price: 100 },
    },
  }])
  const observed = vi.fn()
  const payloads = new Map<number, readonly number[]>()
  const hub = createCalculationHub({
    resolveDefinition: (definitionId) => ({
      definitionId, dependency: { kind: 'stateful' },
      compute(data, inputs) {
        observed(inputs, data.at(-1)?.close)
        const bar = data.at(-1)!
        return { series: undefined, alerts: (payloads.get(bar.close) ?? []).map((price) =>
          ({ barTime: bar.timestamp, price, message: String(price) })),
        }
      },
    }),
  })
  const rules = createMemoryDocumentStore<AlertRulesDocument>(null)
  const fires = createMemoryDocumentStore<AlertFiresDocument>(null)
  const retain = vi.fn()
  let clock = 1000
  const deps = { hub, rules, fires, feeds: { retain }, now: () => clock }
  const service = await createAlertService(deps)
  let revision = 0
  function push(time: number, events: readonly number[], closed = false) {
    const close = ++revision
    payloads.set(close, events)
    hub.updateFeed({
      identity, dataRevision: revision, marketRevision: 0, timestamps: [time],
      data: [{ timestamp: time, close, open: close, high: close, low: close }],
      change: { start: 0, end: 1 }, live: true, ordered: true,
      ...(closed ? { closedBarTime: time } : {}),
    })
  }
  return { hub, rules, fires, service, retain, observed, deps, push, advance: (by: number) => { clock += by } }
}

describe('alert rules', () => {
  it.each<{ frequency: AlertFrequency; expected: number[] }>([
    { frequency: 'once', expected: [1] },
    { frequency: 'per-bar', expected: [1, 4] },
    { frequency: 'per-bar-close', expected: [3] },
    { frequency: 'all', expected: [1, 2, 3, 4] },
  ])('applies $frequency consistently across a batch, close and rollover', async ({ frequency, expected }) => {
    const { hub, service, push } = await setup(frequency)
    const delivered: number[] = []
    service.subscribeNotifications('in-app', (fire) => delivered.push(fire.price))
    try {
      service.create(draft)
      push(10, [1, 2])
      push(10, [3])
      push(10, [], true)
      push(20, [4])
      await vi.waitFor(() => expect(delivered).toEqual(expected))
      await service.dispose()
      expect(service.fires.peek().map((fire) => fire.price)).toEqual(expected.slice().reverse())
    } finally {
      await service.dispose()
      hub.dispose()
    }
  })

  it('keeps one rule per script per symbol and projects them independently', async () => {
    const { hub, service } = await setup('all')
    const other = makeSymbolSpec({
      id: 'ETH',
      symbol: 'ETHUSDT',
      source: 'binance',
      period: '1',
      adjust: 'none',
    })
    const btc = service.create(draft)
    const eth = service.create({ ...draft, name: 'PriceCross ETH', symbol: other })
    expect(service.forSymbol(symbol).peek()).toEqual([btc])
    expect(service.forSymbol(other).peek()).toEqual([eth])
    expect(service.list()).toHaveLength(2)
    service.remove(btc.id)
    expect(service.forSymbol(symbol).peek()).toEqual([])
    expect(service.forSymbol(other).peek()).toEqual([eth])
    await service.dispose()
    hub.dispose()
  })

  it('uses current defaults and cooldown and routes only to the selected channel', async () => {
    const { hub, service, observed, push, advance } = await setup('all')
    const inApp = vi.fn()
    const sound = vi.fn()
    service.subscribeNotifications('in-app', inApp)
    service.subscribeNotifications('sound', sound)
    service.create({ ...draft, channels: ['sound'], cooldownMs: 100, expiresAt: 1200 })
    push(10, [1, 2])
    await vi.waitFor(() => expect(sound).toHaveBeenCalledTimes(1))
    expect(observed).toHaveBeenCalledWith({ price: 100 }, 1)
    advance(100)
    push(10, [3])
    await vi.waitFor(() => expect(sound).toHaveBeenCalledTimes(2))
    advance(100)
    push(10, [4])
    await vi.waitFor(() => expect(observed).toHaveBeenCalledWith({ price: 100 }, 3))
    expect(service.list({ status: 'expired' })).toHaveLength(1)
    await service.dispose()
    hub.dispose()
    expect(inApp).not.toHaveBeenCalled()
    expect(sound).toHaveBeenCalledTimes(2)
  })

  it('does not replay cached results when a rule or its recipient changes', async () => {
    const { hub, service, push } = await setup('all')
    const rule = service.create(draft)
    push(10, [1])
    await vi.waitFor(() => expect(service.fires.peek()).toHaveLength(1))
    service.update(rule.id, { message: 'updated {{message}}' })
    service.create({ ...draft, name: 'Same inputs' })
    expect(service.fires.peek()).toHaveLength(1)
    push(10, [2])
    await vi.waitFor(() => expect(service.fires.peek()).toHaveLength(3))
    expect(service.fires.peek().map((fire) => fire.message)).toEqual(['2', 'updated 2', '1'])
    await service.dispose()
    hub.dispose()
  })

  it('restores a terminal once rule and migrates the previous document field', async () => {
    const { hub, service, push, rules, deps } = await setup('once')
    const rule = service.create(draft)
    push(10, [1])
    await vi.waitFor(() => expect(service.fires.peek()).toHaveLength(1))
    await service.dispose()
    const persisted = (await rules.read())!.alerts[0]!
    const { script: reference, ...legacy } = persisted
    await rules.write(decodeRules({ version: 1, alerts: [{ ...legacy, condition: reference, frequency: 'all' }] }))
    const restored = await createAlertService(deps)
    expect(restored.list({ status: 'triggered' }).map((item) => item.id)).toEqual([rule.id])
    expect(restored.get(rule.id)?.script).toEqual(reference)
    restored.setEnabled(rule.id, false)
    restored.setEnabled(rule.id, true)
    push(20, [2])
    expect(restored.fires.peek()).toHaveLength(1)
    await restored.dispose()
    hub.dispose()
  })
})
