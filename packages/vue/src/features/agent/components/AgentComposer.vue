<template>
  <div class="composer">
    <div class="composer__input">
      <textarea
        class="composer__textarea"
        :value="draft"
        rows="3"
        :placeholder="text.composerPlaceholder"
        :aria-label="text.composerPlaceholder"
        @input="$emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
        @keydown="onKeydown"
      ></textarea>
      <div class="composer__footer">
        <div class="composer__meta">
          <Dropdown
            class="composer__model"
            searchable
            allow-empty
            size="sm"
            :model-value="provider.modelId"
            :options="modelOptions"
            :placeholder="modelsLoading ? text.loadingModels : text.modelPlaceholder"
            :title="text.model"
            :disabled="running || !provider.configured"
            @open="$emit('models-open')"
            @update:model-value="$emit('model', $event)"
          />
          <Dropdown
            v-if="provider.reasoningEfforts?.length"
            class="composer__reasoning"
            allow-empty
            size="sm"
            :model-value="provider.reasoningEffort"
            :options="reasoningOptions"
            :placeholder="text.reasoning"
            :title="text.reasoning"
            :disabled="running"
            @update:model-value="$emit('reasoning-effort', $event)"
          />
        </div>
        <span
          v-if="contextUsage"
          class="composer__notice"
          :aria-label="contextUsage.accessibleLabel"
        >
          <span>{{ contextUsage.label }}</span>
          <span
            class="composer__usage-ring"
            :style="{ '--usage-progress': `${contextUsage.percent * 3.6}deg` }"
            aria-hidden="true"
          ></span>
        </span>
        <span v-else-if="running" class="composer__notice">{{ text.steeringDisabled }}</span>
        <button
          v-if="running"
          type="button"
          class="composer__primary composer__primary--stop"
          :title="text.stop"
          :aria-label="text.stop"
          @click="$emit('stop')"
        >
          <span class="composer__primary-background" aria-hidden="true"></span>
          <IconPlayerStopFilled aria-hidden="true" />
        </button>
        <button
          v-else
          type="button"
          class="composer__primary"
          :disabled="!draft.trim()"
          :title="text.send"
          :aria-label="text.send"
          @click="$emit('send')"
        >
          <span class="composer__primary-background" aria-hidden="true"></span>
          <IconArrowUp aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import Dropdown from '../../../components/Dropdown.vue'
  import { getAgentCopy, type AgentLocale } from '../agent-copy'
  import type { AgentUsageView, ProviderModelView, ProviderStatusView } from '../agent-contracts'

  import IconArrowUp from '~icons/tabler/arrow-up'
  import IconPlayerStopFilled from '~icons/tabler/player-stop-filled'

  const props = defineProps<{
    draft: string
    running: boolean
    locale: AgentLocale
    provider: ProviderStatusView
    models: readonly ProviderModelView[]
    modelsLoading: boolean
    usage?: AgentUsageView
  }>()
  const emit = defineEmits<{
    'update:draft': [value: string]
    send: []
    stop: []
    model: [value: string]
    'models-open': []
    'reasoning-effort': [value: string]
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  const modelOptions = computed(() =>
    props.models.map((model) => ({ value: model.id, label: model.name })),
  )
  const reasoningOptions = computed(() =>
    (props.provider.reasoningEfforts ?? []).map((effort) => ({ value: effort, label: effort })),
  )
  const contextUsage = computed(() => {
    const used = props.usage?.contextTokens
    const window = props.usage?.contextWindow ?? props.provider.contextWindow
    if (used === undefined || !window) return null
    const percent = Math.min(100, Math.max(0, Math.round((used / window) * 100)))
    const label = `${used.toLocaleString()} / ${window.toLocaleString()} tokens (${percent}%)`
    return {
      percent,
      label,
      accessibleLabel: label,
    }
  })

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    if (!props.running && props.draft.trim()) emit('send')
  }
</script>

<style scoped>
  .composer {
    display: grid;
    gap: 7px;
    padding: 10px 12px 12px;
    border-top: 1px solid var(--agent-border);
    background: var(--agent-surface);
  }

  .composer__input {
    position: relative;
  }

  .composer__textarea {
    width: 100%;
    display: block;
    min-height: 72px;
    max-height: 152px;
    resize: none;
    box-sizing: border-box;
    padding: 11px 42px 31px 12px;
    border: 1px solid var(--agent-border);
    border-radius: 12px;
    color: var(--agent-text);
    background: var(--agent-input);
    font: inherit;
    font-size: 13px;
    line-height: 1.5;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .composer__textarea::placeholder {
    color: var(--agent-text-soft);
  }

  .composer__textarea:focus {
    outline: none;
  }

  .composer__footer {
    position: absolute;
    right: 8px;
    bottom: 8px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .composer__notice {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--agent-muted);
    font-size: 11px;
    line-height: 1.3;
  }

  .composer__usage-ring {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    position: relative;
    border-radius: 50%;
    background: conic-gradient(
      var(--agent-accent) var(--usage-progress),
      var(--agent-border-strong) 0
    );
  }

  .composer__usage-ring::before {
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    background: var(--agent-surface);
    content: '';
  }

  .composer__meta {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .composer__model,
  .composer__reasoning {
    min-width: 0;
    --dropdown-trigger-background: var(--agent-hover);
    --dropdown-trigger-color: var(--agent-text);
    --dropdown-trigger-chevron: var(--agent-muted);
    --dropdown-trigger-active-border: var(--agent-border-strong);
    --dropdown-trigger-active-background: var(--agent-input);
    --dropdown-trigger-focus-border: var(--agent-accent);
    --dropdown-trigger-focus-background: var(--agent-input);
    --dropdown-trigger-focus-shadow: 0 0 0 2px
      color-mix(in srgb, var(--agent-accent) 24%, transparent);
  }

  .composer__model :deep(.dropdown__trigger),
  .composer__reasoning :deep(.dropdown__trigger) {
    max-width: 160px;
    height: 26px;
    gap: 5px;
    padding: 0 9px;
  }

  .composer__model :deep(.dropdown__value),
  .composer__reasoning :deep(.dropdown__value) {
    min-width: 0;
    overflow: hidden;
    color: var(--agent-text);
    font-size: 11px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer__model :deep(.dropdown__trigger:disabled),
  .composer__reasoning :deep(.dropdown__trigger:disabled) {
    color: var(--agent-text-soft);
    background: transparent;
  }

  .composer__primary {
    width: 24px;
    height: 24px;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--klc-color-agent-on-accent);
    background: transparent;
    box-sizing: border-box;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .composer__primary-background {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background-color: var(--agent-accent);
    transition: background-color 0.2s ease;
  }

  .composer__primary > svg {
    z-index: 1;
    width: 14px;
    height: 14px;
  }

  .composer__primary:hover:not(:disabled) {
    background: transparent;
  }

  .composer__primary:hover:not(:disabled) .composer__primary-background {
    background-color: var(--agent-accent-strong);
  }

  .composer__primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .composer__primary--stop .composer__primary-background {
    background-color: var(--klc-color-agent-danger);
  }

  .composer__primary--stop:hover:not(:disabled) .composer__primary-background {
    background-color: var(--klc-color-agent-danger);
  }
</style>
