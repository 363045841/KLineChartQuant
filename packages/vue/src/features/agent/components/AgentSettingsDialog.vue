<template>
  <Teleport to="body">
    <div v-if="open" class="settings-backdrop" @mousedown.self="$emit('close')">
      <section
        ref="dialog"
        class="settings-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @keydown.esc="$emit('close')"
      >
        <header>
          <div>
            <h2 :id="titleId">{{ text.providerTitle }}</h2>
            <p>{{ text.providerBody }}</p>
          </div>
          <button
            type="button"
            class="icon-button"
            :title="text.cancel"
            :aria-label="text.cancel"
            @click="$emit('close')"
          >
            <IconX aria-hidden="true" />
          </button>
        </header>

        <form @submit.prevent="submit">
          <label>
            <span>{{ text.baseUrl }}</span>
            <input v-model="baseUrl" type="url" required spellcheck="false" />
          </label>
          <label>
            <span>{{ text.apiKey }}</span>
            <input
              v-model="apiKey"
              type="password"
              required
              autocomplete="off"
              :placeholder="text.apiKeyPlaceholder"
            />
          </label>
          <label>
            <span>{{ text.model }}</span>
            <input
              ref="modelInput"
              v-model="model"
              type="text"
              required
              autocomplete="off"
              spellcheck="false"
              :placeholder="text.modelPlaceholder"
            />
          </label>

          <p class="settings-dialog__draft-note">
            <IconNotes aria-hidden="true" />
            {{ text.providerDraftNotice }}
          </p>

          <div class="settings-dialog__status" :data-state="status.state">
            <span aria-hidden="true"></span>
            {{ connectionLabel }}
            <strong v-if="status.modelLabel">{{ status.modelLabel }}</strong>
          </div>

          <footer>
            <button
              v-if="status.state === 'connected'"
              type="button"
              class="danger-button"
              @click="$emit('delete')"
            >
              <IconTrash aria-hidden="true" />
              {{ text.removeCredential }}
            </button>
            <span v-else></span>
            <div>
              <button type="button" class="secondary-button" @click="$emit('close')">
                {{ text.cancel }}
              </button>
              <button type="submit" class="primary-button" :disabled="status.state === 'testing'">
                <IconPlugConnected v-if="status.state !== 'testing'" aria-hidden="true" />
                <IconLoader2 v-else class="spinner" aria-hidden="true" />
                {{ text.testConnection }}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { ProviderStatusView, ProviderTestInput } from '../agent-contracts'

  import IconLoader2 from '~icons/tabler/loader-2'
  import IconNotes from '~icons/tabler/notes'
  import IconPlugConnected from '~icons/tabler/plug-connected'
  import IconTrash from '~icons/tabler/trash'
  import IconX from '~icons/tabler/x'

  const props = defineProps<{
    open: boolean
    status: ProviderStatusView
    locale: AgentLocale
  }>()
  const emit = defineEmits<{
    close: []
    test: [input: ProviderTestInput]
    delete: []
  }>()

  const titleId = 'agent-provider-settings-title'
  const dialog = ref<HTMLElement | null>(null)
  const modelInput = ref<HTMLInputElement | null>(null)
  const baseUrl = ref('https://api.302.ai/v1')
  const apiKey = ref('')
  const model = ref('')
  const text = computed(() => getAgentCopy(props.locale))
  const connectionLabel = computed(() => {
    const labels = {
      connected: text.value.connected,
      testing: text.value.testing,
      'not-configured': text.value.notConfigured,
      error: text.value.connectionError,
    }
    return labels[props.status.state]
  })

  function submit(): void {
    emit('test', { baseUrl: baseUrl.value, apiKey: apiKey.value, model: model.value })
  }

  watch(
    () => props.open,
    async (open) => {
      if (!open) return
      await nextTick()
      dialog.value?.focus()
      modelInput.value?.focus()
    },
  )

  watch(
    () => props.status.state,
    (state) => {
      if (state === 'connected') apiKey.value = ''
    },
  )
</script>

<style scoped>
  .settings-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(15, 20, 25, 0.44);
  }

  .settings-dialog {
    width: min(460px, 100%);
    max-height: calc(100vh - 36px);
    overflow: auto;
    box-sizing: border-box;
    padding: 16px;
    border: 1px solid var(--agent-border-strong, #aab3bd);
    border-radius: 8px;
    color: var(--agent-text, #1e2933);
    background: var(--agent-surface, #ffffff);
    box-shadow: 0 18px 54px rgba(0, 0, 0, 0.22);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  header p {
    margin: 5px 0 0;
    color: var(--agent-muted, #687480);
    font-size: 12px;
    line-height: 1.45;
  }
  form {
    display: grid;
    gap: 12px;
    margin-top: 16px;
  }
  label {
    display: grid;
    gap: 5px;
    color: var(--agent-muted, #687480);
    font-size: 11px;
    font-weight: 600;
  }
  input {
    width: 100%;
    height: 36px;
    box-sizing: border-box;
    padding: 0 9px;
    border: 1px solid var(--agent-border-strong, #aab3bd);
    border-radius: 5px;
    color: var(--agent-text, #1e2933);
    background: var(--agent-input, #ffffff);
    font: inherit;
    font-size: 12px;
  }
  input:focus {
    outline: 2px solid var(--agent-focus, #2483d6);
    outline-offset: 1px;
    border-color: transparent;
  }

  .icon-button {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    color: var(--agent-muted, #687480);
    background: transparent;
    cursor: pointer;
  }

  .settings-dialog__draft-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--agent-muted, #687480);
    font-size: 11px;
  }

  .settings-dialog__status {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--agent-muted, #687480);
    font-size: 11px;
  }
  .settings-dialog__status > span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #9ca3af;
  }
  .settings-dialog__status[data-state='connected'] > span {
    background: #1f9d68;
  }
  .settings-dialog__status[data-state='testing'] > span {
    background: #c58a1a;
  }
  .settings-dialog__status[data-state='error'] > span {
    background: #d14b4b;
  }
  .settings-dialog__status strong {
    color: var(--agent-text, #1e2933);
  }

  footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding-top: 4px;
  }
  footer > div {
    display: flex;
    gap: 6px;
  }
  footer button:not(.icon-button) {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid var(--agent-border-strong, #aab3bd);
    border-radius: 5px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .secondary-button,
  .danger-button {
    color: var(--agent-text, #1e2933);
    background: var(--agent-input, #fff);
  }
  .danger-button {
    color: #b43d3d;
  }
  .primary-button {
    border-color: var(--agent-accent, #1769aa) !important;
    color: white;
    background: var(--agent-accent, #1769aa);
  }
  .primary-button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .spinner {
    animation: spin 850ms linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
