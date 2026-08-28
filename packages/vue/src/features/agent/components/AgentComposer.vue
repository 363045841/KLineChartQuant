<template>
  <div class="composer">
    <textarea
      :value="draft"
      rows="3"
      :placeholder="text.composerPlaceholder"
      :aria-label="text.composerPlaceholder"
      @input="$emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
      @keydown="onKeydown"
    ></textarea>
    <div class="composer__footer">
      <span v-if="running" class="composer__notice">{{ text.steeringDisabled }}</span>
      <span v-else></span>
      <button
        v-if="running"
        type="button"
        class="composer__primary composer__primary--stop"
        @click="$emit('stop')"
      >
        <IconPlayerStopFilled aria-hidden="true" />
        {{ text.stop }}
      </button>
      <button
        v-else
        type="button"
        class="composer__primary"
        :disabled="!draft.trim()"
        @click="$emit('send')"
      >
        <IconArrowUp aria-hidden="true" />
        {{ text.send }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import IconArrowUp from '~icons/tabler/arrow-up'
  import IconPlayerStopFilled from '~icons/tabler/player-stop-filled'

  const props = defineProps<{ draft: string; running: boolean; locale: AgentLocale }>()
  const emit = defineEmits<{
    'update:draft': [value: string]
    send: []
    stop: []
  }>()

  const text = computed(() => getAgentCopy(props.locale))

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

  textarea {
    width: 100%;
    min-height: 66px;
    max-height: 152px;
    resize: vertical;
    box-sizing: border-box;
    padding: 9px 10px;
    border: 1px solid var(--agent-border-strong);
    border-radius: 6px;
    color: var(--agent-text);
    background: var(--agent-input);
    font: inherit;
    font-size: 13px;
    line-height: 1.45;
  }

  textarea::placeholder {
    color: var(--agent-text-soft);
  }

  textarea:focus {
    outline: 2px solid var(--agent-focus);
    outline-offset: 1px;
    border-color: transparent;
  }

  .composer__footer {
    min-height: 30px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .composer__notice {
    min-width: 0;
    color: var(--agent-muted);
    font-size: 11px;
    line-height: 1.3;
  }

  .composer__primary {
    height: 30px;
    min-width: 76px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 11px;
    border: 0;
    border-radius: 5px;
    color: var(--klc-color-agent-on-accent);
    background: var(--agent-accent);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .composer__primary:hover:not(:disabled) {
    background: var(--agent-accent-strong);
  }

  .composer__primary:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .composer__primary--stop {
    background: var(--klc-color-agent-danger);
  }
</style>
