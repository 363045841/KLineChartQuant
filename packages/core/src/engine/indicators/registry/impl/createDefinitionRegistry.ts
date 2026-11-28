/**
 * 定义注册表实现：一次校验、一次写入、一次通知。
 *
 * 所有状态在实例闭包内；同一进程可以创建多份互相隔离的注册表。
 */
import { normalizeIndicatorId } from '../../indicatorLayerNaming.js'
import type { IndicatorMetadata } from '../../indicatorMetadata.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { batch, createSignal } from '@/foundation/reactivity/signal.js'
import type {
  IndicatorCatalogCommit,
  IndicatorDefinitionLoader,
  IndicatorDescriptor,
  IndicatorFailure,
  IndicatorPipelineReport,
  RegistrableIndicator,
} from '../../pipeline/types.js'
import type { DefinitionRegistry } from '../types.js'

interface DescriptorEntry {
  readonly descriptor: IndicatorDescriptor
  readonly load?: IndicatorDefinitionLoader
  readonly origin: RegistrableIndicator['candidate']['origin']
}

/** 一条可注册项通过校验后的写入计划。 */
interface WritePlan {
  readonly key: string
  readonly metadata?: IndicatorMetadata
  readonly descriptor: IndicatorDescriptor
  readonly load?: IndicatorDefinitionLoader
  readonly origin: RegistrableIndicator['candidate']['origin']
  readonly replaced: IndicatorMetadata | undefined
  /** false 表示该身份已是同一状态：不写表、不进入变更通知。 */
  readonly changed: boolean
}

/** 目录身份的查询键：内部名与展示名。 */
function identityKeys(
  descriptor: Pick<IndicatorDescriptor, 'name' | 'displayName'>,
): readonly string[] {
  return [descriptor.name, descriptor.displayName]
}

/** 从已装配元数据派生静态目录项。 */
function descriptorFromMetadata(definition: IndicatorMetadata): IndicatorDescriptor {
  const defaultInputs = definition.runtime?.defaultInputs
  return {
    ...(definition.kind === 'alert'
      ? { kind: definition.kind, frequency: definition.frequency }
      : { kind: definition.kind }),
    name: definition.name,
    source: definition.source,
    displayName: definition.displayName,
    title: definition.title,
    info: definition.info,
    category: definition.category,
    defaultPaneId: definition.defaultPaneId,
    dataViews: definition.dataViews,
    visiblePeriods: definition.visiblePeriods,
    defaultInputs,
    defaultOptions: definition.presentation?.defaultOptions,
    inputDefs: definition.runtime?.inputDefs,
    documentIdentity: definition.document?.identity,
  }
}

/** 只保留有值的目录字段。 */
function definedDescriptor(descriptor: IndicatorDescriptor): IndicatorDescriptor {
  return Object.fromEntries(
    Object.entries(descriptor).filter(([, value]) => value !== undefined),
  ) as IndicatorDescriptor
}

/** 创建一份独立的定义注册表。 */
export function createDefinitionRegistry(): DefinitionRegistry {
  const definitions = new Map<string, IndicatorMetadata>()
  const descriptors = new Map<string, DescriptorEntry>()
  const identityIndex = new Map<string, string>()
  const pendingLoads = new Map<string, Promise<void>>()
  const revision = createSignal(0)
  const commitSignal = createSignal<IndicatorCatalogCommit | null>(null)
  const failures = createSignal<readonly IndicatorFailure[]>([])
  let disposed = false

  /** 校验全部身份键可归属到该定义。 */
  function assertIdentityAvailable(names: readonly string[], key: string): void {
    for (const name of names) {
      const target = identityIndex.get(normalizeIndicatorId(name))
      if (target && target !== key) {
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `指标身份已被占用：${name}`)
      }
    }
  }

  function planDescriptorWrite(
    item: Extract<RegistrableIndicator, { kind: 'descriptor' }>,
  ): WritePlan {
    const key = normalizeIndicatorId(item.descriptor.name)
    if (!key) {
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '指标目录项缺少名称')
    }
    const existing = descriptors.get(key)
    if (existing) {
      return {
        key,
        descriptor: existing.descriptor,
        load: existing.load,
        origin: existing.origin,
        replaced: definitions.get(key),
        changed: false,
      }
    }
    assertIdentityAvailable(identityKeys(item.descriptor), key)
    return {
      key,
      descriptor: item.descriptor,
      load: item.load,
      origin: item.candidate.origin,
      replaced: definitions.get(key),
      changed: true,
    }
  }

  function planBuiltinRepeat(
    previous: IndicatorMetadata,
    metadata: IndicatorMetadata,
    key: string,
    origin: RegistrableIndicator['candidate']['origin'],
  ): WritePlan {
    const incoming = metadata.document
    if (incoming?.identity === 'builtin' && incoming.source === previous.document?.source) {
      return {
        key,
        metadata: previous,
        descriptor: descriptorFromMetadata(previous),
        origin,
        replaced: previous,
        changed: false,
      }
    }
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      `内置脚本只读，不能覆盖：${metadata.name}`,
    )
  }

  function planDefinitionWrite(
    item: Extract<RegistrableIndicator, { kind: 'definition' }>,
  ): WritePlan {
    const metadata = item.definition
    const key = normalizeIndicatorId(metadata.name)
    if (!key) {
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '指标定义缺少名称')
    }
    const previous = definitions.get(key)
    if (previous && previous !== metadata) {
      if (previous.source !== 'script') {
        throw new KLineChartError(
          GENERIC_ERROR_CODES.INVALID_PARAM,
          `指标定义已存在：${metadata.name}`,
        )
      }
      if (previous.document?.identity === 'builtin') {
        return planBuiltinRepeat(previous, metadata, key, item.candidate.origin)
      }
    }
    assertIdentityAvailable(identityKeys(metadata), key)
    return {
      key,
      metadata,
      descriptor: descriptorFromMetadata(metadata),
      origin: item.candidate.origin,
      replaced: previous,
      changed: previous !== metadata,
    }
  }

  function planWrite(item: RegistrableIndicator): WritePlan {
    return item.kind === 'descriptor' ? planDescriptorWrite(item) : planDefinitionWrite(item)
  }

  function purgeStaleIdentityKeys(previous: IndicatorMetadata, metadata: IndicatorMetadata): void {
    const nextKeys = new Set(identityKeys(metadata).map(normalizeIndicatorId))
    for (const stale of identityKeys(previous)) {
      const staleKey = normalizeIndicatorId(stale)
      if (staleKey && !nextKeys.has(staleKey)) identityIndex.delete(staleKey)
    }
  }

  function nextDescriptor(plan: WritePlan): IndicatorDescriptor {
    if (plan.replaced) return plan.descriptor
    const stored = descriptors.get(plan.key)
    return stored === undefined
      ? plan.descriptor
      : {
          ...stored.descriptor,
          ...definedDescriptor(plan.descriptor),
          ...(plan.descriptor.kind === 'alert'
            ? { kind: plan.descriptor.kind, frequency: plan.descriptor.frequency }
            : { kind: plan.descriptor.kind, frequency: undefined }),
        }
  }

  function applyDefinitionWrite(plan: WritePlan, metadata: IndicatorMetadata): void {
    if (plan.replaced) purgeStaleIdentityKeys(plan.replaced, metadata)
    definitions.set(plan.key, metadata)
    descriptors.set(plan.key, { descriptor: nextDescriptor(plan), origin: plan.origin })
  }

  function applyDescriptorWrite(plan: WritePlan): void {
    if (descriptors.has(plan.key)) return
    descriptors.set(plan.key, {
      descriptor: plan.descriptor,
      load: plan.load,
      origin: plan.origin,
    })
  }

  function indexIdentityKeys(key: string, descriptor: IndicatorDescriptor): void {
    for (const name of identityKeys(descriptor)) {
      const normalized = normalizeIndicatorId(name)
      if (normalized) identityIndex.set(normalized, key)
    }
  }

  function applyWrite(plan: WritePlan): void {
    if (plan.metadata) applyDefinitionWrite(plan, plan.metadata)
    else applyDescriptorWrite(plan)
    indexIdentityKeys(plan.key, plan.descriptor)
  }

  function planItems(items: readonly RegistrableIndicator[]): {
    readonly plans: WritePlan[]
    readonly failures: IndicatorFailure[]
  } {
    const plans: WritePlan[] = []
    const current: IndicatorFailure[] = []
    for (const item of items) {
      try {
        plans.push(planWrite(item))
      } catch (error) {
        const name = item.kind === 'definition' ? item.definition.name : item.descriptor.name
        current.push({
          stage: 'register',
          origin: item.candidate.origin,
          key: item.candidate.key,
          name,
          error,
        })
      }
    }
    return { plans, failures: current }
  }

  function commitPlans(
    plans: readonly WritePlan[],
    currentFailures: readonly IndicatorFailure[],
  ): IndicatorPipelineReport {
    const committed = plans.map((plan) => plan.descriptor)
    const writes = plans.filter((plan) => plan.changed)
    if (writes.length === 0) return { committed, failures: currentFailures }

    const added: IndicatorMetadata[] = []
    const updated: IndicatorMetadata[] = []
    const described: IndicatorDescriptor[] = []
    for (const plan of writes) {
      const existed = definitions.has(plan.key)
      applyWrite(plan)
      if (plan.metadata) (existed ? updated : added).push(plan.metadata)
      else described.push(plan.descriptor)
    }

    const nextRevision = revision.peek() + 1
    batch(() => {
      revision.set(nextRevision)
      commitSignal.set(
        Object.freeze({ revision: nextRevision, added, updated, removed: [], described }),
      )
    })
    return { committed, failures: currentFailures }
  }

  function resolveKey(nameOrDisplayName: string): string | undefined {
    const normalized = normalizeIndicatorId(nameOrDisplayName)
    const key = identityIndex.get(normalized) ?? normalized
    return descriptors.has(key) || definitions.has(key) ? key : undefined
  }

  function readCatalogDescriptors(): readonly IndicatorDescriptor[] {
    revision()
    return [...descriptors.values()].map((entry) => entry.descriptor)
  }

  function loadEntry(key: string): Promise<void> {
    if (definitions.has(key)) return Promise.resolve()
    const pending = pendingLoads.get(key)
    if (pending) return pending
    const entry = descriptors.get(key)
    if (!entry) {
      return Promise.reject(
        new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `指标目录项不存在：${key}`),
      )
    }
    if (!entry.load) return Promise.resolve()
    const task = entry
      .load()
      .then((definitionClass) => {
        if (definitions.has(key)) return
        registry.register([
          {
            kind: 'definition',
            candidate: { key, origin: entry.origin, identity: 'native' },
            definition: definitionClass,
          },
        ])
      })
      .catch((error: unknown) => {
        console.error(`[Indicator] 懒加载实现失败：${entry.descriptor.displayName}（${key}）`, error)
        throw error
      })
      .finally(() => pendingLoads.delete(key))
    pendingLoads.set(key, task)
    return task
  }

  const registry: DefinitionRegistry = {
    revision,
    commits: commitSignal,
    failures,

    register(items) {
      if (disposed) throw new Error('Definition registry is disposed')
      const { plans, failures: currentFailures } = planItems(items)
      if (plans.length === 0) return { committed: [], failures: currentFailures }
      return commitPlans(plans, currentFailures)
    },

    unregister(id) {
      if (disposed) throw new Error('Definition registry is disposed')
      const key = resolveKey(id)
      if (key === undefined) {
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `脚本指标不存在：${id}`)
      }
      const metadata = definitions.get(key)
      if (!metadata?.document || metadata.source !== 'script') {
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `脚本指标不存在：${id}`)
      }
      if (metadata.document.identity === 'builtin') {
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '内置脚本只读，不能删除')
      }
      definitions.delete(key)
      descriptors.delete(key)
      for (const name of identityKeys(metadata)) {
        identityIndex.delete(normalizeIndicatorId(name))
      }
      const nextRevision = revision.peek() + 1
      batch(() => {
        revision.set(nextRevision)
        commitSignal.set(
          Object.freeze({
            revision: nextRevision,
            added: [],
            updated: [],
            removed: [metadata],
            described: [],
          }),
        )
      })
    },

    setFailures(list) {
      failures.set(Object.freeze([...list]))
    },

    readDescriptors: readCatalogDescriptors,
    readIndicatorDescriptors() {
      return readCatalogDescriptors().filter((descriptor) => descriptor.kind === 'indicator')
    },
    readAlertDescriptors() {
      return readCatalogDescriptors().filter((descriptor) => descriptor.kind === 'alert')
    },
    readDefinitions() {
      revision()
      return [...definitions.values()]
    },

    getDescriptor(nameOrDisplayName) {
      revision()
      const key = resolveKey(nameOrDisplayName)
      return key === undefined ? undefined : descriptors.get(key)?.descriptor
    },
    getDefinition(name) {
      revision()
      const key = resolveKey(name)
      return key === undefined ? undefined : definitions.get(key)
    },
    isLoaded(nameOrDisplayName) {
      return registry.getDefinition(nameOrDisplayName) !== undefined
    },
    isAlert(nameOrDisplayName) {
      return registry.getDescriptor(nameOrDisplayName)?.kind === 'alert'
    },

    load(names) {
      const keys = new Set<string>()
      for (const id of names) {
        const key = resolveKey(id)
        if (key !== undefined) keys.add(key)
      }
      return Promise.all([...keys].map(loadEntry)).then(() => undefined)
    },
    loadAll() {
      return registry.load(descriptors.keys())
    },

    resolveCanonicalId(descriptor) {
      return descriptor.source === 'script' ? descriptor.name : descriptor.displayName
    },
    resolveDefinitionId(nameOrDisplayName) {
      const descriptor = registry.getDescriptor(nameOrDisplayName)
      return descriptor === undefined ? undefined : registry.resolveCanonicalId(descriptor)
    },

    dispose() {
      if (disposed) return
      disposed = true
      definitions.clear()
      descriptors.clear()
      identityIndex.clear()
      pendingLoads.clear()
      failures.set(Object.freeze([]))
      commitSignal.set(null)
      revision.set(revision.peek() + 1)
    },

    clear() {
      if (disposed) return
      definitions.clear()
      descriptors.clear()
      identityIndex.clear()
      pendingLoads.clear()
      failures.set(Object.freeze([]))
      commitSignal.set(null)
      revision.set(revision.peek() + 1)
    },
  }

  return registry
}
