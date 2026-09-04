<template>
  <header class="agent-header">
    <div class="agent-header__top">
      <div class="agent-header__identity">
        <IconSparkles aria-hidden="true" />
        <strong>{{ text.agent }}</strong>
      </div>
      <div class="agent-header__actions">
        <button
          type="button"
          :title="text.newSession"
          :aria-label="text.newSession"
          @click="$emit('create')"
        >
          <IconPlus aria-hidden="true" />
        </button>
        <button
          type="button"
          :title="text.renameSession"
          :aria-label="text.renameSession"
          :disabled="!activeSessionId"
          @click="rename"
        >
          <IconPencil aria-hidden="true" />
        </button>
        <button
          type="button"
          :title="text.deleteSession"
          :aria-label="text.deleteSession"
          :disabled="!activeSessionId"
          @click="remove"
        >
          <IconTrash aria-hidden="true" />
        </button>
        <button
          type="button"
          :title="text.switchLanguage"
          :aria-label="text.switchLanguage"
          @click="$emit('toggle-locale')"
        >
          <IconLanguage aria-hidden="true" />
        </button>
        <button
          type="button"
          :title="text.settings"
          :aria-label="text.settings"
          @click="$emit('settings')"
        >
          <IconSettings aria-hidden="true" />
        </button>
        <button type="button" :title="text.tools" :aria-label="text.tools" @click="$emit('tools')">
          <IconTools aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="agent-panel-close"
          :title="text.closePanel"
          :aria-label="text.closePanel"
          @click="$emit('close')"
        >
          <IconPanelRightClose aria-hidden="true" />
        </button>
      </div>
    </div>

    <Dropdown
      class="agent-header__sessions"
      :model-value="activeSessionId ?? ''"
      :options="sessionOptions"
      :aria-label="text.agent"
      @update:model-value="$emit('select', $event)"
    />

    <div class="agent-header__meta">
      <span class="connection" :data-state="provider.state">
        <span class="connection__dot" aria-hidden="true"></span>
        {{ connectionLabel }}
      </span>
      <span class="agent-header__model">{{ provider.modelLabel ?? text.noModel }}</span>
      <span class="agent-header__scope">{{ scope }}</span>
    </div>
  </header>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import Dropdown from '../../../components/Dropdown.vue'
  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type {
    AgentChartSymbolContextItem,
    AgentContextItem,
    AgentSessionView,
    ProviderStatusView,
  } from '../agent-contracts'

  import IconLanguage from '~icons/tabler/language'
  import IconPanelRightClose from '~icons/tabler/layout-sidebar-right-collapse'
  import IconPencil from '~icons/tabler/pencil'
  import IconPlus from '~icons/tabler/plus'
  import IconSettings from '~icons/tabler/settings'
  import IconSparkles from '~icons/tabler/sparkles'
  import IconTools from '~icons/tabler/tools'
  import IconTrash from '~icons/tabler/trash'

  const props = defineProps<{
    sessions: AgentSessionView[]
    activeSessionId: string | null
    provider: ProviderStatusView
    contextItems: ReadonlyArray<AgentContextItem>
    locale: AgentLocale
  }>()

  const emit = defineEmits<{
    create: []
    select: [sessionId: string]
    rename: [title: string]
    delete: []
    settings: []
    tools: []
    close: []
    'toggle-locale': []
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  const sessionOptions = computed(() =>
    props.sessions.map((session) => ({ value: session.id, label: session.title })),
  )
  const connectionLabel = computed(() => {
    const labels = {
      connected: text.value.connected,
      testing: text.value.testing,
      'not-configured': text.value.notConfigured,
      error: text.value.connectionError,
    }
    return labels[props.provider.state]
  })
  const symbolContext = computed(() =>
    props.contextItems.find(
      (item): item is AgentChartSymbolContextItem => item.kind === 'chart-symbol',
    ),
  )
  const scope = computed(() => symbolContext.value?.value.symbol ?? text.value.noSymbol)

  function rename(): void {
    const session = props.sessions.find((item) => item.id === props.activeSessionId)
    const title = window.prompt(text.value.sessionNamePrompt, session?.title ?? '')
    if (title?.trim()) emit('rename', title)
  }

  function remove(): void {
    if (window.confirm(text.value.deleteSessionConfirm)) emit('delete')
  }
</script>

<style scoped>
  .agent-header {
    display: grid;
    gap: 8px;
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--agent-border);
    background: var(--agent-surface);
  }

  .agent-header__top,
  .agent-header__identity,
  .agent-header__actions,
  .agent-header__meta,
  .connection {
    display: flex;
    align-items: center;
  }

  .agent-header__top {
    min-width: 0;
    justify-content: space-between;
    gap: 8px;
  }

  .agent-header__identity {
    min-width: 0;
    gap: 7px;
    color: var(--agent-text);
    font-size: 14px;
  }

  .agent-header__identity svg {
    color: var(--agent-accent);
  }

  .agent-header__actions {
    flex: 0 0 auto;
    gap: 2px;
  }

  button {
    width: 30px;
    height: 30px;
    display: inline-grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    color: var(--agent-muted);
    background: transparent;
    cursor: pointer;
  }

  button:hover:not(:disabled),
  button:focus-visible {
    color: var(--agent-text);
    background: var(--agent-hover);
  }

  button:disabled {
    opacity: 0.38;
    cursor: default;
  }

  .agent-header__sessions {
    width: 100%;
    min-width: 0;
  }

  .agent-header__sessions :deep(.dropdown__trigger) {
    width: 100%;
    height: 32px;
    padding: 0 9px;
    border-color: var(--agent-border);
    color: var(--agent-text);
    background: var(--agent-input);
  }

  .agent-header__sessions :deep(.dropdown__value) {
    color: var(--agent-text);
    font-size: 12px;
    font-weight: 400;
  }

  .agent-header__meta {
    min-width: 0;
    gap: 7px;
    color: var(--agent-muted);
    font-size: 11px;
  }

  .connection {
    flex: 0 0 auto;
    gap: 5px;
  }

  .connection__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--klc-color-agent-neutral);
  }

  .connection[data-state='connected'] .connection__dot {
    background: var(--klc-color-agent-success);
  }

  .connection[data-state='testing'] .connection__dot {
    background: var(--klc-color-agent-warning);
  }

  .connection[data-state='error'] .connection__dot {
    background: var(--klc-color-agent-danger);
  }

  .agent-header__model,
  .agent-header__scope {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agent-header__model {
    flex: 1 1 auto;
  }

  .agent-header__scope {
    flex: 0 1 auto;
    color: var(--agent-text-soft);
  }
</style>
