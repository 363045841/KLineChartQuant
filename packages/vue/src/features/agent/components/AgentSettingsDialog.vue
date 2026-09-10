<template>
  <BaseModal
    :show="providerSettings.open"
    :title="text.agentSettings"
    width="min(92vw, 480px)"
    max-height="calc(100vh - 36px)"
    body-padding="12px 20px 16px"
    @close="closeProviderSettings()"
  >
    <form
      id="agent-provider-settings-form"
      class="provider-form"
      autocomplete="off"
      novalidate
      @submit.prevent="providerSettings.saveProvider()"
    >
      <div class="agent-settings-body">
        <CollapsibleSection
          :label="text.providerSettings"
          :expanded="expandedSections.provider"
          @toggle="toggleSection('provider')"
        >
          <div class="agent-settings-section__body provider-form__fields">
            <label class="provider-field">
              <span class="provider-field__label">{{ text.providerProfile }}</span>
              <span class="provider-profile-control">
                <Dropdown
                  class="provider-profile-dropdown"
                  :model-value="providerSettings.profileName"
                  :options="profileOptions"
                  @update:model-value="selectProfile($event)"
                />
                <button
                  type="button"
                  class="provider-profile-new-button"
                  :title="text.newProviderProfile"
                  :aria-label="text.newProviderProfile"
                  @click="openCreateProfileDialog()"
                >
                  <IconPlus aria-hidden="true" />
                </button>
              </span>
            </label>
            <label class="provider-field">
              <span class="provider-field__label">{{ text.apiProtocol }}</span>
              <Dropdown
                :model-value="providerSettings.protocol"
                :options="protocolOptions"
                class="provider-protocol-control"
                @update:model-value="providerSettings.setProtocol($event)"
              />
            </label>
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
              <span class="provider-field__label">{{ text.additionalHeaders }}</span>
              <textarea
                v-model="providerSettings.headers"
                rows="4"
                spellcheck="false"
                :placeholder="text.additionalHeadersPlaceholder"
              />
            </label>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          :label="text.tools"
          :expanded="expandedSections.tools"
          @toggle="toggleSection('tools')"
        >
          <div class="agent-settings-section__body">
            <div v-if="providerSettings.tools.length" class="agent-tools">
              <section v-for="tool in providerSettings.tools" :key="tool.name" class="agent-tool">
                <label class="agent-tool__toggle">
                  <input
                    type="checkbox"
                    :checked="tool.enabled"
                    :disabled="tool.available === false"
                    @change="setToolEnabled(tool.name, $event)"
                  />
                  <span>
                    <strong>{{ tool.label }}</strong>
                    <small>{{ tool.description }}</small>
                  </span>
                </label>
                <p v-if="tool.unavailableReason" class="agent-tool__unavailable">
                  {{ tool.unavailableReason }}
                </p>
                <label v-if="tool.name === 'web_search'" class="provider-field">
                  <span class="provider-field__label">{{ text.exaApiKey }}</span>
                  <input
                    v-model="providerSettings.exaApiKey"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="tool.available ? '••••••••' : text.exaApiKeyPlaceholder"
                  />
                </label>
                <details class="agent-tool__parameters">
                  <summary>{{ text.toolParameters }}</summary>
                  <textarea
                    :value="providerSettings.toolInputs[tool.name] ?? '{}'"
                    spellcheck="false"
                    @input="setToolInput(tool.name, $event)"
                  />
                </details>
                <button
                  type="button"
                  class="agent-tool__run"
                  :disabled="
                    !tool.enabled ||
                    tool.available === false ||
                    providerSettings.runningToolName !== null
                  "
                  @click="providerSettings.debugTool(tool.name)"
                >
                  {{
                    providerSettings.runningToolName === tool.name ? text.toolRunning : text.toolRun
                  }}
                </button>
                <p
                  v-if="providerSettings.toolErrors[tool.name]"
                  class="agent-tool__error"
                  role="alert"
                >
                  {{ providerSettings.toolErrors[tool.name] }}
                </p>
                <pre v-if="providerSettings.toolResults[tool.name]" class="agent-tool__result">{{
                  providerSettings.toolResults[tool.name].content
                }}</pre>
              </section>
            </div>
            <p v-else class="agent-tools__empty">{{ text.noTools }}</p>
          </div>
        </CollapsibleSection>
      </div>

      <div v-if="visibleError" class="provider-error" role="alert">
        <IconAlertTriangle aria-hidden="true" />
        <span>
          <strong>{{ visibleError.message }}</strong>
          <small v-if="visibleError.providerCode">{{ visibleError.providerCode }}</small>
          <small v-if="visibleError.raw" class="provider-error__raw">{{ visibleError.raw }}</small>
          <small v-if="visibleError.recommendedAction">
            {{ visibleError.recommendedAction }}
          </small>
        </span>
      </div>
    </form>

    <template #footer>
      <div class="provider-actions">
        <button type="submit" form="agent-provider-settings-form" class="provider-primary-button">
          {{ text.confirm }}
        </button>
      </div>
    </template>
  </BaseModal>

  <BaseModal
    :show="creatingProfile"
    :title="text.newProviderProfile"
    width="min(92vw, 360px)"
    :z-index="1100"
    @close="closeCreateProfileDialog()"
  >
    <form id="agent-provider-profile-form" @submit.prevent="createProfile()">
      <label class="provider-field">
        <span class="provider-field__label">{{ text.providerProfileName }}</span>
        <input ref="profileNameInput" v-model="newProfileName" type="text" autocomplete="off" />
      </label>
    </form>

    <template #footer>
      <div class="provider-actions">
        <button type="button" class="provider-secondary-button" @click="closeCreateProfileDialog()">
          {{ text.cancel }}
        </button>
        <button
          type="submit"
          form="agent-provider-profile-form"
          class="provider-primary-button"
          :disabled="!newProfileName.trim()"
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
  import Dropdown from '../../../components/Dropdown.vue'
  import CollapsibleSection from '../../../components/common/CollapsibleSection.vue'
  import {
    PROVIDER_API_PROTOCOLS,
    type ProviderApiProtocol,
    type ProviderStatusView,
  } from '../agent-contracts'
  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { AgentProviderSettingsStore } from '../agent-provider-settings-store'

  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconPlus from '~icons/tabler/plus'

  const props = defineProps<{
    providerSettings: AgentProviderSettingsStore
    status: ProviderStatusView
    locale: AgentLocale
  }>()

  const profileNameInput = ref<HTMLInputElement | null>(null)
  const creatingProfile = ref(false)
  const newProfileName = ref('')
  type SettingsSectionId = 'provider' | 'tools'

  /** 创建每次打开设置面板时使用的默认折叠状态。 */
  function createDefaultExpandedSections(): Record<SettingsSectionId, boolean> {
    return {
      provider: false,
      tools: false,
    }
  }

  const expandedSections = ref(createDefaultExpandedSections())
  const text = computed(() => getAgentCopy(props.locale))
  const visibleError = computed(() => props.providerSettings.operationError ?? props.status.error)
  const protocolOptions = computed(() =>
    PROVIDER_API_PROTOCOLS.map((protocol) => ({ value: protocol, label: protocolLabel(protocol) })),
  )
  const profileOptions = computed(() => {
    const profiles = props.providerSettings.profiles.map((profile) => ({
      value: profile.name,
      label: profile.name,
    }))
    const isNewProfile =
      props.providerSettings.profileName &&
      !profiles.some((profile) => profile.value === props.providerSettings.profileName)
    return isNewProfile
      ? [
          { value: props.providerSettings.profileName, label: props.providerSettings.profileName },
          ...profiles,
        ]
      : profiles
  })

  /** 切换指定设置分组的展开状态。 */
  function toggleSection(id: SettingsSectionId): void {
    expandedSections.value = {
      ...expandedSections.value,
      [id]: !expandedSections.value[id],
    }
  }

  /** 返回协议选择器的本地化名称。 */
  function protocolLabel(protocol: ProviderApiProtocol): string {
    return {
      'openai-completions': text.value.openAiCompletions,
      'openai-responses': text.value.openAiResponses,
    }[protocol]
  }

  /** 将复选框事件转换为持久化的工具启用设置。 */
  function setToolEnabled(name: string, event: Event): void {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    void props.providerSettings.setToolEnabled(name, target.checked)
  }

  /** 保存当前工具的 JSON 参数草稿。 */
  function setToolInput(name: string, event: Event): void {
    const target = event.target
    if (!(target instanceof HTMLTextAreaElement)) return
    props.providerSettings.setToolInput(name, target.value)
  }

  /** 切换到选择的已保存配置。 */
  function selectProfile(id: string): void {
    if (id) void props.providerSettings.selectProfile(id)
  }

  /** 打开配置命名弹窗。 */
  function openCreateProfileDialog(): void {
    newProfileName.value = ''
    creatingProfile.value = true
    void nextTick(() => profileNameInput.value?.focus())
  }

  /** 关闭配置命名弹窗并清空临时名称。 */
  function closeCreateProfileDialog(): void {
    creatingProfile.value = false
    newProfileName.value = ''
  }

  /** 确认名称后创建新的配置草稿。 */
  function createProfile(): void {
    if (!newProfileName.value.trim()) return
    void props.providerSettings.createProfile(newProfileName.value).then((created) => {
      if (created) closeCreateProfileDialog()
    })
  }

  /** 关闭主设置时一并关闭配置命名弹窗。 */
  function closeProviderSettings(): void {
    closeCreateProfileDialog()
    props.providerSettings.close()
  }

  watch(
    () => props.providerSettings.open,
    (open) => {
      if (!open) return
      expandedSections.value = createDefaultExpandedSections()
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

  .agent-settings-body {
    display: flex;
    flex-direction: column;
  }

  .agent-settings-section__body {
    padding: 4px 12px 12px;
  }

  .agent-tools {
    display: grid;
    gap: 8px;
  }

  .agent-tool {
    display: grid;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--klc-color-grid-major);
    border-radius: 6px;
  }

  .agent-tool__toggle {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    cursor: pointer;
  }

  .agent-tool__toggle input {
    margin: 3px 0 0;
  }

  .agent-tool__toggle span {
    display: grid;
    gap: 2px;
  }

  .agent-tool__toggle strong {
    color: var(--klc-color-foreground);
    font-size: 12px;
    font-weight: 500;
  }

  .agent-tool__toggle small,
  .agent-tools__empty {
    color: var(--klc-color-axis-text);
    font-size: 11px;
    line-height: 1.35;
  }

  .agent-tool__parameters {
    display: grid;
    gap: 4px;
    color: var(--klc-color-axis-text);
    font-size: 11px;
  }

  .agent-tool__parameters summary {
    cursor: pointer;
  }

  .agent-tool__parameters textarea,
  .agent-tool__result {
    box-sizing: border-box;
    width: 100%;
    min-height: 74px;
    margin: 0;
    padding: 8px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 4px;
    color: var(--klc-color-foreground);
    background: var(--klc-color-background);
    font:
      11px/1.4 ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .agent-tool__run {
    justify-self: start;
    padding: 5px 10px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 4px;
    color: var(--klc-color-foreground);
    background: var(--klc-color-background);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
  }

  .agent-tool__run:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .agent-tool__error {
    margin: 0;
    color: var(--klc-color-agent-error);
    font-size: 11px;
  }

  .agent-tool__unavailable {
    margin: 0;
    color: var(--klc-color-axis-text);
    font-size: 11px;
  }

  .agent-tools__empty {
    margin: 0;
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
  .provider-field textarea,
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
  .provider-field textarea:focus,
  .provider-field select:focus {
    border-color: var(--klc-color-axis-text);
  }

  .provider-field input::placeholder {
    color: var(--klc-color-axis-text);
    opacity: 0.55;
  }

  .provider-field textarea {
    min-height: 76px;
    padding: 8px 10px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    line-height: 1.4;
  }

  .provider-protocol-control {
    width: 100%;
  }

  .provider-model-dropdown {
    width: 100%;
  }

  .provider-protocol-control :deep(.dropdown__trigger) {
    width: 100%;
    height: 34px;
    box-sizing: border-box;
    padding: 0 10px;
    border-radius: 6px;
  }

  .provider-protocol-control :deep(.dropdown__value),
  .provider-profile-dropdown :deep(.dropdown__value) {
    font-size: 12px;
    font-weight: 400;
  }

  .provider-profile-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    gap: 8px;
  }

  .provider-profile-dropdown {
    min-width: 0;
  }

  .provider-profile-dropdown :deep(.dropdown__trigger) {
    width: 100%;
    height: 34px;
    box-sizing: border-box;
    padding: 0 10px;
    border-radius: 6px;
  }

  .provider-profile-new-button,
  .provider-secondary-button,
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

  .provider-profile-new-button {
    width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 6px;
    color: var(--klc-color-axis-text);
    background: var(--klc-color-background);
  }

  .provider-profile-new-button:hover:not(:disabled) {
    border-color: var(--klc-color-axis-line);
    color: var(--klc-color-foreground);
    background: var(--klc-color-tag-bg-hover);
  }

  .provider-primary-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .provider-secondary-button {
    padding: 0 12px;
    border-radius: 6px;
    color: var(--klc-color-axis-text);
    background: var(--klc-color-background);
  }

  .provider-secondary-button:hover {
    border-color: var(--klc-color-axis-line);
    color: var(--klc-color-foreground);
    background: var(--klc-color-tag-bg-hover);
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
</style>
