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
      <div class="composer__meta">
        <label v-if="provider.reasoningEfforts?.length" class="composer__reasoning">
          <span>{{ text.reasoning }}</span>
          <select
            :value="provider.reasoningEffort ?? provider.reasoningEfforts[0]"
            :disabled="running"
            @change="$emit('reasoning-effort', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="effort in provider.reasoningEfforts" :key="effort" :value="effort">
              {{ effort }}
            </option>
          </select>
        </label>
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
      </div>
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
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'
  import type { AgentUsageView, ProviderStatusView } from '../agent-contracts'

  import IconArrowUp from '~icons/tabler/arrow-up'
  import IconPlayerStopFilled from '~icons/tabler/player-stop-filled'

  const props = defineProps<{
    draft: string
    running: boolean
    locale: AgentLocale
    provider: ProviderStatusView
    usage?: AgentUsageView
  }>()
  const emit = defineEmits<{
    'update:draft': [value: string]
    send: []
    stop: []
    'reasoning-effort': [value: string]
  }>()

  const text = computed(() => getAgentCopy(props.locale))
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
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .composer__textarea::placeholder {
    color: var(--agent-text-soft);
  }

  .composer__textarea:focus {
    outline: none;
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
    position: absolute;
    right: 40px;
    bottom: 8px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .composer__reasoning {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--agent-muted);
    font-size: 11px;
  }
  .composer__reasoning select {
    max-width: 88px;
    padding: 2px 4px;
    border: 1px solid var(--agent-border-strong);
    border-radius: 4px;
    color: var(--agent-text);
    background: var(--agent-input);
    font: inherit;
  }

  .composer__primary {
    width: 24px;
    height: 24px;
    position: absolute;
    right: 8px;
    bottom: 8px;
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
