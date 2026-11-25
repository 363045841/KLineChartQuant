/**
 * 本地警报服务：把警报规则接到计算中枢，并负责触发策略、日志与投递。
 *
 * 不创建执行链路、不读图表：条件由脚本定义，计算由 CalculationHub 完成，
 * 本服务只消费结果里的 alert 事件。
 */
import type { SymbolSpec } from '../../../controllers/types.js'
import { DEFAULT_KLINE_ADJUSTMENT, DEFAULT_KLINE_PERIOD } from '../../../data/provider/types.js'
import {
  type CalculationClient,
  type CalculationCommit,
  type CalculationHub,
  type CalculationRequest,
  type CalculationResult,
  createDataIdentity,
  createFeedKey,
  createLocalCalculationKey,
  type DataIdentity,
  type FeedKey,
  type FeedPlan,
  type ScriptAlertEvent,
  type ScriptEvent,
} from '../../../engine/calculation/index.js'
import { ALERT_ERROR_CODES, KLineChartError } from '../../../errors.js'
import type { DocumentStore } from '../../../foundation/persistence/index.js'
import {
  asReadonlySignal,
  batch,
  createSignal,
} from '../../../foundation/reactivity/signal.js'
import { deepFreezeSnapshot } from '../../../foundation/utils/deepFreezeSnapshot.js'
import { generateUUID } from '../../../foundation/utils/uuid.js'
import type {
  Alert,
  AlertChange,
  AlertChannel,
  AlertDraft,
  AlertFire,
  AlertLimits,
  AlertNotifier,
  AlertService,
  AlertStatus,
} from '../types.js'
import { alertStatus } from './alertStatus.js'
import {
  ALERT_DOCUMENT_VERSION,
  type AlertFiresDocument,
  type AlertRulesDocument,
} from './alertCodec.js'

const DEFAULT_LIMITS: AlertLimits = Object.freeze({
  maxAlerts: 200,
  maxFires: 1000,
  maxFiresPerAlert: 200,
})

/** 本地服务的依赖；存储、通知与时钟都由宿主注入。 */
export interface LocalAlertServiceDependencies {
  readonly hub: CalculationHub
  readonly rules: DocumentStore<AlertRulesDocument>
  readonly fires: DocumentStore<AlertFiresDocument>
  /** 脚本显示名；日志来源解析失败时省略，不回退到内部 id。 */
  readonly resolveScriptTitle?: (definitionId: string) => string | undefined
  /** 应用内通知；不注入时只通过 subscribe 事件暴露。 */
  readonly notifier?: AlertNotifier
  /** 提示音；由宿主实现，默认静默。 */
  readonly playSound?: () => void
  readonly now?: () => number
  readonly limits?: Partial<AlertLimits>
  readonly onPersistError?: (error: unknown) => void
  readonly onListenerError?: (error: unknown) => void
}

/** 判断事件是否为警报；日志事件不参与触发。 */
function isAlertEvent(event: ScriptEvent): event is ScriptAlertEvent {
  return event.kind === 'alert'
}

/** 由品种规格得到数据身份；周期与复权缺省只在这里归一。 */
function identityOf(symbol: SymbolSpec): DataIdentity {
  return createDataIdentity({
    source: symbol.instrument.source,
    instrument: symbol.instrument.id,
    period: symbol.period,
    adjustment: symbol.adjust,
    defaultPeriod: DEFAULT_KLINE_PERIOD,
    defaultAdjustment: DEFAULT_KLINE_ADJUSTMENT,
  })
}

/** 渲染消息占位符；未知占位符保持原样，不做隐式替换。 */
function renderMessage(template: string, alert: Alert, event: ScriptAlertEvent): string {
  return template
    .replaceAll('{{ticker}}', alert.symbol.instrument.symbol)
    .replaceAll('{{interval}}', identityOf(alert.symbol).period)
    .replaceAll('{{close}}', String(event.price))
    .replaceAll('{{time}}', new Date(event.time).toISOString())
}

/** 校验频率与冷却；非法输入直接拒绝，不静默纠正。 */
function validatePolicy(draft: AlertDraft): void {
  if (!['once', 'per-bar', 'per-bar-close', 'all'].includes(draft.frequency))
    throw new KLineChartError(
      ALERT_ERROR_CODES.INVALID_POLICY,
      `Unsupported alert frequency: ${String(draft.frequency)}`,
    )
  if (draft.cooldownMs !== undefined && (!Number.isFinite(draft.cooldownMs) || draft.cooldownMs < 0))
    throw new KLineChartError(
      ALERT_ERROR_CODES.INVALID_POLICY,
      'Alert cooldownMs must be a non-negative finite number',
    )
  if (draft.expiresAt !== undefined && !Number.isFinite(draft.expiresAt))
    throw new KLineChartError(
      ALERT_ERROR_CODES.INVALID_POLICY,
      'Alert expiresAt must be a finite timestamp',
    )
}

/** 校验条件与展示字段；空定义或空名称无法形成可执行规则。 */
function validateDraft(draft: AlertDraft): void {
  if (draft.name.trim().length === 0)
    throw new KLineChartError(ALERT_ERROR_CODES.INVALID_CONDITION, 'Alert name is required')
  if (draft.condition.definitionId.trim().length === 0)
    throw new KLineChartError(
      ALERT_ERROR_CODES.INVALID_CONDITION,
      'Alert condition requires a script definition',
    )
  if (draft.message.length === 0)
    throw new KLineChartError(ALERT_ERROR_CODES.INVALID_CONDITION, 'Alert message is required')
  if (draft.channels.length === 0)
    throw new KLineChartError(
      ALERT_ERROR_CODES.INVALID_CONDITION,
      'Alert requires at least one delivery channel',
    )
  validatePolicy(draft)
}

/** 创建本地警报服务；先恢复持久化文档，再开放同步 API。 */
export async function createLocalAlertService(
  deps: LocalAlertServiceDependencies,
): Promise<AlertService> {
  const limits: AlertLimits = {
    maxAlerts: deps.limits?.maxAlerts ?? DEFAULT_LIMITS.maxAlerts,
    maxFires: deps.limits?.maxFires ?? DEFAULT_LIMITS.maxFires,
    maxFiresPerAlert: deps.limits?.maxFiresPerAlert ?? DEFAULT_LIMITS.maxFiresPerAlert,
  }
  const now = deps.now ?? (() => Date.now())

  const restoredRules = await deps.rules.read()
  const restoredFires = await deps.fires.read()
  const alerts = new Map<string, Alert>(
    (restoredRules?.alerts ?? []).map((alert) => [alert.id, alert]),
  )
  let fires = [...(restoredFires?.fires ?? [])].slice(0, limits.maxFires)
  const alertsSignal = createSignal<readonly Alert[]>(Object.freeze([...alerts.values()]))
  const firesSignal = createSignal<readonly AlertFire[]>(Object.freeze(fires))
  const listeners = new Set<(change: AlertChange) => void>()

  /** 已武装的规则；首次提交只作为基线，不触发历史事件。 */
  const lastRevision = new Map<string, number>()
  const lastBar = new Map<string, number>()
  const pendingClose = new Map<string, ScriptAlertEvent>()
  /** 复合键（feed + 本地计算键）→ 订阅该结果的警报集合。 */
  let routing = new Map<string, ReadonlySet<string>>()

  let writeQueue: Promise<void> = Promise.resolve()
  let disposed = false

  /** 串行写盘；失败只上报，不打断后续写入。 */
  function enqueueWrite(task: () => Promise<void>): void {
    writeQueue = writeQueue.then(task).catch((error) => deps.onPersistError?.(error))
  }

  function persistRules(): void {
    const document: AlertRulesDocument = Object.freeze({
      version: ALERT_DOCUMENT_VERSION,
      alerts: Object.freeze([...alerts.values()]),
    })
    enqueueWrite(() => deps.rules.write(document))
  }

  function persistFires(): void {
    const document: AlertFiresDocument = Object.freeze({
      version: ALERT_DOCUMENT_VERSION,
      fires: Object.freeze([...fires]),
    })
    enqueueWrite(() => deps.fires.write(document))
  }

  function publishAlerts(): void {
    alertsSignal.set(Object.freeze([...alerts.values()]))
  }

  function publishFires(): void {
    firesSignal.set(Object.freeze([...fires]))
  }

  function emit(change: AlertChange): void {
    for (const listener of [...listeners]) {
      try {
        listener(change)
      } catch (error) {
        deps.onListenerError?.(error)
      }
    }
  }

  const client: CalculationClient = deps.hub.createClient('alerts', {
    onCommit: (commit) => applyCommit(commit),
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      for (const alert of alerts.values()) if (alert.enabled) fail(alert.id, message)
    },
  })

  /** 重建所有启用警报的计划；同条件共享一次计算。 */
  function refreshPlan(): void {
    const groups = new Map<FeedKey, Map<string, { request: CalculationRequest; owners: Set<string> }>>()
    for (const alert of alerts.values()) {
      if (!alert.enabled) continue
      const feed = createFeedKey(identityOf(alert.symbol))
      const key = createLocalCalculationKey({
        definitionId: alert.condition.definitionId,
        inputs: alert.condition.inputs,
        context: {},
      })
      let byKey = groups.get(feed)
      if (!byKey) {
        byKey = new Map()
        groups.set(feed, byKey)
      }
      const existing = byKey.get(key)
      if (existing) existing.owners.add(alert.id)
      else
        byKey.set(key, {
          request: {
            key,
            definitionId: alert.condition.definitionId,
            inputs: alert.condition.inputs,
            context: {},
          },
          owners: new Set([alert.id]),
        })
    }
    const plan: FeedPlan[] = []
    const nextRouting = new Map<string, ReadonlySet<string>>()
    for (const [feed, byKey] of groups) {
      const requests: CalculationRequest[] = []
      for (const [key, group] of byKey) {
        const owners = Object.freeze([...group.owners])
        requests.push(Object.freeze({ ...group.request, owners }))
        nextRouting.set(`${feed}\u0000${key}`, new Set(owners))
      }
      plan.push(Object.freeze({ feed, requests: Object.freeze(requests) }))
    }
    routing = nextRouting
    client.setPlan(Object.freeze(plan))
  }

  /** 把一次计算提交分发给对应的警报。 */
  function applyCommit(commit: CalculationCommit): void {
    for (const [key, result] of commit.results) {
      const owners = routing.get(`${commit.feed}\u0000${key}`)
      if (!owners) continue
      for (const id of owners) applyResult(id, result)
    }
  }

  /** 单个警报在一份结果上的策略判定；历史事件与旧 bar 一律跳过。 */
  function applyResult(id: string, result: CalculationResult): void {
    const alert = alerts.get(id)
    if (!alert) return
    if (result.error) {
      lastRevision.set(id, result.dataRevision)
      fail(id, result.error.message)
      return
    }
    if (lastRevision.get(id) === result.dataRevision) return
    lastRevision.set(id, result.dataRevision)
    clearError(id)
    const latestBarTime =
      result.timestamps.length === 0 ? 0 : result.timestamps[result.timestamps.length - 1]!
    flushPendingClose(id, latestBarTime)
    for (const event of result.events) {
      if (!isAlertEvent(event) || !event.live) continue
      // 非最新 bar 的事件属于历史；只在实时 bar 上触发。
      if (event.time < latestBarTime) continue
      if (alert.frequency === 'per-bar-close') {
        pendingClose.set(id, event)
        continue
      }
      consider(alert, event)
    }
    flushPendingClose(id, latestBarTime)
  }

  /** 收盘结算：只在 bar 确定结束后触发缓存事件。 */
  function flushPendingClose(id: string, latestBarTime: number): void {
    const pending = pendingClose.get(id)
    if (!pending || pending.time >= latestBarTime) return
    pendingClose.delete(id)
    const alert = alerts.get(id)
    if (alert) consider(alert, pending)
  }

  /** 频率、冷却与过期共同决定是否触发。 */
  function consider(alert: Alert, event: ScriptAlertEvent): void {
    const timestamp = now()
    if (!alert.enabled) return
    if (alert.expiresAt !== undefined && timestamp >= alert.expiresAt) return
    if (alert.frequency === 'once' && alert.lastFiredAt !== undefined) return
    if (
      alert.cooldownMs !== undefined &&
      alert.cooldownMs > 0 &&
      alert.lastFiredAt !== undefined &&
      timestamp - alert.lastFiredAt < alert.cooldownMs
    )
      return
    if (alert.frequency === 'per-bar' && lastBar.get(alert.id) === event.time) return
    fire(alert, event, timestamp)
  }

  /** 写日志、更新规则并广播一次触发。 */
  function fire(alert: Alert, event: ScriptAlertEvent, timestamp: number): void {
    const fire: AlertFire = Object.freeze({
      id: generateUUID(),
      alertId: alert.id,
      firedAt: timestamp,
      source: Object.freeze({
        ticker: alert.symbol.instrument.symbol,
        interval: identityOf(alert.symbol).period,
        ...(deps.resolveScriptTitle?.(alert.condition.definitionId) === undefined
          ? {}
          : { scriptTitle: deps.resolveScriptTitle!(alert.condition.definitionId)! }),
      }),
      message: renderMessage(alert.message, alert, event),
      price: event.price,
      barTime: event.time,
    })
    const next: Alert = Object.freeze({
      ...alert,
      lastFiredAt: timestamp,
      ...(alert.lastError === undefined ? {} : { lastError: undefined }),
    })
    alerts.set(alert.id, next)
    lastBar.set(alert.id, event.time)
    fires = [fire, ...fires].slice(0, limits.maxFires)
    trimPerAlert(alert.id)
    const change = Object.freeze({ kind: 'fired' as const, alert: next, fire })
    batch(() => {
      publishAlerts()
      publishFires()
      emit(change)
    })
    deps.notifier?.notify(change)
    if (alert.channels.includes('sound')) deps.playSound?.()
    persistRules()
    persistFires()
  }

  /** 单规则日志有界；只丢弃该规则最旧的一条。 */
  function trimPerAlert(alertId: string): void {
    const indices: number[] = []
    for (let index = 0; index < fires.length; index++) {
      if (fires[index]!.alertId === alertId) indices.push(index)
    }
    if (indices.length <= limits.maxFiresPerAlert) return
    const remove = new Set(indices.slice(limits.maxFiresPerAlert))
    fires = fires.filter((_, index) => !remove.has(index))
  }

  /** 记录执行失败；相同消息不重复写盘与广播。 */
  function fail(id: string, message: string): void {
    const alert = alerts.get(id)
    if (!alert || alert.lastError === message) return
    const next: Alert = Object.freeze({ ...alert, lastError: message })
    alerts.set(id, next)
    publishAlerts()
    emit(Object.freeze({ kind: 'updated', alert: next }))
    persistRules()
  }

  /** 成功执行后清除失败标记；没有失败时不做任何写入。 */
  function clearError(id: string): void {
    const alert = alerts.get(id)
    if (!alert || alert.lastError === undefined) return
    const next: Alert = Object.freeze({ ...alert, lastError: undefined })
    alerts.set(id, next)
    publishAlerts()
    emit(Object.freeze({ kind: 'updated', alert: next }))
    persistRules()
  }

  /** 计划变化后重置该警报的频率状态；历史事件由事件自身的 live 标记排除。 */
  function rearm(id: string): void {
    lastRevision.delete(id)
    lastBar.delete(id)
    pendingClose.delete(id)
  }

  /** 查找规则；未知 id 是调用错误而不是空操作。 */
  function requireAlert(id: string): Alert {
    const alert = alerts.get(id)
    if (!alert)
      throw new KLineChartError(ALERT_ERROR_CODES.NOT_FOUND, `Unknown alert: ${id}`)
    return alert
  }

  refreshPlan()

  return {
    alerts: asReadonlySignal(alertsSignal),
    fires: asReadonlySignal(firesSignal),

    create(draft) {
      validateDraft(draft)
      if (alerts.size >= limits.maxAlerts)
        throw new KLineChartError(
          ALERT_ERROR_CODES.LIMIT_REACHED,
          `Alert limit reached: ${limits.maxAlerts}`,
        )
      const alert: Alert = Object.freeze({
        id: generateUUID(),
        name: draft.name,
        condition: Object.freeze({
          definitionId: draft.condition.definitionId,
          inputs: deepFreezeSnapshot(draft.condition.inputs),
        }),
        symbol: deepFreezeSnapshot(draft.symbol),
        frequency: draft.frequency,
        ...(draft.cooldownMs === undefined ? {} : { cooldownMs: draft.cooldownMs }),
        ...(draft.expiresAt === undefined ? {} : { expiresAt: draft.expiresAt }),
        message: draft.message,
        channels: Object.freeze([...draft.channels]),
        enabled: draft.enabled ?? true,
        createdAt: now(),
      })
      alerts.set(alert.id, alert)
      rearm(alert.id)
      publishAlerts()
      emit(Object.freeze({ kind: 'created', alert }))
      persistRules()
      refreshPlan()
      return alert
    },

    update(id, patch) {
      const current = requireAlert(id)
      const candidate: AlertDraft = {
        name: patch.name ?? current.name,
        condition: patch.condition ?? current.condition,
        symbol: patch.symbol ?? current.symbol,
        frequency: patch.frequency ?? current.frequency,
        cooldownMs: 'cooldownMs' in patch ? patch.cooldownMs : current.cooldownMs,
        expiresAt: 'expiresAt' in patch ? patch.expiresAt : current.expiresAt,
        message: patch.message ?? current.message,
        channels: patch.channels ?? current.channels,
        enabled: patch.enabled ?? current.enabled,
      }
      validateDraft(candidate)
      const conditionChanged =
        candidate.condition.definitionId !== current.condition.definitionId ||
        JSON.stringify(candidate.condition.inputs) !== JSON.stringify(current.condition.inputs)
      const next: Alert = Object.freeze({
        ...current,
        ...candidate,
        condition: Object.freeze({
          definitionId: candidate.condition.definitionId,
          inputs: deepFreezeSnapshot(candidate.condition.inputs),
        }),
        symbol: deepFreezeSnapshot(candidate.symbol),
        channels: Object.freeze([...candidate.channels]),
        cooldownMs: candidate.cooldownMs,
        expiresAt: candidate.expiresAt,
        ...(conditionChanged || (patch.enabled === true && !current.enabled)
          ? { lastFiredAt: undefined, lastError: undefined }
          : {}),
      })
      alerts.set(id, next)
      if (conditionChanged || (patch.enabled === true && !current.enabled)) rearm(id)
      publishAlerts()
      emit(Object.freeze({ kind: 'updated', alert: next }))
      persistRules()
      refreshPlan()
      return next
    },

    remove(id) {
      const alert = requireAlert(id)
      alerts.delete(id)
      rearm(id)
      publishAlerts()
      emit(Object.freeze({ kind: 'removed', alertId: alert.id }))
      persistRules()
      refreshPlan()
    },

    get(id) {
      return alerts.get(id) ?? null
    },

    list(query) {
      const timestamp = now()
      const feed = query?.symbol === undefined ? null : createFeedKey(identityOf(query.symbol))
      return [...alerts.values()].filter((alert) => {
        if (feed !== null && createFeedKey(identityOf(alert.symbol)) !== feed) return false
        if (query?.status !== undefined && alertStatus(alert, timestamp) !== query.status)
          return false
        return true
      })
    },

    setEnabled(id, enabled) {
      const current = requireAlert(id)
      if (current.enabled === enabled) return current
      const next: Alert = Object.freeze({
        ...current,
        enabled,
        ...(enabled ? { lastFiredAt: undefined, lastError: undefined } : {}),
      })
      alerts.set(id, next)
      if (enabled) rearm(id)
      publishAlerts()
      emit(Object.freeze({ kind: 'updated', alert: next }))
      persistRules()
      refreshPlan()
      return next
    },

    history(query) {
      const limit = query?.limit ?? 50
      const filtered =
        query?.alertId === undefined
          ? fires
          : fires.filter((fire) => fire.alertId === query.alertId)
      return filtered.slice(0, limit)
    },

    clearHistory(alertId) {
      const next =
        alertId === undefined ? [] : fires.filter((fire) => fire.alertId !== alertId)
      if (next.length === fires.length) return
      fires = next
      publishFires()
      persistFires()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      listeners.clear()
      client.dispose()
    },
  }
}
