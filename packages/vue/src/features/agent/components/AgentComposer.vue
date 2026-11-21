<template>
  <div class="composer__input">
      <BaseTextarea
        class="composer__textarea"
        :model-value="draft"
        :max-rows="6"
        :placeholder="text.composerPlaceholder"
        :aria-label="text.composerPlaceholder"
        @update:model-value="emit('update:draft', $event)"
        @keydown="onKeydown"
      />
      <div class="composer__footer">
        <div class="composer__meta">
          <DropMenu
            class="composer__model"
            :label="text.model"
            :groups="modelGroups"
            :empty-text="text.noModelsInPool"
            :disabled="running || !snapshot?.credentialPresent"
            :tooltip="false"
            placement="top"
            @select="selectModel"
          >
            <template #trigger="{ open }">
              <span class="composer__model-value truncate-text">{{ modelTriggerLabel }}</span>
              <IconChevronDown
                class="composer__trigger-chevron"
                :class="{ 'is-open': open }"
                aria-hidden="true"
              />
            </template>
          </DropMenu>
          <DropMenu
            v-if="selectedModel?.reasoningEfforts?.length"
            class="composer__reasoning"
            placement="top"
            :groups="reasoningGroups"
            :label="text.reasoningEffort"
            :disabled="running"
            :tooltip="false"
            @select="(_groupId, value) => emit('reasoning-effort', value)"
          >
            <template #trigger="{ open }">
              <span class="composer__reasoning-value">{{ snapshot?.reasoningEffort || text.reasoning }}</span>
              <IconChevronDown
                class="composer__trigger-chevron"
                :class="{ 'is-open': open }"
                aria-hidden="true"
              />
            </template>
          </DropMenu>
        </div>
        <DropMenu
          class="composer__mode"
          :label="modeMenuLabel"
          :groups="modeGroups"
          :tooltip="false"
          placement="top"
          @select="selectMode"
        >
          <template #trigger="{ open }">
            <span class="composer__mode-value">{{ modeLabel }}</span>
            <IconChevronDown
              class="composer__trigger-chevron"
              :class="{ 'is-open': open }"
              aria-hidden="true"
            />
          </template>
        </DropMenu>
        <BaseTooltip v-if="running" :content="text.stop" placement="top">
          <BaseIconButton
            shape="circle"
            class="composer__primary composer__primary--stop agent-primary-button"
            :label="text.stop"
            @click="emit('stop')"
          >
            <IconPlayerStopFilled aria-hidden="true" />
          </BaseIconButton>
        </BaseTooltip>
        <BaseTooltip v-else :content="text.send" placement="top">
          <BaseIconButton
            shape="circle"
            class="composer__primary agent-primary-button"
            :label="text.send"
            :disabled="!draft.trim()"
            @click="emit('send')"
          >
            <IconArrowUp aria-hidden="true" />
          </BaseIconButton>
        </BaseTooltip>
      </div>
  </div>
</template>

<script setup lang="ts">
  import './agent-primary-button.css'
  import '@vue-src/components/common/truncate-text.css'

  import type { AgentRunMode } from '@363045841yyt/klinechart-agent-runtime'
  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import BaseTextarea from '@vue-src/components/common/form/BaseTextarea.vue'
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/menu/DropMenu.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import { computed } from 'vue'
  import IconArrowUp from '~icons/tabler/arrow-up'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconPlayerStopFilled from '~icons/tabler/player-stop-filled'
  import type { ProviderModelView, ProviderSnapshot } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy/index.js'

  const props = defineProps<{
    draft: string
    running: boolean
    mode: AgentRunMode
    locale: AgentLocale
    snapshot: ProviderSnapshot | null
    models: readonly ProviderModelView[]
    modelsLoading: boolean
  }>()
  const emit = defineEmits<{
    'update:draft': [value: string]
    send: []
    stop: []
    model: [value: string]
    'reasoning-effort': [value: string]
    'mode-change': [value: AgentRunMode]
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  /** 当前激活的配置名；没有配置时退回 Provider 名称。 */
  const providerLabel = computed(
    () => props.snapshot?.profiles.find((profile) => profile.active)?.name ?? 'OpenAI-compatible',
  )
  const selectedModel = computed(() =>
    props.models.find((model) => model.id === props.snapshot?.selectedModelId),
  )
  const modelGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'models',
      label: providerLabel.value,
      items: props.models.map((model) => ({
        id: model.id,
        label: model.name,
        checked: model.id === props.snapshot?.selectedModelId,
        selection: 'radio',
      })),
    },
  ])
  const modelTriggerLabel = computed(() => {
    if (selectedModel.value) return selectedModel.value.name
    return props.modelsLoading ? text.value.loadingModels : text.value.modelPlaceholder
  })
  const reasoningGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'reasoning',
      label: '',
      items: (selectedModel.value?.reasoningEfforts ?? []).map((effort) => ({
        id: effort,
        label: effort,
        selection: 'radio',
        checked: effort === props.snapshot?.reasoningEffort,
      })),
    },
  ])
  /** 模式色点：Plan 只读分析用危险色，Build 会改动图表用成功色。 */
  const MODE_DOT: Record<AgentRunMode, string> = {
    plan: 'var(--klc-color-ui-danger)',
    build: 'var(--klc-color-ui-success)',
  }
  const modeLabel = computed(() =>
    props.mode === 'plan' ? text.value.planMode : text.value.buildMode,
  )
  const modeMenuLabel = computed(() => `${text.value.mode}: ${modeLabel.value}`)
  const modeGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'mode',
      label: '',
      items: [
        {
          id: 'plan',
          label: text.value.planMode,
          dot: MODE_DOT.plan,
          checked: props.mode === 'plan',
          selection: 'radio',
        },
        {
          id: 'build',
          label: text.value.buildMode,
          dot: MODE_DOT.build,
          checked: props.mode === 'build',
          selection: 'radio',
        },
      ],
    },
  ])
  /** 模式 id 只可能来自本组菜单的两个取值，其余值忽略。 */
  function selectMode(_groupId: string, value: string): void {
    if (value === 'plan' || value === 'build') emit('mode-change', value)
  }
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

  /* BaseTextarea 负责自增高（field-sizing）与无拖拽手柄；这里只定制外观。
     覆盖必须带父类：primitive 默认值同为无层的单类规则，只靠加载顺序会翻转。 */
  .composer__input .composer__textarea {
    --base-textarea-padding-block: var(--composer-inset);
    --base-textarea-border: 0px;

    padding: var(--composer-inset);
    border: 0;
    border-radius: var(--agent-control-radius, 8px);
    color: var(--klc-color-ui-text);
    background: transparent;
    font-size: var(--klc-text-copy-13-font-size, 13px);
    line-height: 1.5;
  }

  .composer__footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 var(--composer-inset) var(--composer-inset);
  }

  .composer__meta {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .composer__model,
  .composer__reasoning,
  .composer__mode {
    --control-button-height: 26px;
    --control-button-inline-padding: calc(var(--klc-space-8, 8px) + var(--klc-space-2, 2px));
    --control-button-radius: var(--klc-radius-md, 8px);
    --control-button-font-size: var(--klc-text-11-mono-font-size, 11px);
    --control-button-active-background: var(--klc-color-ui-hover);
    --control-button-focus-shadow: none;
    --control-button-max-width: 160px;

    min-width: 0;
  }

  .composer__reasoning {
    --control-button-color: var(--klc-color-ui-text);
    --control-button-active-background: var(--klc-color-agent-composer-control-hover);
    --control-button-focus-background: var(--klc-color-agent-composer-control-hover);
    --control-button-focus-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-ui-focus) 24%, transparent);
    --control-button-disabled-opacity: 1;
    --control-button-disabled-color: var(--klc-color-ui-text-soft);
  }

  .composer__trigger-chevron {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    color: var(--klc-color-ui-muted);
    transition: transform var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .composer__trigger-chevron.is-open {
    transform: rotate(180deg);
  }

  .composer__reasoning-value,
  .composer__mode-value {
    min-width: 0;
    overflow: hidden;
    color: var(--klc-color-ui-text);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer__primary--stop {
    --base-icon-button-background: var(--klc-color-ui-danger);
    --base-icon-button-hover-bg: var(--klc-color-ui-danger);
  }
</style>
