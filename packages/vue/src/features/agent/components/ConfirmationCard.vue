<template>
  <section
    class="confirmation"
    :data-status="confirmation.status"
    :tabindex="confirmation.status === 'pending' ? -1 : undefined"
    data-focus="confirmation"
  >
    <header>
      <IconShieldExclamation aria-hidden="true" />
      <div>
        <span>{{ text.required }}</span>
        <strong>{{ confirmation.title }}</strong>
      </div>
    </header>
    <p>{{ confirmation.description }}</p>
    <dl>
      <div>
        <dt>{{ text.action }}</dt>
        <dd>{{ confirmation.impact }}</dd>
      </div>
      <div>
        <dt>{{ confirmation.reversible ? text.reversible : text.irreversible }}</dt>
      </div>
    </dl>
    <div v-if="confirmation.status === 'pending'" class="confirmation__actions">
      <button type="button" class="confirmation__reject" @click="$emit('decide', 'rejected')">
        <IconX aria-hidden="true" />
        {{ text.reject }}
      </button>
      <button type="button" class="confirmation__confirm" @click="$emit('decide', 'confirmed')">
        <IconCheck aria-hidden="true" />
        {{ text.confirm }}
      </button>
    </div>
    <div v-else class="confirmation__resolved">
      {{ text.status[confirmation.status] }}
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { ConfirmationView } from '../agent-contracts'

  import IconCheck from '~icons/tabler/check'
  import IconShieldExclamation from '~icons/tabler/shield-exclamation'
  import IconX from '~icons/tabler/x'

  const props = defineProps<{ confirmation: ConfirmationView; locale: AgentLocale }>()
  defineEmits<{ decide: [decision: 'confirmed' | 'rejected'] }>()
  const text = computed(() => getAgentCopy(props.locale))
</script>

<style scoped>
  .confirmation {
    display: grid;
    gap: 9px;
    padding: 11px;
    border: 1px solid var(--klc-color-agent-warning-border);
    border-radius: 6px;
    background: var(--agent-warning-bg);
    color: var(--agent-text);
  }

  header {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  header > svg {
    flex: 0 0 auto;
    color: var(--klc-color-agent-warning-text);
  }
  header div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  header span {
    color: var(--agent-muted);
    font-size: 10px;
    text-transform: uppercase;
  }
  header strong {
    overflow-wrap: anywhere;
    font-size: 13px;
  }
  p {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.45;
  }
  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin: 0;
  }
  dl div {
    display: grid;
    gap: 2px;
  }
  dt {
    color: var(--agent-muted);
    font-size: 10px;
  }
  dd {
    margin: 0;
    font-size: 11px;
  }

  .confirmation__actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  button {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    border: 1px solid var(--agent-border-strong);
    border-radius: 4px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .confirmation__reject {
    color: var(--agent-text);
    background: var(--agent-input);
  }
  .confirmation__confirm {
    border-color: var(--klc-color-agent-warning-strong);
    color: var(--klc-color-agent-on-accent);
    background: var(--klc-color-agent-warning-strong);
  }
  .confirmation__resolved {
    color: var(--agent-muted);
    font-size: 11px;
    font-weight: 600;
  }
</style>
