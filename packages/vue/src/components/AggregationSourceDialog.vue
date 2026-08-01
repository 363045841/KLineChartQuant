<template>
  <BaseModal
    :show="show"
    title="聚合源管理"
    subtitle="启用搜索源，并配置地址与端口"
    width="min(92vw, 480px)"
    body-padding="8px"
    :z-index="zIndex"
    transition-variant="compact"
    @close="emit('close')"
  >
    <div class="source-list">
      <div
        v-for="source in orderedSources"
        :key="source.name"
        class="source-item"
        :class="{ 'is-disabled': !supportsSearch(source) && !isConfigurable(source) }"
      >
        <div class="source-item__main">
          <span class="source-item__content">
            <span class="source-item__heading">
              <span class="source-item__name">{{ source.displayName }}</span>
              <span class="source-item__id">{{ source.name }}</span>
            </span>
            <span class="source-item__description">
              {{ sourceDescription(source) }}
            </span>
          </span>
          <span
            v-if="supportsSearch(source)"
            class="source-status"
            :class="`is-${sourceStatuses[source.name] ?? 'checking'}`"
          >
            <span class="source-status__dot" aria-hidden="true" />
            {{ statusText(sourceStatuses[source.name] ?? 'checking') }}
          </span>
          <!-- 仅支持搜索的源可参与聚合开关；无 search 的网络源只改地址 -->
          <ToggleSwitch
            v-if="supportsSearch(source)"
            :model-value="enabledNames.has(source.name)"
            :aria-label="`${source.displayName} 聚合搜索`"
            @update:model-value="emit('toggle', source.name, $event)"
          />
        </div>

        <!-- 地址/端口默认折叠，样式与图表设置 CollapsibleSection 共用 -->
        <CollapsibleSection
          v-if="isConfigurable(source)"
          label="地址与端口"
          :expanded="Boolean(expandedEndpoints[source.name])"
          @toggle="toggleEndpoint(source.name)"
        >
          <div class="source-endpoint" @click.stop>
            <label class="source-endpoint__field">
              <span class="source-endpoint__label">地址</span>
              <input
                class="source-endpoint__input"
                type="text"
                :value="endpoints[source.name]?.host ?? ''"
                :placeholder="defaultHost(source)"
                autocomplete="off"
                spellcheck="false"
                :aria-label="`${source.displayName} 地址`"
                @input="onHostInput(source.name, $event)"
              />
            </label>
            <label class="source-endpoint__field source-endpoint__field--port">
              <span class="source-endpoint__label">端口</span>
              <input
                class="source-endpoint__input"
                type="text"
                inputmode="numeric"
                :value="endpoints[source.name]?.port ?? ''"
                :placeholder="defaultPort(source)"
                autocomplete="off"
                spellcheck="false"
                :aria-label="`${source.displayName} 端口`"
                @input="onPortInput(source.name, $event)"
              />
            </label>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
  import {
    parseFetcherEndpoint,
    type DataFetcherDefinition,
  } from '@363045841yyt/klinechart-core/controllers'
  import { computed, onBeforeUnmount, ref, watch } from 'vue'

  import {
    probeAggregationSource,
    isMockSourceName,
    type AggregationSourceEndpoint,
    type AggregationSourceStatus,
  } from '../composables/useAggregationSources'

  import BaseModal from './BaseModal.vue'
  import CollapsibleSection from './common/CollapsibleSection.vue'
  import ToggleSwitch from './common/ToggleSwitch.vue'

  const props = withDefaults(
    defineProps<{
      show: boolean
      sources: ReadonlyArray<DataFetcherDefinition>
      enabledNames: ReadonlySet<string>
      /** source name -> host/port 草稿 */
      endpoints: Record<string, AggregationSourceEndpoint>
      /** 嵌套在图表设置内时抬高层级 */
      zIndex?: number
    }>(),
    {
      zIndex: 1000,
    },
  )

  const emit = defineEmits<{
    close: []
    toggle: [name: string, enabled: boolean]
    /** 地址或端口变更 */
    updateEndpoint: [name: string, patch: Partial<AggregationSourceEndpoint>]
  }>()

  const sourceStatuses = ref<Record<string, AggregationSourceStatus>>({})
  /** 每个源的地址区块展开状态；默认全部收起 */
  const expandedEndpoints = ref<Record<string, boolean>>({})
  let probeController: AbortController | undefined
  let probeRequestId = 0

  /** mock 源沉底，网络源排在前面 */
  const orderedSources = computed(() => {
    const list = [...props.sources]
    return list.sort((a, b) => Number(isMockSource(a)) - Number(isMockSource(b)))
  })

  function isMockSource(source: DataFetcherDefinition): boolean {
    return isMockSourceName(source.name)
  }

  function supportsSearch(source: DataFetcherDefinition): boolean {
    return source.capabilities?.includes('search') === true && typeof source.searcher === 'function'
  }

  /** 是否可在面板里改地址/端口 */
  function isConfigurable(source: DataFetcherDefinition): boolean {
    return Boolean(source.defaultBaseUrl)
  }

  function sourceDescription(source: DataFetcherDefinition): string {
    if (supportsSearch(source)) return source.description || '可用于聚合搜索'
    if (isConfigurable(source)) return source.description || '可配置地址'
    return '不支持搜索'
  }

  function statusText(status: AggregationSourceStatus): string {
    if (status === 'online') return '在线'
    if (status === 'offline') return '离线'
    return '检测中'
  }

  function defaultHost(source: DataFetcherDefinition): string {
    return source.defaultBaseUrl ? parseFetcherEndpoint(source.defaultBaseUrl).host : ''
  }

  function defaultPort(source: DataFetcherDefinition): string {
    return source.defaultBaseUrl ? parseFetcherEndpoint(source.defaultBaseUrl).port : ''
  }

  function toggleEndpoint(name: string) {
    expandedEndpoints.value = {
      ...expandedEndpoints.value,
      [name]: !expandedEndpoints.value[name],
    }
  }

  function onHostInput(name: string, event: Event) {
    emit('updateEndpoint', name, { host: (event.target as HTMLInputElement).value })
  }

  function onPortInput(name: string, event: Event) {
    emit('updateEndpoint', name, { port: (event.target as HTMLInputElement).value })
  }

  /** 弹窗打开时对可搜索源并发拨测；关闭时取消 */
  async function probeSources() {
    probeController?.abort()
    const controller = new AbortController()
    probeController = controller
    const requestId = ++probeRequestId
    const searchableSources = props.sources.filter(supportsSearch)
    sourceStatuses.value = Object.fromEntries(
      searchableSources.map((source) => [source.name, 'checking' as const]),
    )
    const timeout = setTimeout(() => controller.abort(), 5000)

    await Promise.all(
      searchableSources.map(async (source) => {
        const status = await probeAggregationSource(source, controller.signal)
        if (requestId !== probeRequestId) return
        sourceStatuses.value = { ...sourceStatuses.value, [source.name]: status }
      }),
    )
    clearTimeout(timeout)
    if (requestId === probeRequestId) probeController = undefined
  }

  watch(
    () => props.show,
    (show) => {
      if (show) {
        // 每次打开重置为默认收起，与图表设置一致
        expandedEndpoints.value = {}
        void probeSources()
      } else {
        probeRequestId++
        probeController?.abort()
        probeController = undefined
      }
    },
    { immediate: true },
  )

  // 地址变更后防抖拨测，避免每敲一个字符就打一次网络
  let endpointProbeTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => props.endpoints,
    () => {
      if (!props.show) return
      if (endpointProbeTimer !== undefined) clearTimeout(endpointProbeTimer)
      endpointProbeTimer = setTimeout(() => {
        endpointProbeTimer = undefined
        void probeSources()
      }, 400)
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    probeRequestId++
    probeController?.abort()
    if (endpointProbeTimer !== undefined) clearTimeout(endpointProbeTimer)
  })
</script>

<style scoped>
  .source-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .source-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
    border-radius: 6px;
  }

  .source-item.is-disabled {
    opacity: 0.55;
  }

  .source-item__main {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 12px;
    border-radius: 6px;
  }

  .source-item__main:hover {
    background: var(--klc-color-tag-bg-hover);
  }

  .source-item__content {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .source-item__heading {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .source-item__name {
    color: var(--klc-color-foreground);
    font-size: 13px;
    font-weight: 600;
  }

  .source-item__id,
  .source-item__description {
    color: var(--klc-color-axis-text);
    font-size: 11px;
  }

  .source-item__id {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-status {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--klc-color-axis-text);
    font-size: 11px;
    white-space: nowrap;
  }

  .source-status__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .source-status.is-online {
    color: var(--klc-color-success, #16865c);
  }

  .source-status.is-offline {
    color: var(--klc-color-danger, #d64545);
  }

  .source-endpoint {
    display: flex;
    gap: 8px;
    padding: 0 12px 10px;
  }

  .source-endpoint__field {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .source-endpoint__field--port {
    flex: 0 0 88px;
  }

  .source-endpoint__label {
    color: var(--klc-color-axis-text);
    font-size: 11px;
  }

  .source-endpoint__input {
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 6px;
    background: var(--klc-color-background);
    color: var(--klc-color-foreground);
    font: inherit;
    font-size: 12px;
    outline: none;
  }

  .source-endpoint__input:focus {
    border-color: var(--klc-color-axis-text);
  }

  .source-endpoint__input::placeholder {
    color: var(--klc-color-axis-text);
    opacity: 0.55;
  }
</style>
