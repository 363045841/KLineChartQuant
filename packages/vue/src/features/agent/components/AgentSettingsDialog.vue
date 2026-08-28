<template>
  <BaseModal
    :show="providerSettings.open"
    :title="text.providerTitle"
    width="min(92vw, 480px)"
    max-height="calc(100vh - 36px)"
    body-padding="12px 20px 16px"
    @close="providerSettings.close()"
  >
    <form
      id="agent-provider-settings-form"
      class="provider-form"
      autocomplete="off"
      novalidate
      @submit.prevent="providerSettings.testProvider()"
    >
      <div class="provider-form__fields">
        <label class="provider-field">
          <span class="provider-field__label">{{ text.baseUrl }}</span>
          <input
            v-model="providerSettings.baseUrl"
            type="text"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <label class="provider-field">
          <span class="provider-field__label">{{ text.apiKey }}</span>
          <input
            v-model="providerSettings.apiKey"
            type="password"
            autocomplete="new-password"
            :placeholder="status.configured ? '••••••••' : text.apiKeyPlaceholder"
          />
        </label>
        <label class="provider-field">
          <span class="provider-field__label">{{ text.model }}</span>
          <span class="provider-model-control">
            <select
              v-if="providerSettings.models.length"
              ref="modelInput"
              v-model="providerSettings.model"
            >
              <option v-for="item in providerSettings.models" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
            <input
              v-else
              ref="modelInput"
              v-model="providerSettings.model"
              type="text"
              autocomplete="new-password"
              spellcheck="false"
              :placeholder="text.modelPlaceholder"
            />
            <button
              type="button"
              class="provider-refresh-button"
              :title="text.refreshModels"
              :aria-label="text.refreshModels"
              :disabled="!providerSettings.canRefreshModels"
              @click="providerSettings.refreshModels()"
            >
              <IconRefresh
                :class="{ spinner: providerSettings.modelsLoading }"
                aria-hidden="true"
              />
            </button>
          </span>
        </label>
      </div>

      <ol
        v-if="providerSettings.testResult"
        class="provider-probe-results"
        :aria-label="text.probeResults"
      >
        <li v-for="stage in providerSettings.testResult.stages" :key="stage.stage">
          <IconCircleCheck aria-hidden="true" />
          <span>{{ stageLabel(stage.stage) }}</span>
          <strong>{{ stage.latencyMs }} ms</strong>
        </li>
      </ol>

      <div v-if="visibleError" class="provider-error" role="alert">
        <IconAlertTriangle aria-hidden="true" />
        <span>
          <strong>{{ visibleError.message }}</strong>
          <small v-if="visibleError.recommendedAction">
            {{ visibleError.recommendedAction }}
          </small>
        </span>
      </div>

      <div v-if="status.modelLabel" class="provider-status" :data-state="status.state">
        <span class="provider-status__dot" aria-hidden="true"></span>
        <strong>{{ status.modelLabel }}</strong>
      </div>
    </form>

    <template #footer>
      <div class="provider-actions">
        <button
          type="submit"
          form="agent-provider-settings-form"
          class="provider-primary-button"
          :disabled="!providerSettings.canTest || status.state === 'testing'"
        >
          <IconPlugConnected v-if="status.state !== 'testing'" aria-hidden="true" />
          <IconLoader2 v-else class="spinner" aria-hidden="true" />
          {{ text.testConnection }}
        </button>
        <button
          type="button"
          class="provider-primary-button"
          @click="providerSettings.saveProvider()"
        >
          {{ text.confirm }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'

  import BaseModal from '../../../components/BaseModal.vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'
  import type { AgentProviderSettingsStore } from '../agent-provider-settings-store'

  import type { ProviderProbeStageResult, ProviderStatusView } from '../agent-contracts'

  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconCircleCheck from '~icons/tabler/circle-check'
  import IconLoader2 from '~icons/tabler/loader-2'
  import IconPlugConnected from '~icons/tabler/plug-connected'
  import IconRefresh from '~icons/tabler/refresh'

  const props = defineProps<{
    providerSettings: AgentProviderSettingsStore
    status: ProviderStatusView
    locale: AgentLocale
  }>()

  const modelInput = ref<HTMLInputElement | HTMLSelectElement | null>(null)
  const text = computed(() => getAgentCopy(props.locale))
  const visibleError = computed(() => props.providerSettings.operationError ?? props.status.error)

  function stageLabel(stage: ProviderProbeStageResult['stage']): string {
    return {
      catalog: text.value.probeCatalog,
      text: text.value.probeText,
      tool: text.value.probeTool,
    }[stage]
  }

  watch(
    () => props.providerSettings.open,
    async (open) => {
      if (!open) return
      await nextTick()
      modelInput.value?.focus()
    },
  )
</script>

<style scoped>
  .provider-form {
    display: grid;
    gap: 14px;
    color: var(--klc-color-foreground);
  }

  .provider-form__fields {
    display: grid;
    gap: 12px;
  }

  .provider-field {
    display: grid;
    gap: 5px;
  }

  .provider-field__label {
    color: var(--klc-color-axis-text);
    font-size: 11px;
    font-weight: 500;
  }

  .provider-field input,
  .provider-field select {
    width: 100%;
    height: 34px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 6px;
    outline: none;
    color: var(--klc-color-foreground);
    background: var(--klc-color-background);
    font: inherit;
    font-size: 12px;
    transition: border-color 0.15s;
  }

  .provider-field input:focus,
  .provider-field select:focus {
    border-color: var(--klc-color-axis-text);
  }

  .provider-field input::placeholder {
    color: var(--klc-color-axis-text);
    opacity: 0.55;
  }

  .provider-model-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    gap: 8px;
  }

  .provider-refresh-button,
  .provider-primary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--klc-color-border-button);
    font: inherit;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s,
      opacity 0.15s;
  }

  .provider-refresh-button {
    width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 6px;
    color: var(--klc-color-axis-text);
    background: var(--klc-color-background);
  }

  .provider-refresh-button:hover:not(:disabled) {
    border-color: var(--klc-color-axis-line);
    color: var(--klc-color-foreground);
    background: var(--klc-color-tag-bg-hover);
  }

  .provider-refresh-button:disabled,
  .provider-primary-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .provider-probe-results {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--klc-color-grid-major);
    border-radius: 6px;
    list-style: none;
    background: var(--klc-color-background);
  }

  .provider-probe-results li {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    color: var(--klc-color-axis-text);
    font-size: 11px;
  }

  .provider-probe-results svg {
    color: var(--klc-color-agent-success);
  }

  .provider-probe-results strong {
    color: var(--klc-color-foreground);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .provider-error {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--klc-color-agent-danger-border);
    border-radius: 6px;
    color: var(--klc-color-agent-danger-text);
    background: var(--klc-color-background);
    font-size: 11px;
    line-height: 1.45;
  }

  .provider-error span {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .provider-error strong,
  .provider-error small {
    overflow-wrap: anywhere;
    font: inherit;
  }

  .provider-error strong {
    font-weight: 600;
  }

  .provider-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--klc-color-axis-text);
    font-size: 11px;
    line-height: 1.4;
    white-space: nowrap;
  }

  .provider-status__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--klc-color-axis-line);
  }

  .provider-status[data-state='connected'] .provider-status__dot {
    background: var(--klc-color-agent-success);
  }

  .provider-status[data-state='testing'] .provider-status__dot {
    background: var(--klc-color-agent-warning);
  }

  .provider-status[data-state='error'] .provider-status__dot {
    background: var(--klc-color-agent-danger);
  }

  .provider-status strong {
    color: var(--klc-color-foreground);
    font-weight: 500;
  }

  .provider-actions {
    display: flex;
    gap: 8px;
  }

  .provider-primary-button {
    min-height: 32px;
    padding: 0 12px;
    border-radius: 7px;
    font-size: 12px;
    white-space: nowrap;
  }

  .provider-primary-button {
    border-color: var(--klc-color-foreground);
    color: var(--klc-color-background);
    background: var(--klc-color-foreground);
  }

  .provider-primary-button:hover:not(:disabled) {
    opacity: 0.82;
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

  @media (max-width: 480px) {
    .provider-status {
      white-space: normal;
    }

    .provider-footer-spacer {
      display: none;
    }
  }
</style>
