/** 行情管理界面的视图模型：按连接分组 Provider，并只持有连接地址草稿。 */
import type {
  MarketConnection,
  MarketDataProvider,
  MarketProviderHealth,
} from '@363045841yyt/klinechart-core/market-data'
import { coreSignalToVueRef } from '@vue-src/utils/signalBridge.js'
import { computed, ref, watch } from 'vue'
import { useMarketDataContext } from './useMarketDataContext.js'

/** Provider 行的健康状态文案与色调。 */
interface MarketProviderStatus {
  label: string
  tone: 'online' | 'warning' | 'offline' | 'checking'
}

/** 单个 Provider 的展示模型；模板只消费该结构。 */
interface MarketProviderView {
  id: string
  name: string
  description: string
  enabled: boolean
  status: MarketProviderStatus
  badges: string[]
}

/** 同一连接下的 Provider 分组；地址是连接级配置。 */
interface MarketConnectionGroup {
  connection: MarketConnection
  title: string
  shared: boolean
  editable: boolean
  providers: MarketProviderView[]
}

/** 去掉首尾空白与末尾斜杠，用于判断地址草稿是否已生效。 */
function normalizeDraft(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

/** 连接可达不等于 Provider 可用，因此按 Provider 展示各自状态。 */
function statusOf(entry: MarketProviderHealth | undefined): MarketProviderStatus {
  if (!entry || entry.status === 'checking') return { label: '检测中', tone: 'checking' }
  if (entry.status === 'degraded') return { label: '部分可用', tone: 'warning' }
  if (entry.status === 'offline') return { label: '离线', tone: 'offline' }
  const label = entry.latencyMs === undefined ? '在线' : `在线 · ${entry.latencyMs}ms`
  return { label, tone: 'online' }
}

/** 只标注影响选择的差异，避免堆砌无关能力。 */
function badgesOf(provider: MarketDataProvider): string[] {
  const badges: string[] = []
  if (provider.catalog) badges.push('搜索')
  if (provider.source.capabilities?.liveBars) badges.push('实时')
  if (provider.source.capabilities?.timeShare) badges.push('分时')
  return badges
}

/** 按连接分组 Provider，并统一控制搜索和行情获取的启用状态。 */
export function useMarketDataManagement() {
  const context = useMarketDataContext()
  const state = coreSignalToVueRef(context.registry.state)
  const health = coreSignalToVueRef(context.health.state)
  const drafts = ref<Record<string, string>>({})
  const errors = ref<Record<string, string>>({})
  const searchQuery = ref('')

  /** 完整分组模型；搜索过滤只作用在 Provider 上，不改变连接。 */
  const groups = computed<MarketConnectionGroup[]>(() =>
    [...state.value.connections.values()]
      .map((connection) => {
        const providers = [...state.value.providers.values()].filter(
          (provider) => (provider.source.connectionId ?? provider.source.id) === connection.id,
        )
        return {
          connection,
          title: providers.map((provider) => provider.source.displayName).join(' / '),
          shared: providers.length > 1,
          editable: connection.editable && connection.defaultBaseUrl !== undefined,
          providers: providers.map((provider) => {
            const policy = state.value.policies.get(provider.source.id)
            return {
              id: provider.source.id,
              name: provider.source.displayName,
              description: provider.source.description ?? '',
              enabled: policy?.enabled ?? true,
              status: statusOf(health.value[provider.source.id]),
              badges: badgesOf(provider),
            }
          }),
        }
      })
      .filter((group) => group.providers.length > 0),
  )

  // 草稿是否偏离生效地址；独立于 groups，避免 watch 与自身依赖互相触发。
  const dirtyConnections = computed<ReadonlySet<string>>(() => {
    const ids = new Set<string>()
    for (const { connection } of groups.value) {
      const current = connection.baseUrl ?? connection.defaultBaseUrl ?? ''
      if (normalizeDraft(drafts.value[connection.id] ?? '') !== normalizeDraft(current))
        ids.add(connection.id)
    }
    return ids
  })

  const filteredGroups = computed<MarketConnectionGroup[]>(() => {
    const keyword = searchQuery.value.trim().toLowerCase()
    if (!keyword) return groups.value
    return groups.value
      .map((group) => ({
        ...group,
        providers: group.providers.filter((provider) =>
          `${provider.name} ${provider.description}`.toLowerCase().includes(keyword),
        ),
      }))
      .filter((group) => group.providers.length > 0)
  })

  // 动态注册新连接时补上草稿，已有输入保持原样。
  watch(
    groups,
    (value) => {
      drafts.value = Object.fromEntries(
        value.map(({ connection }) => [
          connection.id,
          drafts.value[connection.id] ?? connection.baseUrl ?? connection.defaultBaseUrl ?? '',
        ]),
      )
    },
    { immediate: true },
  )

  /** 打开弹窗时重建草稿；未应用的输入不进入运行时。 */
  function resetDrafts(): void {
    drafts.value = Object.fromEntries(
      groups.value.map(({ connection }) => [
        connection.id,
        connection.baseUrl ?? connection.defaultBaseUrl ?? '',
      ]),
    )
    errors.value = {}
  }

  /** 地址编辑只改草稿，点“应用”才提交。 */
  function setDraft(id: string, value: string): void {
    drafts.value = { ...drafts.value, [id]: value }
  }

  /** 校验成功才提交；失败保留草稿并展示错误。 */
  function apply(id: string): void {
    try {
      context.applyConnection(id, drafts.value[id])
      errors.value = { ...errors.value, [id]: '' }
      const names = new Set(
        groups.value
          .find((group) => group.connection.id === id)
          ?.providers.map((provider) => provider.id),
      )
      void context.health.refresh({ names, force: true })
    } catch (error) {
      errors.value = {
        ...errors.value,
        [id]: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /** 一次提交搜索和行情使用策略，避免关闭后仍参与搜索。 */
  function setEnabled(id: string, enabled: boolean): void {
    context.registry.setConfig(id, { enabled, searchEnabled: enabled })
  }

  /** 强制重新检测全部 Provider。 */
  function refresh(): Promise<void> {
    return context.health.refresh({ force: true })
  }

  return {
    groups,
    filteredGroups,
    dirtyConnections,
    searchQuery,
    drafts,
    errors,
    resetDrafts,
    setDraft,
    apply,
    setEnabled,
    refresh,
  }
}
