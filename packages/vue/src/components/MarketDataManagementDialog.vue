<!--
  行情数据源管理：按连接分组展示 Provider，地址是连接级配置，使用策略是 Provider 级配置。
  与商品选择 / 指标选择共用同一套模态外壳、搜索栏与列表条目视觉。
-->
<template>
  <BaseModal
    :open="show"
    title="行情数据源"
    width="min(600px, calc(100vw - 32px))"
    max-height="min(620px, 80dvh)"
    overlay-padding="var(--klc-space-16, 16px)"
    body-padding="0"
    @update:open="!$event && emit('close')"
  >
    <template #tabs>
      <div class="source-toolbar">
        <SearchField
          v-model="searchQuery"
          placeholder="搜索数据源..."
          aria-label="搜索数据源"
          variant="flush"
          autofocus
        />
        <BaseTooltip content="重新检测" placement="bottom" trigger-display="contents">
          <button
            type="button"
            class="source-toolbar__action"
            :class="{ 'is-busy': refreshing }"
            :disabled="refreshing"
            aria-label="刷新数据源状态"
            @click="refreshAll"
          >
            <IconTablerRefresh aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
    </template>

    <div class="source-body">
      <div class="source-list">
          <p v-if="groups.length === 0" class="source-empty" role="status">
            暂无可用数据源，请连接一个行情源。
          </p>
          <div v-else-if="filteredGroups.length === 0" class="source-empty" role="status">
            <IconTablerSearch class="source-empty__icon" aria-hidden="true" />
            <span>未找到匹配的数据源</span>
          </div>

          <section
            v-for="group in filteredGroups"
            :key="group.connection.id"
            class="source-group"
          >
            <header class="source-group__header">
              <span class="source-group__title">{{ group.title }}</span>
              <span v-if="group.shared" class="source-group__tag">共用连接</span>
            </header>

            <!-- 地址是连接级配置：一个连接只出现一个编辑入口 -->
            <div v-if="group.editable" class="source-endpoint">
              <IconTablerLink class="source-endpoint__icon" aria-hidden="true" />
              <input
                class="source-endpoint__input"
                type="url"
                :value="drafts[group.connection.id]"
                :placeholder="group.connection.defaultBaseUrl"
                autocomplete="off"
                spellcheck="false"
                :aria-label="`${group.title} 连接地址`"
                @input="onDraftInput(group.connection.id, $event)"
              />
              <BaseButton
                v-if="dirtyConnections.has(group.connection.id)"
                size="sm"
                variant="primary"
                @click="apply(group.connection.id)"
              >
                应用
              </BaseButton>
            </div>
            <div
              v-else-if="group.connection.defaultBaseUrl"
              class="source-endpoint source-endpoint--readonly"
            >
              <IconTablerLink class="source-endpoint__icon" aria-hidden="true" />
              <code class="source-endpoint__value">
                {{ group.connection.baseUrl ?? group.connection.defaultBaseUrl }}
              </code>
              <span class="source-group__tag">宿主托管</span>
            </div>
            <p v-if="errors[group.connection.id]" class="source-endpoint__error" role="alert">
              {{ errors[group.connection.id] }}
            </p>

            <ul class="source-providers">
              <li
                v-for="provider in group.providers"
                :key="provider.id"
                class="provider-row"
              >
                <div class="provider-row__identity">
                  <span class="provider-row__name">{{ provider.name }}</span>
                  <span class="provider-row__meta">
                    <span class="provider-status" :class="`is-${provider.status.tone}`">
                      <span class="provider-status__dot" aria-hidden="true" />
                      {{ provider.status.label }}
                    </span>
                    <span v-for="badge in provider.badges" :key="badge" class="type-badge">
                      {{ badge }}
                    </span>
                  </span>
                </div>

                <div class="provider-row__controls">
                  <ToggleSwitch
                    size="compact"
                    :model-value="provider.enabled"
                    :aria-label="`${provider.name} 启用`"
                    @update:model-value="setEnabled(provider.id, $event)"
                  />
                </div>
              </li>
            </ul>
          </section>
        </div>

      <div v-if="slots['source-management']" class="source-host">
        <slot name="source-management" />
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
  import { ref, useSlots, watch } from 'vue'
  import IconTablerLink from '~icons/tabler/link'
  import IconTablerRefresh from '~icons/tabler/refresh'
  import IconTablerSearch from '~icons/tabler/search'
  import { useMarketDataManagement } from '../composables/useMarketDataManagement.js'
  import BaseButton from './BaseButton.vue'
  import BaseModal from './BaseModal.vue'
  import BaseTooltip from './common/BaseTooltip.vue'
  import SearchField from './common/SearchField.vue'
  import ToggleSwitch from './common/ToggleSwitch.vue'

  const props = defineProps<{ show: boolean }>()
  const emit = defineEmits<{ close: [] }>()
  const slots = useSlots()

  const {
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
  } = useMarketDataManagement()

  const refreshing = ref(false)

  /** 每次打开重建草稿，并强制刷新全部状态。 */
  async function refreshAll(): Promise<void> {
    refreshing.value = true
    try {
      await refresh()
    } finally {
      refreshing.value = false
    }
  }

  function onDraftInput(id: string, event: Event): void {
    setDraft(id, (event.target as HTMLInputElement).value)
  }

  watch(
    () => props.show,
    (show) => {
      if (!show) return
      resetDrafts()
      void refreshAll()
    },
    { immediate: true },
  )
</script>

<style scoped>
  .source-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .source-toolbar__action {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin-right: var(--klc-space-12, 12px);
    padding: 0;
    border: 0;
    border-radius: var(--klc-radius-xs, 4px);
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    transition:
      background var(--klc-motion-dur-fast, 160ms) ease,
      color var(--klc-motion-dur-fast, 160ms) ease;
  }

  .source-toolbar__action:hover:not(:disabled) {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .source-toolbar__action:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .source-toolbar__action:focus-visible {
    outline: 2px solid var(--klc-color-ui-accent);
    outline-offset: 2px;
  }

  .source-toolbar__action svg {
    width: 15px;
    height: 15px;
  }

  .source-toolbar__action.is-busy svg {
    animation: source-spin 0.8s linear infinite;
  }

  @keyframes source-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── 列表：每个连接一张卡片 ── */
  .source-list {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-12, 12px);
    padding: var(--klc-space-12, 12px);
  }

  .source-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--klc-space-8, 8px);
    padding: var(--klc-space-24, 24px) var(--klc-space-16, 16px);
    margin: 0;
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-copy-13-font-size, 13px);
    text-align: center;
  }

  .source-empty__icon {
    width: 28px;
    height: 28px;
    opacity: 0.4;
  }

  .source-group {
    overflow: hidden;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--klc-color-ui-control-background) 45%, transparent);
  }

  .source-group__header {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    padding: 12px 14px 8px;
  }

  .source-group__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--klc-color-ui-text);
    font-size: var(--klc-text-label-13-font-size, 13px);
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .source-group__tag {
    flex: 0 0 auto;
    padding: 1px 8px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 999px;
    color: var(--klc-color-ui-muted);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.6;
    white-space: nowrap;
  }

  /* ── 连接地址 ── */
  .source-endpoint {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    height: 32px;
    margin: 0 14px 10px;
    padding: 0 6px 0 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-surface);
    transition: border-color var(--klc-motion-dur-fast, 160ms) ease;
  }

  .source-endpoint:focus-within {
    border-color: var(--klc-color-ui-accent);
  }

  .source-endpoint--readonly {
    padding-right: 8px;
    background: transparent;
    border-style: dashed;
  }

  .source-endpoint__icon {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    color: var(--klc-color-ui-muted);
  }

  .source-endpoint__input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-text);
    font-family: var(--klc-typography-font-family-mono);
    font-size: 12px;
    outline: none;
  }

  .source-endpoint__input::placeholder {
    color: var(--klc-color-ui-muted);
    opacity: 0.6;
  }

  .source-endpoint__value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--klc-color-ui-muted);
    font-family: var(--klc-typography-font-family-mono);
    font-size: 12px;
  }

  .source-endpoint__error {
    margin: -4px 14px 10px;
    padding: 0;
    color: var(--klc-color-ui-danger);
    font-size: 11px;
  }

  /* ── Provider 条目 ── */
  .source-providers {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--klc-color-ui-border);
  }

  .provider-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-space-12, 12px);
    padding: 10px 14px;
    transition: background var(--klc-motion-dur-fast, 160ms) ease;
  }

  .provider-row + .provider-row {
    border-top: 1px solid color-mix(in srgb, var(--klc-color-ui-border) 60%, transparent);
  }

  .provider-row:hover {
    background: var(--klc-color-ui-hover);
  }

  .provider-row__identity {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .provider-row__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--klc-color-foreground);
    font-size: var(--klc-text-12-font-size, 12px);
    font-weight: 600;
  }

  .provider-row__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .type-badge {
    padding: 0 7px;
    border-radius: 4px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-muted);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.7;
    white-space: nowrap;
  }

  /* 状态：带底色的小胶囊，一眼区分在线 / 离线 */
  .provider-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px 0 6px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 13%, transparent);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-label-12-font-size, 12px);
    font-weight: 500;
    line-height: 1.7;
    white-space: nowrap;
  }

  .provider-status__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .provider-status.is-online {
    color: var(--klc-color-ui-success);
  }

  .provider-status.is-online .provider-status__dot {
    box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 22%, transparent);
  }

  .provider-status.is-warning {
    color: var(--klc-color-ui-warning);
  }

  .provider-status.is-offline {
    color: var(--klc-color-ui-danger);
  }

  /* ── 宿主入口 ── */
  .source-host {
    flex: 0 0 auto;
    padding: var(--klc-space-12, 12px);
    border-top: 1px solid var(--klc-color-ui-border);
  }

  @media (max-width: 520px) {
    .provider-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 10px;
    }

    .provider-row__controls {
      width: 100%;
      flex-wrap: wrap;
    }
  }
</style>

<style scoped src="./common/search-toolbar.css"></style>
<style scoped src="./common/control-cluster.css"></style>
