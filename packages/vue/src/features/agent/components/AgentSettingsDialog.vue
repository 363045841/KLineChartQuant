<template>
  <BaseModal
    :show="open"
    :title="text.providerTitle"
    :subtitle="text.providerBody"
    width="min(92vw, 460px)"
    max-height="calc(100vh - 36px)"
    body-padding="16px 20px"
    footer-align="space-between"
    @close="$emit('close')"
  >
    <form id="agent-provider-settings-form" class="settings-form" @submit.prevent="submit">
      <label>
        <span>{{ text.baseUrl }}</span>
        <input v-model="baseUrl" type="url" required spellcheck="false" />
      </label>
      <label>
        <span>{{ text.apiKey }}</span>
        <input
          v-model="apiKey"
          type="password"
          :required="!status.configured"
          autocomplete="off"
          :placeholder="text.apiKeyPlaceholder"
        />
      </label>
      <label class="settings-dialog__model-field">
        <span>{{ text.model }}</span>
        <span class="settings-dialog__model-control">
          <select v-if="models.length" ref="modelInput" v-model="model" required>
            <option v-for="item in models" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select>
          <input
            v-else
            ref="modelInput"
            v-model="model"
            type="text"
            required
            autocomplete="off"
            spellcheck="false"
            :placeholder="text.modelPlaceholder"
          />
          <button
            type="button"
            class="icon-button settings-dialog__refresh"
            :title="text.refreshModels"
            :aria-label="text.refreshModels"
            :disabled="refreshDisabled"
            @click="refresh"
          >
            <IconRefresh :class="{ spinner: modelsLoading }" aria-hidden="true" />
          </button>
        </span>
      </label>

      <ol v-if="testResult" class="settings-dialog__stages" :aria-label="text.probeResults">
        <li v-for="stage in testResult.stages" :key="stage.stage">
          <IconCircleCheck aria-hidden="true" />
          <span>{{ stageLabel(stage.stage) }}</span>
          <strong>{{ stage.latencyMs }} ms</strong>
        </li>
      </ol>

      <div v-if="visibleError" class="settings-dialog__error" role="alert">
        <IconAlertTriangle aria-hidden="true" />
        <span>
          <strong>{{ visibleError.message }}</strong>
          <small v-if="visibleError.recommendedAction">
            {{ visibleError.recommendedAction }}
          </small>
        </span>
      </div>

      <p class="settings-dialog__draft-note">
        <IconNotes aria-hidden="true" />
        {{ text.providerDraftNotice }}
      </p>

      <div class="settings-dialog__status" :data-state="status.state">
        <span aria-hidden="true"></span>
        {{ connectionLabel }}
        <strong v-if="status.modelLabel">{{ status.modelLabel }}</strong>
      </div>
    </form>

    <template #footer>
      <button
        v-if="status.configured || status.state === 'error'"
        type="button"
        class="danger-button"
        @click="$emit('delete')"
      >
        <IconTrash aria-hidden="true" />
        {{ text.removeCredential }}
      </button>
      <span v-else />
      <div class="settings-actions">
        <button type="button" class="secondary-button" @click="$emit('close')">
          {{ text.cancel }}
        </button>
        <button
          type="submit"
          form="agent-provider-settings-form"
          class="primary-button"
          :disabled="testDisabled"
        >
          <IconPlugConnected v-if="status.state !== 'testing'" aria-hidden="true" />
          <IconLoader2 v-else class="spinner" aria-hidden="true" />
          {{ text.testConnection }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'

  import BaseModal from '../../../components/BaseModal.vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type {
    AgentErrorView,
    ProviderModelView,
    ProviderModelsInput,
    ProviderProbeStageResult,
    ProviderStatusView,
    ProviderTestInput,
    ProviderTestResult,
  } from '../agent-contracts'

  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconCircleCheck from '~icons/tabler/circle-check'
  import IconLoader2 from '~icons/tabler/loader-2'
  import IconNotes from '~icons/tabler/notes'
  import IconPlugConnected from '~icons/tabler/plug-connected'
  import IconRefresh from '~icons/tabler/refresh'
  import IconTrash from '~icons/tabler/trash'

  const props = defineProps<{
    open: boolean
    status: ProviderStatusView
    models: ProviderModelView[]
    modelsLoading: boolean
    testResult: ProviderTestResult | null
    operationError: AgentErrorView | null
    locale: AgentLocale
  }>()
  const emit = defineEmits<{
    close: []
    test: [input: ProviderTestInput]
    refreshModels: [input: ProviderModelsInput]
    delete: []
  }>()

  const modelInput = ref<HTMLInputElement | HTMLSelectElement | null>(null)
  const baseUrl = ref('')
  const apiKey = ref('')
  const model = ref('')
  const text = computed(() => getAgentCopy(props.locale))
  const visibleError = computed(() => props.operationError ?? props.status.error)
  const refreshDisabled = computed(
    () =>
      props.modelsLoading ||
      !baseUrl.value.trim() ||
      (!apiKey.value.trim() && !props.status.configured),
  )
  const testDisabled = computed(
    () => props.status.state === 'testing' || props.modelsLoading || !model.value.trim(),
  )
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
    emit('test', {
      baseUrl: baseUrl.value,
      apiKey: apiKey.value || undefined,
      model: model.value,
    })
  }

  function refresh(): void {
    emit('refreshModels', {
      baseUrl: baseUrl.value,
      apiKey: apiKey.value || undefined,
    })
  }

  function stageLabel(stage: ProviderProbeStageResult['stage']): string {
    return {
      catalog: text.value.probeCatalog,
      text: text.value.probeText,
      tool: text.value.probeTool,
    }[stage]
  }

  watch(
    () => props.open,
    async (open) => {
      if (!open) return
      baseUrl.value = props.status.baseUrl ?? ''
      model.value = props.status.modelId ?? ''
      await nextTick()
      modelInput.value?.focus()
    },
  )

  watch(
    () => props.status.state,
    (state) => {
      if (state === 'connected') apiKey.value = ''
    },
  )

  watch(
    () => props.models,
    (models) => {
      if (!models.length) return
      if (!models.some((item) => item.id === model.value)) model.value = models[0]!.id
    },
  )
</script>

<style scoped>
  .settings-form {
    display: grid;
    gap: 12px;
    color: var(--agent-text, #1e2933);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }
  label {
    display: grid;
    gap: 5px;
    color: var(--agent-muted, #687480);
    font-size: 11px;
    font-weight: 600;
  }
  input,
  select {
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
  input:focus,
  select:focus {
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
  .icon-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .settings-dialog__model-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 36px;
    gap: 6px;
  }
  .settings-dialog__refresh {
    width: 36px;
    height: 36px;
    border: 1px solid var(--agent-border-strong, #aab3bd);
    background: var(--agent-input, #fff);
  }

  .settings-dialog__persistence {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 0;
    color: var(--agent-muted, #687480);
    font-size: 11px;
    line-height: 1.45;
  }
  .settings-dialog__persistence svg {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
  }

  .settings-dialog__stages {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 9px;
    border: 1px solid var(--agent-border, #dce1e3);
    border-radius: 6px;
    list-style: none;
    background: var(--agent-card, #fbfcfc);
  }
  .settings-dialog__stages li {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    color: var(--agent-muted, #687480);
    font-size: 11px;
  }
  .settings-dialog__stages svg {
    color: #1f9d68;
  }
  .settings-dialog__stages strong {
    color: var(--agent-text, #1e2933);
    font-variant-numeric: tabular-nums;
  }

  .settings-dialog__error {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 7px;
    padding: 9px;
    border: 1px solid #d14b4b;
    border-radius: 6px;
    color: #a93636;
    background: var(--agent-danger-bg, #fff1f1);
    font-size: 11px;
  }
  .settings-dialog__error span {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .settings-dialog__error strong,
  .settings-dialog__error small {
    overflow-wrap: anywhere;
    font: inherit;
  }
  .settings-dialog__error strong {
    font-weight: 600;
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

  .settings-actions {
    display: flex;
    gap: 6px;
  }
  .settings-actions button,
  .danger-button {
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
