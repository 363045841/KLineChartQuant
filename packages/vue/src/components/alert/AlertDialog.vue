<template>
  <BaseModal
    :show="show"
    title="预警"
    subtitle="价格、指标、成交量条件告警"
    width="min(92vw, 560px)"
    max-height="min(680px, calc(100vh - 48px))"
    @close="handleClose"
  >
    <template #header-extra>
      <div class="alert-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="alert-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span v-if="tab.key === 'history' && unreadCount > 0" class="alert-tab-badge">{{
            unreadCount > 99 ? '99+' : unreadCount
          }}</span>
        </button>
      </div>
    </template>

    <!-- Rules Tab -->
    <template v-if="activeTab === 'rules'">
      <div class="alert-section">
        <button v-if="!editingRule" class="alert-add-btn" @click="startAddRule">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="alert-btn-icon"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          新建规则
        </button>

        <AlertRuleForm
          v-if="editingRule !== null"
          :rule="editingRule === 'new' ? undefined : editingRule"
          @save="onRuleSave"
          @cancel="editingRule = null"
        />

        <div v-else-if="rules.length === 0" class="alert-empty">
          <div class="alert-empty-icon-wrap">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              class="alert-empty-icon"
            >
              <path d="M12 2a10 10 0 1 0 10 10M12 6v6l4 2" />
            </svg>
          </div>
          <span class="alert-empty-title">暂无预警规则</span>
          <span class="alert-empty-hint">点击「新建规则」添加一条价格或指标条件</span>
        </div>

        <div v-else class="rule-list">
          <div
            v-for="rule in rules"
            :key="rule.id"
            class="rule-item"
            :class="{ disabled: !rule.enabled }"
          >
            <div class="rule-item-header">
              <div class="rule-item-info">
                <span class="rule-item-name">{{ rule.name }}</span>
                <span class="rule-item-predicate">{{ describePredicate(rule) }}</span>
              </div>
              <div class="rule-item-actions">
                <ToggleSwitch
                  :model-value="rule.enabled"
                  :title="rule.enabled ? '禁用' : '启用'"
                  :aria-label="`${rule.name}启用状态`"
                  @update:model-value="toggleRule(rule.id, $event)"
                />
                <button class="rule-item-btn" title="编辑" @click="startEditRule(rule)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L4 16v4" />
                  </svg>
                </button>
                <button
                  class="rule-item-btn rule-item-btn--danger"
                  title="删除"
                  @click="removeRule(rule.id)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path
                      d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div v-if="rule.oneShot || rule.cooldownMs" class="rule-item-meta">
              <span v-if="rule.oneShot" class="rule-meta-tag rule-meta-tag--oneshot">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="rule-meta-icon"
                >
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                单次触发
              </span>
              <span v-if="rule.cooldownMs" class="rule-meta-tag rule-meta-tag--cooldown">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="rule-meta-icon"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                冷却 {{ formatCooldown(rule.cooldownMs) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- History Tab -->
    <template v-if="activeTab === 'history'">
      <div class="alert-section">
        <div class="alert-section-toolbar">
          <span v-if="events.length > 0" class="alert-section-count">
            共 <strong>{{ events.length }}</strong> 条记录
          </span>
          <button v-if="events.length > 0" class="alert-clear-btn" @click="clearHistory">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="alert-btn-icon"
            >
              <path
                d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
              />
            </svg>
            清空历史
          </button>
        </div>

        <div v-if="events.length === 0" class="alert-empty">
          <div class="alert-empty-icon-wrap">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              class="alert-empty-icon"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <span class="alert-empty-title">暂无告警记录</span>
          <span class="alert-empty-hint">规则触发后将显示在这里</span>
        </div>

        <div v-else class="event-list">
          <div v-for="(event, idx) in [...events].reverse()" :key="idx" class="event-item">
            <div class="event-item-header">
              <div class="event-item-left">
                <span class="event-item-dot"></span>
                <span class="event-item-name">{{ event.ruleName }}</span>
              </div>
              <time class="event-item-time">{{ formatTime(event.triggeredAt) }}</time>
            </div>
            <div v-if="event.snapshotBar" class="event-item-bar">
              <span class="event-bar-item">
                <span class="event-bar-label">O</span>
                <span>{{ formatPrice(event.snapshotBar.open) }}</span>
              </span>
              <span class="event-bar-item">
                <span class="event-bar-label">H</span>
                <span>{{ formatPrice(event.snapshotBar.high) }}</span>
              </span>
              <span class="event-bar-item">
                <span class="event-bar-label">L</span>
                <span>{{ formatPrice(event.snapshotBar.low) }}</span>
              </span>
              <span class="event-bar-item">
                <span class="event-bar-label">C</span>
                <span>{{ formatPrice(event.snapshotBar.close) }}</span>
              </span>
              <span v-if="event.snapshotBar.volume" class="event-bar-item">
                <span class="event-bar-label">V</span>
                <span>{{ formatVolume(event.snapshotBar.volume) }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import type {
    AlertEvent,
    AlertRule,
    AlertPredicate,
    ChartController,
  } from '@363045841yyt/klinechart-core'
  import { ref, watch } from 'vue'

  import { useAlerts } from '../../composables/useAlerts'
  import BaseModal from '../BaseModal.vue'
  import ToggleSwitch from '../common/ToggleSwitch.vue'

  import AlertRuleForm from './AlertRuleForm.vue'

  const props = defineProps<{
    show: boolean
    chartController: ChartController | null
  }>()

  const emit = defineEmits<{
    close: []
  }>()

  const tabs = [
    { key: 'rules' as const, label: '规则' },
    { key: 'history' as const, label: '历史' },
  ]
  const activeTab = ref<'rules' | 'history'>('rules')

  const {
    rules,
    events,
    unreadCount,
    resetUnread,
    addRule,
    removeRule,
    setRuleEnabled,
    updateRule,
    clearEvents,
  } = useAlerts(() => props.chartController)

  const editingRule = ref<AlertRule | 'new' | null>(null)

  watch(
    () => props.show,
    (open) => {
      if (open) {
        resetUnread()
        activeTab.value = 'rules'
      } else {
        editingRule.value = null
      }
    },
  )

  function handleClose() {
    editingRule.value = null
    emit('close')
  }

  function startAddRule() {
    editingRule.value = 'new'
  }

  function startEditRule(rule: AlertRule) {
    editingRule.value = rule
  }

  function onRuleSave(rule: AlertRule) {
    if (editingRule.value === 'new') {
      addRule(rule)
    } else if (editingRule.value && typeof editingRule.value !== 'string') {
      const { id, ...patch } = rule
      updateRule(editingRule.value.id, patch)
    }
    editingRule.value = null
  }

  function toggleRule(id: string, enabled: boolean) {
    setRuleEnabled(id, enabled)
  }

  function clearHistory() {
    clearEvents()
  }

  function describePredicate(rule: AlertRule): string {
    const p = rule.predicate
    switch (p.kind) {
      case 'price-cross':
        return `价格${directionLabel(p.direction)} ${p.price}`
      case 'price-in-range':
        return `价格在 ${p.min} ~ ${p.max} 之间`
      case 'price-out-of-range':
        return `价格超出 ${p.min} ~ ${p.max}`
      case 'indicator-cross':
        return `${p.indicatorId} ${directionLabel(p.direction)} ${p.threshold}`
      case 'indicator-cross-indicator':
        return `${p.aId} ${pairDirectionLabel(p.direction)} ${p.bId}`
      case 'volume-spike':
        return `成交量 ≥ ${p.multipleOfAvg}× ${p.lookbackBars}日均值`
      default:
        return `条件类型: ${(p as AlertPredicate).kind}`
    }
  }

  function directionLabel(d: string): string {
    switch (d) {
      case 'up':
        return '上穿'
      case 'down':
        return '下穿'
      default:
        return '穿越'
    }
  }

  function pairDirectionLabel(d: string): string {
    switch (d) {
      case 'a-above-b':
        return '上穿'
      case 'a-below-b':
        return '下穿'
      default:
        return '交叉'
    }
  }

  function formatCooldown(ms: number): string {
    if (ms >= 60000) return `${Math.round(ms / 60000)}分钟`
    if (ms >= 1000) return `${Math.round(ms / 1000)}秒`
    return `${ms}ms`
  }

  function formatTime(ts: number): string {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getHours()}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  function formatPrice(v: number): string {
    return v.toFixed(2)
  }

  function formatVolume(v: number): string {
    if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
    if (v >= 1e4) return `${(v / 1e4).toFixed(1)}万`
    return v.toFixed(0)
  }
</script>

<style scoped>
  /* ══════════════════════════════════════════
   Tabs
══════════════════════════════════════════ */
  .alert-tabs {
    display: flex;
    gap: 4px;
  }

  .alert-tab {
    position: relative;
    padding: 5px 14px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--klc-color-axis-text);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .alert-tab:hover:not(.active) {
    background: var(--klc-color-tag-bg-hover);
    color: var(--klc-color-foreground);
    border-color: var(--klc-color-border-button);
  }

  .alert-tab.active {
    background: var(--klc-color-foreground);
    color: var(--klc-color-background);
    border-color: var(--klc-color-foreground);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  }

  .alert-tab-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    background: #ef4444;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    line-height: 15px;
    text-align: center;
    border-radius: 999px;
    box-shadow: 0 0 0 2px var(--klc-color-background);
    pointer-events: none;
  }

  /* ══════════════════════════════════════════
   Section Shell
══════════════════════════════════════════ */
  .alert-section {
    padding: 2px 0 4px;
  }

  .alert-section-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    min-height: 28px;
  }

  .alert-section-count {
    font-size: 12px;
    color: var(--klc-color-axis-text);
  }

  .alert-section-count strong {
    font-weight: 600;
    color: var(--klc-color-foreground);
  }

  /* ══════════════════════════════════════════
   Add / Clear Buttons
══════════════════════════════════════════ */
  .alert-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 9px 14px;
    border: 1.5px dashed var(--klc-color-border-button);
    border-radius: 8px;
    background: transparent;
    color: var(--klc-color-axis-text);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
    margin-bottom: 10px;
  }

  .alert-add-btn:hover {
    border-color: var(--klc-color-foreground);
    color: var(--klc-color-foreground);
    background: var(--klc-color-tag-bg-hover);
  }

  .alert-add-btn:active {
    opacity: 0.75;
  }

  .alert-clear-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 5px;
    background: transparent;
    color: var(--klc-color-axis-text);
    font-size: 12px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s;
  }

  .alert-clear-btn:hover {
    border-color: #dc2626;
    color: #dc2626;
    background: rgba(220, 38, 38, 0.06);
  }

  .alert-btn-icon {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }

  /* ══════════════════════════════════════════
   Empty State
══════════════════════════════════════════ */
  .alert-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 0 36px;
    color: var(--klc-color-axis-text);
  }

  .alert-empty-icon-wrap {
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    background: var(--klc-color-tag-bg-hover);
    margin-bottom: 4px;
  }

  .alert-empty-icon {
    width: 26px;
    height: 26px;
    opacity: 0.45;
  }

  .alert-empty-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--klc-color-foreground);
    opacity: 0.7;
  }

  .alert-empty-hint {
    font-size: 11px;
    color: var(--klc-color-axis-text);
    opacity: 0.55;
  }

  /* ══════════════════════════════════════════
   Rule List
══════════════════════════════════════════ */
  .rule-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rule-item {
    padding: 10px 12px 8px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 8px;
    background: var(--klc-color-background);
    transition:
      opacity 0.2s,
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .rule-item:hover {
    border-color: var(--klc-color-axis-line);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .rule-item.disabled {
    opacity: 0.45;
  }

  .rule-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .rule-item-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .rule-item-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--klc-color-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rule-item-predicate {
    font-size: 11px;
    color: var(--klc-color-axis-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Actions ── */
  .rule-item-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .rule-item-btn {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--klc-color-axis-text);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s;
  }

  .rule-item-btn svg {
    width: 13px;
    height: 13px;
  }

  .rule-item-btn:hover {
    background: var(--klc-color-tag-bg-hover);
    color: var(--klc-color-foreground);
    border-color: var(--klc-color-border-button);
  }

  .rule-item-btn--danger:hover {
    color: #dc2626;
    border-color: rgba(220, 38, 38, 0.4);
    background: rgba(220, 38, 38, 0.06);
  }

  /* ── Meta Tags ── */
  .rule-item-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 7px;
  }

  .rule-meta-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  .rule-meta-tag--oneshot {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #d97706;
  }

  .rule-meta-tag--cooldown {
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.25);
    color: #3b82f6;
  }

  .rule-meta-icon {
    width: 10px;
    height: 10px;
  }

  /* ══════════════════════════════════════════
   Event List
══════════════════════════════════════════ */
  .event-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .event-item {
    padding: 9px 12px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 8px;
    background: var(--klc-color-background);
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .event-item:hover {
    border-color: var(--klc-color-axis-line);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
  }

  .event-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .event-item-left {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .event-item-dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f59e0b;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
  }

  .event-item-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--klc-color-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .event-item-time {
    font-size: 11px;
    color: var(--klc-color-axis-text);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    opacity: 0.75;
  }

  /* ── Snapshot Bar ── */
  .event-item-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 7px;
    padding-top: 7px;
    border-top: 1px solid var(--klc-color-border-button);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .event-bar-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
    color: var(--klc-color-foreground);
  }

  .event-bar-label {
    font-weight: 600;
    font-size: 10px;
    color: var(--klc-color-axis-text);
    opacity: 0.7;
    letter-spacing: 0.02em;
  }
</style>
