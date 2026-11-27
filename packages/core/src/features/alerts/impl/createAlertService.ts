/**
 * 警报服务：消费计算中枢的结果，负责频率、冷却、过期、日志与投递。
 *
 * 规则只声明脚本、品种、参数与投递策略；触发条件完全由脚本定义。
 * 时钟、容量策略与错误出口都由宿主注入，服务内不提供任何默认值。
 */
import type { SymbolSpec } from '@/foundation/types/instrument.js'
import {
  type CalculationHub,
  type CalculationInputs,
  type CalculationRequest,
  type CalculationResult,
  createCalculationKey,
  createFeedKey,
  createLocalCalculationKey,
  type FeedKey,
  type ScriptAlertEvent,
} from '../../../engine/calculation/index.js'
import type { DefinitionRegistry } from '../../../engine/indicators/registry/index.js'
import { ALERT_ERROR_CODES, KLineChartError } from '../../../errors.js'
import type { DocumentStore } from '@/foundation/persistence/types.js'
import {
  asReadonlySignal,
  batch,
  computed,
  createSignal,
  type ReadonlySignal,
} from '../../../foundation/reactivity/signal.js'
import type { Clock } from '../../../foundation/utils/clock.js'
import { deepFreezeSnapshot } from '../../../foundation/utils/deepFreezeSnapshot.js'
import { generateUUID } from '../../../foundation/utils/uuid.js'
import type {
  Alert,
  AlertChannel,
  AlertDraft,
  AlertFire,
  AlertFrequency,
  AlertLimits,
  AlertService,
} from '../types.js'
import {
  ALERT_DOCUMENT_VERSION,
  type AlertFiresDocument,
  type AlertRulesDocument,
} from './alertCodec.js'
import { alertStatus } from './alertStatus.js'
import { alertFeedIdentity } from './alertSymbol.js'
import type { AlertFeedLease } from './createAlertFeeds.js'

interface AlertServiceDependencies {
  readonly hub: CalculationHub
  readonly definitions: DefinitionRegistry
  readonly rules: DocumentStore<AlertRulesDocument>
  readonly fires: DocumentStore<AlertFiresDocument>
  readonly feeds: Pick<AlertFeedLease, 'retain'>
  /** 时间来源；频率、冷却与过期判断共用。 */
  readonly clock: Clock
  /** 容量策略；由宿主显式给出。 */
  readonly limits: AlertLimits
  /** 持久化与投递失败的唯一出口。 */
  readonly onError: (error: unknown) => void
}

interface RuleEvaluation {
  revision: number
  pendingClose?: ScriptAlertEvent
}

function readScript(definitions: DefinitionRegistry, id: string) {
  const descriptor = definitions.getDescriptor(id)
  if (descriptor?.kind !== 'alert') return undefined
  return { id: descriptor.name, frequency: descriptor.frequency, defaults: descriptor.defaultInputs }
}

function validateDraft(draft: AlertDraft): void {
  if (
    !draft.name.trim() ||
    !draft.message ||
    !draft.channels.length ||
    draft.channels.some((channel) => channel !== 'in-app' && channel !== 'sound')
  ) {
    throw new KLineChartError(
      ALERT_ERROR_CODES.INVALID_CONDITION,
      'Alert requires a name, message and valid delivery channels',
    )
  }
  if (draft.cooldownMs !== undefined && (!Number.isFinite(draft.cooldownMs) || draft.cooldownMs < 0)) {
    throw new KLineChartError(
      ALERT_ERROR_CODES.INVALID_POLICY,
      'Alert cooldownMs must be a non-negative finite number',
    )
  }
  if (draft.expiresAt !== undefined && !Number.isFinite(draft.expiresAt)) {
    throw new KLineChartError(ALERT_ERROR_CODES.INVALID_POLICY, 'Alert expiresAt must be a finite timestamp')
  }
}

function scriptReference(
  definitions: DefinitionRegistry,
  script: Alert['script'],
): Alert['script'] {
  const definition = readScript(definitions, script.definitionId)
  if (!definition) {
    throw new KLineChartError(
      ALERT_ERROR_CODES.INVALID_CONDITION,
      `Alert requires a registered alert script: ${script.definitionId}`,
    )
  }
  return { definitionId: definition.id, inputs: script.inputs }
}

function isScalar(value: unknown): value is number | string | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

function calculationInputs(
  defaults: Readonly<Record<string, unknown>> | undefined,
  overrides: CalculationInputs,
): CalculationInputs {
  const inputs: Record<string, number | string | boolean> = {}
  for (const [key, value] of Object.entries(defaults ?? {})) {
    if (isScalar(value)) {
      const override = overrides[key]
      inputs[key] = isScalar(override) && typeof override === typeof value ? override : value
    }
  }
  return inputs
}

function canEvaluate(alert: Alert, frequency: AlertFrequency, now: number): boolean {
  const status = alertStatus(alert, frequency, now)
  return status === 'active' || status === 'error'
}

function makeFire(alert: Alert, event: ScriptAlertEvent, firedAt: number): AlertFire {
  const ticker = alert.symbol.instrument.symbol
  const interval = alertFeedIdentity(alert.symbol).period
  const tokens = new Map([
    ['ticker', ticker],
    ['interval', interval],
    ['close', String(event.price)],
    ['time', String(event.barTime)],
    ['message', event.message],
  ])
  const message = alert.message.replace(/\{\{(\w+)\}\}/g, (token, name: string) => tokens.get(name) ?? token)
  return Object.freeze({
    id: generateUUID(),
    alertId: alert.id,
    firedAt,
    source: Object.freeze({ ticker, interval }),
    message,
    price: event.price,
    barTime: event.barTime,
  })
}

export async function createAlertService(deps: AlertServiceDependencies): Promise<AlertService> {
  const { definitions, clock, limits, onError: reportError } = deps
  const [rulesDocument, firesDocument] = await Promise.all([deps.rules.read(), deps.fires.read()])
  const rules = new Map((rulesDocument?.alerts ?? []).map((rule) => [rule.id, rule]))
  let history = (firesDocument?.fires ?? []).slice(0, limits.maxFires)
  const alerts = createSignal<readonly Alert[]>(Object.freeze([...rules.values()]))
  const fires = createSignal<readonly AlertFire[]>(Object.freeze(history))
  const evaluations = new Map<string, RuleEvaluation>()
  const listeners = new Map<AlertChannel, Set<(fire: AlertFire) => void>>()
  const scopedSignals = new Map<FeedKey, ReadonlySignal<readonly Alert[]>>()
  let routes = new Map<string, string[]>()
  let writes = Promise.resolve()
  let disposed = false

  function publish(rulesChanged: boolean, historyChanged = false): void {
    const nextRules = rulesChanged ? Object.freeze([...rules.values()]) : undefined
    const nextHistory = historyChanged ? Object.freeze(history) : undefined
    writes = writes.then(async () => {
      if (nextRules)
        await deps.rules
          .write({ version: ALERT_DOCUMENT_VERSION, alerts: nextRules })
          .catch(reportError)
      if (nextHistory)
        await deps.fires
          .write({ version: ALERT_DOCUMENT_VERSION, fires: nextHistory })
          .catch(reportError)
    })
    batch(() => {
      if (nextRules) alerts.set(nextRules)
      if (nextHistory) fires.set(nextHistory)
    })
  }

  function updatePlan(): void {
    const symbols = new Map<FeedKey, SymbolSpec>()
    const requests = new Map<FeedKey, Map<string, CalculationRequest>>()
    routes = new Map()
    const now = clock.now()
    for (const alert of rules.values()) {
      if (!alert.enabled) continue
      const script = readScript(definitions, alert.script.definitionId)
      if (!script || !canEvaluate(alert, script.frequency, now)) continue
      const feed = createFeedKey(alertFeedIdentity(alert.symbol))
      const request = {
        definitionId: script.id,
        inputs: calculationInputs(script.defaults, alert.script.inputs),
        context: {},
      }
      const key = createLocalCalculationKey(request)
      const route = createCalculationKey(feed, key)
      let forFeed = requests.get(feed)
      if (!forFeed) {
        forFeed = new Map()
        requests.set(feed, forFeed)
        symbols.set(feed, alert.symbol)
      }
      forFeed.set(key, { ...request, key })
      const ids = routes.get(route)
      if (ids) ids.push(alert.id)
      else routes.set(route, [alert.id])
    }
    client.setPlan([...requests].map(([feed, group]) => ({ feed, requests: [...group.values()] })))
    deps.feeds.retain([...symbols.values()])
  }

  function recordFires(id: string, events: readonly ScriptAlertEvent[], frequency: AlertFrequency): void {
    const original = rules.get(id)
    if (!original) return
    const timestamp = clock.now()
    const status = alertStatus(original, frequency, timestamp)
    if (status === 'expired') updatePlan()
    if (status !== 'active' && status !== 'error') return

    const accepted: AlertFire[] = []
    const { lastError, ...healthy } = original
    let alert: Alert = lastError === undefined ? original : Object.freeze(healthy)
    for (const event of events) {
      if (alert.lastFiredAt !== undefined && timestamp - alert.lastFiredAt < (alert.cooldownMs ?? 0)) break
      if (
        (frequency === 'per-bar' || frequency === 'per-bar-close') &&
        alert.lastFiredBarTime === event.barTime
      )
        continue
      accepted.push(makeFire(alert, event, timestamp))
      alert = Object.freeze({ ...alert, lastFiredAt: timestamp, lastFiredBarTime: event.barTime })
      if (frequency === 'once') break
    }
    if (alert === original) return

    rules.set(id, alert)
    if (accepted.length) {
      let count = 0
      history = [...accepted.slice().reverse(), ...history]
        .filter((fire) => fire.alertId !== id || ++count <= limits.maxFiresPerAlert)
        .slice(0, limits.maxFires)
    }
    if (frequency === 'once' && accepted.length) updatePlan()
    publish(true, accepted.length > 0)
    for (const fire of accepted) {
      for (const channel of alert.channels) {
        for (const listener of [...(listeners.get(channel) ?? [])]) {
          try {
            listener(fire)
          } catch (error) {
            reportError(error)
          }
        }
      }
    }
  }

  function acceptResult(feed: FeedKey, result: CalculationResult): void {
    for (const id of routes.get(createCalculationKey(feed, result.key)) ?? []) {
      const alert = rules.get(id)
      if (!alert?.enabled) continue
      const script = readScript(definitions, alert.script.definitionId)
      if (!script) continue
      const evaluation = evaluations.get(id) ?? { revision: 0 }
      if (result.dataRevision <= evaluation.revision) continue
      evaluation.revision = result.dataRevision
      evaluations.set(id, evaluation)
      if (result.error) {
        if (alert.lastError !== result.error.message) {
          rules.set(id, Object.freeze({ ...alert, lastError: result.error.message }))
          publish(true)
        }
        continue
      }
      if (script.frequency !== 'per-bar-close') {
        evaluation.pendingClose = undefined
        recordFires(id, result.alerts, script.frequency)
        continue
      }
      const event = result.alerts.at(-1)
      if (event) evaluation.pendingClose = event
      const pending = evaluation.pendingClose
      const closed = result.closedBarTime
      if (pending && closed !== undefined && pending.barTime <= closed) evaluation.pendingClose = undefined
      recordFires(id, pending && pending.barTime === closed ? [pending] : [], script.frequency)
    }
  }

  function requireAlert(id: string): Alert {
    const alert = rules.get(id)
    if (!alert) throw new KLineChartError(ALERT_ERROR_CODES.NOT_FOUND, `Unknown alert: ${id}`)
    return alert
  }

  function save(alert: Alert): Alert {
    const snapshot = deepFreezeSnapshot({ ...alert, channels: [...new Set(alert.channels)] })
    rules.set(snapshot.id, snapshot)
    const revision = deps.hub.readDataRevision(createFeedKey(alertFeedIdentity(snapshot.symbol))) ?? 0
    evaluations.set(snapshot.id, { revision })
    updatePlan()
    publish(true)
    return snapshot
  }

  const client = deps.hub.createClient('alerts', { onResult: acceptResult, onError: reportError })
  const unsubscribeCatalog = definitions.revision.subscribe(updatePlan)
  updatePlan()

  return {
    alerts: asReadonlySignal(alerts),
    fires: asReadonlySignal(fires),
    forSymbol(symbol) {
      const feed = createFeedKey(alertFeedIdentity(symbol))
      const existing = scopedSignals.get(feed)
      if (existing) return existing
      const scoped = computed(() =>
        Object.freeze(
          [...alerts()].filter(
            (alert) => createFeedKey(alertFeedIdentity(alert.symbol)) === feed,
          ),
        ),
      )
      scopedSignals.set(feed, scoped)
      return scoped
    },
    create(draft) {
      validateDraft(draft)
      if (rules.size >= limits.maxAlerts) {
        throw new KLineChartError(
          ALERT_ERROR_CODES.LIMIT_REACHED,
          `Alert limit reached: ${limits.maxAlerts}`,
        )
      }
      return save({
        ...draft,
        script: scriptReference(definitions, draft.script),
        id: generateUUID(),
        enabled: draft.enabled ?? true,
        createdAt: clock.now(),
      })
    },
    update(id, patch) {
      const alert = requireAlert(id)
      const next: Alert = {
        ...alert,
        name: patch.name ?? alert.name,
        script: patch.script === undefined ? alert.script : scriptReference(definitions, patch.script),
        symbol: patch.symbol ?? alert.symbol,
        cooldownMs: patch.cooldownMs ?? alert.cooldownMs,
        expiresAt: patch.expiresAt ?? alert.expiresAt,
        message: patch.message ?? alert.message,
        channels: patch.channels ?? alert.channels,
        enabled: patch.enabled ?? alert.enabled,
      }
      validateDraft(next)
      const sameFeed =
        createFeedKey(alertFeedIdentity(next.symbol)) ===
        createFeedKey(alertFeedIdentity(alert.symbol))
      if (sameFeed) return save(next)
      const { lastFiredBarTime: _previousBar, ...rebound } = next
      return save(rebound)
    },
    remove(id) {
      requireAlert(id)
      rules.delete(id)
      evaluations.delete(id)
      updatePlan()
      publish(true)
    },
    get: (id) => rules.get(id) ?? null,
    list({ symbol, status } = {}) {
      const feed = symbol && createFeedKey(alertFeedIdentity(symbol))
      const timestamp = clock.now()
      return [...rules.values()].filter(
        (alert) =>
          (!feed || createFeedKey(alertFeedIdentity(alert.symbol)) === feed) &&
          (status === undefined ||
            alertStatus(
              alert,
              readScript(definitions, alert.script.definitionId)?.frequency,
              timestamp,
            ) === status),
      )
    },
    setEnabled(id, enabled) {
      const alert = requireAlert(id)
      if (alert.enabled === enabled) return alert
      const { lastError, ...healthy } = alert
      return save({ ...(enabled ? healthy : alert), enabled })
    },
    clearHistory(id) {
      const next = id === undefined ? [] : history.filter((fire) => fire.alertId !== id)
      if (next.length === history.length) return
      history = next
      publish(false, true)
    },
    subscribeNotifications(channel, listener) {
      const subscribers = listeners.get(channel) ?? new Set()
      listeners.set(channel, subscribers)
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
    dispose() {
      if (!disposed) {
        disposed = true
        unsubscribeCatalog()
        client.dispose()
        listeners.clear()
        scopedSignals.clear()
        deps.feeds.retain([])
      }
      return writes
    },
  }
}
