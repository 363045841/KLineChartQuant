<template>
  <div class="composer__input">
      <BaseTextarea
        class="composer__textarea"
        :model-value="draft"
        :min-rows="3"
        :max-rows="6"
        :placeholder="text.composerPlaceholder"
        :aria-label="text.composerPlaceholder"
        @update:model-value="$emit('update:draft', $event)"
        @keydown="onKeydown"
      />
      <div class="composer__footer">
        <div class="composer__meta">
          <DropMenu
            class="composer__model"
            :label="text.model"
            :groups="modelGroups"
            :empty-text="text.noModelsInPool"
            :disabled="running || !provider.configured"
            placement="top"
            @open="$emit('models-open')"
            @select="selectModel"
          >
            <template #trigger>
              <span class="composer__model-value">{{ modelTriggerLabel }}</span>
              <IconChevronDown class="composer__model-chevron" aria-hidden="true" />
            </template>
            <template #item-action="{ item }">
              <span v-if="item.id === provider.modelId" class="drop-menu__status">
                <IconCheck aria-hidden="true" />
              </span>
            </template>
          </DropMenu>
          <Dropdown
            v-if="provider.reasoningEfforts?.length"
            class="composer__reasoning"
            allow-empty
            size="sm"
            placement="top"
            :model-value="provider.reasoningEffort"
            :options="reasoningOptions"
            :placeholder="text.reasoning"
            :title="text.reasoningEffort"
            :disabled="running"
            @update:model-value="$emit('reasoning-effort', $event)"
          />
        </div>
        <BaseTooltip
          v-if="contextUsage"
          :content="contextUsage.label"
          placement="top"
        >
          <span
            class="composer__usage-ring"
            :style="{ '--usage-progress': `${contextUsage.percent * 3.6}deg` }"
            :aria-label="contextUsage.accessibleLabel"
            role="img"
            tabindex="0"
          ></span>
        </BaseTooltip>
        <BaseTooltip v-if="running" :content="text.stop" placement="top">
          <button
            type="button"
            class="composer__primary composer__primary--stop agent-primary-button"
            :aria-label="text.stop"
            @click="$emit('stop')"
          >
            <span class="composer__primary-background agent-primary-button__background" aria-hidden="true"></span>
            <IconPlayerStopFilled aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip v-else :content="text.send" placement="top">
          <button
            type="button"
            class="composer__primary agent-primary-button"
            :disabled="!draft.trim()"
            :aria-label="text.send"
            @click="$emit('send')"
          >
            <span class="composer__primary-background agent-primary-button__background" aria-hidden="true"></span>
            <IconArrowUp aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import IconArrowUp from '~icons/tabler/arrow-up'
  import IconCheck from '~icons/tabler/check'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconPlayerStopFilled from '~icons/tabler/player-stop-filled'
  import BaseTextarea from '../../../components/common/BaseTextarea.vue'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import Dropdown from '../../../components/Dropdown.vue'
  import DropMenu, { type DropMenuGroup } from '../../../components/DropMenu.vue'
  import type { AgentUsageView, ProviderModelView, ProviderStatusView } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

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
  const modelGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'models',
      label: props.provider.profileName ?? props.provider.providerLabel,
      items: props.models.map((model) => ({ id: model.id, label: model.name })),
    },
  ])
  const modelTriggerLabel = computed(() => {
    const selected = props.models.find((model) => model.id === props.provider.modelId)
    if (selected) return selected.name
    return props.modelsLoading ? text.value.loadingModels : text.value.modelPlaceholder
  })
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

  /** 从模型菜单选择模型并上报。 */
  function selectModel(_groupId: string, modelId: string): void {
    emit('model', modelId)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    if (!props.running && props.draft.trim()) emit('send')
  }
</script>

<style scoped src="./agent-primary-button.css"></style>
<style src="./agent-select-trigger.css"></style>

<style scoped>
  .composer__input {
    --composer-inset: 16px;
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin: 0 12px 12px;
    border-radius: var(--agent-control-radius, 8px);
    background: var(--klc-color-agent-composer-input-background);
  }

  /* BaseTextarea 负责自增高（field-sizing）与无拖拽手柄；这里只定制外观。 */
  .composer__textarea {
    --base-textarea-padding-block: var(--composer-inset);
    --base-textarea-border: 0px;

    padding: var(--composer-inset);
    border: 0;
    border-radius: var(--agent-control-radius, 8px);
    color: var(--agent-text);
    background: transparent;
    font-size: var(--klc-text-copy-13-font-size, 13px);
    line-height: 1.5;
  }

  .composer__textarea::placeholder {
    color: var(--agent-text-soft);
  }

  .composer__textarea:focus,
  .composer__textarea:focus-visible {
    box-shadow: none;
    outline: none;
  }

  .composer__footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 var(--composer-inset) var(--composer-inset);
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
    background: var(--klc-color-agent-composer-input-background);
    content: '';
  }

  .composer__usage-ring:focus-visible {
    outline: 2px solid var(--agent-focus);
    outline-offset: 3px;
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
  }

  .composer__reasoning :deep(.dropdown__trigger) {
    max-width: 160px;
    height: 26px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 9px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--agent-text);
    background: var(--klc-color-agent-composer-control-background);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .composer__model :deep(.drop-menu__trigger) {
    max-width: 160px;
  }

  .composer__reasoning :deep(.dropdown__trigger:hover:not(:disabled)),
  .composer__reasoning :deep(.dropdown__trigger[aria-expanded='true']:not(:disabled)) {
    border-color: var(--klc-color-agent-composer-control-hover);
    background: var(--klc-color-agent-composer-control-hover);
  }

  .composer__reasoning :deep(.dropdown__trigger:focus-visible) {
    outline: none;
    border-color: var(--agent-focus);
    background: var(--klc-color-agent-composer-control-hover);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--agent-focus) 24%, transparent);
  }

  .composer__reasoning :deep(.dropdown__trigger:disabled) {
    color: var(--agent-text-soft);
    background: transparent;
    cursor: not-allowed;
  }

  .composer__model-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer__model-chevron {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    color: var(--agent-muted);
    transition: transform var(--klc-motion-duration-fast) ease;
  }

  .composer__model :deep(.drop-menu__trigger[aria-expanded='true']) .composer__model-chevron {
    transform: rotate(180deg);
  }

  .composer__reasoning :deep(.dropdown__value) {
    min-width: 0;
    overflow: hidden;
    color: var(--agent-text);
    font-size: 11px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer__primary--stop .composer__primary-background {
    background-color: var(--klc-color-ui-danger);
  }

  .composer__primary--stop:hover:not(:disabled) .composer__primary-background {
    background-color: var(--klc-color-ui-danger);
  }
</style>
