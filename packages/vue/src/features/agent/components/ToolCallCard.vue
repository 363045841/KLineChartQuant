<template>
  <article class="tool-card" :data-status="tool.status">
    <header class="tool-card__header">
      <span class="tool-card__icon" aria-hidden="true">
        <component :is="statusIcon" />
      </span>
      <div class="tool-card__title">
        <strong>{{ tool.label }}</strong>
        <span>{{ statusLabel }}</span>
      </div>
      <span class="tool-card__safety">{{ safetyLabel }}</span>
    </header>

    <dl class="tool-card__details">
      <div>
        <dt>{{ text.input }}</dt>
        <dd>{{ tool.inputSummary }}</dd>
      </div>
      <div v-if="tool.resultSummary">
        <dt>{{ text.result }}</dt>
        <dd>{{ tool.resultSummary }}</dd>
      </div>
    </dl>

    <div v-if="tool.progress" class="tool-card__progress">
      <span>{{ tool.progress.label }}</span>
      <progress
        v-if="tool.progress.total"
        :max="tool.progress.total"
        :value="tool.progress.current ?? 0"
      ></progress>
    </div>

    <div v-if="tool.evidence" class="tool-card__evidence">
      <strong>{{ text.evidence }}</strong>
      <span v-if="tool.evidence.symbol">{{ tool.evidence.symbol }}</span>
      <span v-if="tool.evidence.period">{{ tool.evidence.period }}</span>
      <span v-if="tool.evidence.range">{{ tool.evidence.range }}</span>
      <span v-if="tool.evidence.source">{{ tool.evidence.source }}</span>
      <span v-if="tool.evidence.timezone">{{ tool.evidence.timezone }}</span>
      <span v-if="tool.evidence.returned !== undefined">{{ tool.evidence.returned }} rows</span>
    </div>

    <div v-if="showActions" class="tool-card__actions">
      <button v-if="tool.canLocate" type="button" @click="$emit('locate', tool.id)">
        <IconFocusCentered aria-hidden="true" />
        {{ text.locate }}
      </button>
      <button
        v-if="tool.status === 'failed' && tool.error?.retryable"
        type="button"
        @click="$emit('retry')"
      >
        <IconRefresh aria-hidden="true" />
        {{ text.retry }}
      </button>
      <button
        v-if="tool.status === 'succeeded' && tool.undoToken"
        type="button"
        @click="$emit('undo')"
      >
        <IconArrowBackUp aria-hidden="true" />
        {{ text.undo }}
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { ToolCallView } from '../agent-contracts'

  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconArrowBackUp from '~icons/tabler/arrow-back-up'
  import IconBan from '~icons/tabler/ban'
  import IconCheck from '~icons/tabler/check'
  import IconClock from '~icons/tabler/clock'
  import IconFocusCentered from '~icons/tabler/focus-centered'
  import IconLoader2 from '~icons/tabler/loader-2'
  import IconRefresh from '~icons/tabler/refresh'
  import IconRotateClockwise2 from '~icons/tabler/rotate-clockwise-2'
  import IconShieldCheck from '~icons/tabler/shield-check'

  const props = defineProps<{ tool: ToolCallView; locale: AgentLocale }>()
  defineEmits<{ locate: [toolCallId: string]; retry: []; undo: [] }>()

  const text = computed(() => getAgentCopy(props.locale))
  const statusLabel = computed(
    () => text.value.status[props.tool.status as keyof typeof text.value.status],
  )
  const safetyLabel = computed(() =>
    props.tool.reversible ? text.value.reversible : text.value.irreversible,
  )
  const statusIcon = computed(() => {
    switch (props.tool.status) {
      case 'succeeded':
        return IconCheck
      case 'failed':
        return IconAlertTriangle
      case 'cancelled':
      case 'rejected':
        return IconBan
      case 'undone':
        return IconRotateClockwise2
      case 'requires-confirmation':
        return IconShieldCheck
      case 'queued':
        return IconClock
      default:
        return IconLoader2
    }
  })
  const showActions = computed(
    () =>
      Boolean(props.tool.canLocate) ||
      Boolean(props.tool.status === 'failed' && props.tool.error?.retryable) ||
      Boolean(props.tool.status === 'succeeded' && props.tool.undoToken),
  )
</script>

<style scoped>
  .tool-card {
    display: grid;
    gap: 9px;
    padding: 10px;
    border: 1px solid var(--agent-border);
    border-radius: 6px;
    background: var(--agent-card);
    color: var(--agent-text);
  }

  .tool-card__header {
    min-width: 0;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
  }

  .tool-card__icon {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 4px;
    color: var(--agent-muted);
    background: var(--agent-hover);
  }

  .tool-card[data-status='succeeded'] .tool-card__icon {
    color: #16885a;
  }
  .tool-card[data-status='failed'] .tool-card__icon {
    color: #c63f3f;
  }
  .tool-card[data-status='requires-confirmation'] .tool-card__icon {
    color: #ad7414;
  }

  .tool-card__title {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .tool-card__title strong,
  .tool-card__title span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tool-card__title strong {
    font-size: 12px;
  }
  .tool-card__title span {
    color: var(--agent-muted);
    font-size: 11px;
  }

  .tool-card__safety {
    max-width: 88px;
    color: var(--agent-muted);
    font-size: 10px;
    text-align: right;
  }

  .tool-card__details {
    display: grid;
    gap: 7px;
    margin: 0;
  }

  .tool-card__details div {
    display: grid;
    gap: 2px;
  }
  dt {
    color: var(--agent-muted);
    font-size: 10px;
    text-transform: uppercase;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.42;
  }

  .tool-card__progress {
    display: grid;
    gap: 4px;
    color: var(--agent-muted);
    font-size: 11px;
  }

  progress {
    width: 100%;
    height: 4px;
    accent-color: var(--agent-accent);
  }

  .tool-card__evidence {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 7px;
    padding-top: 8px;
    border-top: 1px solid var(--agent-border);
    color: var(--agent-muted);
    font-size: 10px;
  }

  .tool-card__evidence strong {
    color: var(--agent-text);
  }

  .tool-card__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 5px;
  }

  button {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border: 1px solid var(--agent-border-strong);
    border-radius: 4px;
    color: var(--agent-text);
    background: var(--agent-input);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  button:hover {
    background: var(--agent-hover);
  }
</style>
