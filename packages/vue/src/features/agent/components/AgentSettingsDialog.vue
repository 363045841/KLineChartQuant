<template>
  <BaseModal
    :show="providerSettings.open"
    :title="text.agentSettings"
    width="min(92vw, 760px)"
    max-height="calc(100vh - 36px)"
    body-padding="12px 20px 16px"
    :body-scrollable="false"
    @close="closeProviderSettings()"
  >
    <template #tabs>
      <nav class="agent-settings-tabs" role="tablist" :aria-label="text.agentSettings">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'provider'"
          :class="{ 'is-active': activeTab === 'provider' }"
          @click="activeTab = 'provider'"
        >
          {{ text.providerSettings }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'tools'"
          :class="{ 'is-active': activeTab === 'tools' }"
          @click="activeTab = 'tools'"
        >
          {{ text.tools }}
        </button>
      </nav>
    </template>

    <div class="provider-form">
      <div class="agent-settings-body">
        <section v-if="activeTab === 'provider'" class="provider-settings-layout" role="tabpanel">
          <aside class="provider-settings-profiles">
            <div class="provider-settings-profiles__header">
              <span>{{ text.providerProfile }}</span>
            </div>
            <button
              v-for="profile in profileOptions"
              :key="profile.value"
              type="button"
              class="provider-settings-profile"
              :class="{ 'is-active': profile.value === providerSettings.profileName }"
              @click="selectProfile(profile.value)"
            >
              {{ profile.label }}
            </button>
            <button
              type="button"
              class="provider-profile-new-button"
              :title="text.addModel"
              :aria-label="text.addModel"
              @click="openCreateProfileDialog()"
            >
              <IconPlus aria-hidden="true" />
              <span>{{ text.addModel }}</span>
            </button>
          </aside>

          <div class="provider-settings-detail">
            <section class="provider-settings-connection provider-form__fields">
              <label class="provider-field">
                <span class="provider-field__label">{{ text.apiProtocol }}</span>
                <Dropdown
                  :model-value="providerSettings.protocol"
                  :options="protocolOptions"
                  class="provider-protocol-control"
                  @update:model-value="updateProtocol($event)"
                />
              </label>
              <label class="provider-field">
                <span class="provider-field__label">{{ text.baseUrl }}</span>
                <input
                  v-model="providerSettings.baseUrl"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  @blur="providerSettings.persistConnection()"
                />
              </label>
              <label class="provider-field">
                <span class="provider-field__label">{{ text.apiKey }}</span>
                <input
                  v-model="providerSettings.apiKey"
                  type="password"
                  autocomplete="new-password"
                  :placeholder="status.configured ? '••••••••' : text.apiKeyPlaceholder"
                  @blur="providerSettings.persistConnection()"
                />
              </label>
              <label class="provider-field">
                <span class="provider-field__label">{{ text.additionalHeaders }}</span>
                <textarea
                  v-model="providerSettings.headers"
                  rows="4"
                  spellcheck="false"
                  :placeholder="text.additionalHeadersPlaceholder"
                  @blur="providerSettings.persistConnection()"
                />
              </label>
            </section>

            <section class="provider-settings-models">
              <div class="provider-settings-models__header">
                <span>{{ text.modelList }}</span>
                <input
                  v-model="modelSearch"
                  type="search"
                  :placeholder="text.modelSearchPlaceholder"
                  :disabled="providerSettings.modelsLoading"
                />
                <button
                  type="button"
                  class="agent-tool__run provider-settings-models__refresh"
                  :title="text.refreshModels"
                  :aria-label="text.refreshModels"
                  :disabled="providerSettings.modelsLoading || !canRefreshModels"
                  @click="providerSettings.refreshModelCatalog()"
                >
                  <IconRefresh aria-hidden="true" />
                </button>
              </div>
              <div
                v-if="providerSettings.modelCatalog.length"
                class="provider-settings-models__list"
              >
                <div
                  v-for="model in filteredModels"
                  :key="model.id"
                  class="provider-settings-model"
                >
                  <span>{{ model.name }}</span>
                  <div class="provider-settings-model__actions">
                    <small v-if="model.contextWindow">{{
                      formatContextWindow(model.contextWindow)
                    }}</small>
                    <ToggleSwitch
                      :model-value="modelPoolIds.has(model.id)"
                      :aria-label="text.modelPool"
                      size="compact"
                      @update:model-value="setModelPoolMembership(model.id, $event)"
                    />
                  </div>
                </div>
              </div>
              <p v-else class="agent-tools__empty">{{ text.noModelsInPool }}</p>
            </section>
          </div>
        </section>

        <section v-else class="agent-settings-tools" role="tabpanel">
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
        </section>
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
    </div>
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
  import ToggleSwitch from '../../../components/common/ToggleSwitch.vue'
  import {
    PROVIDER_API_PROTOCOLS,
    type ProviderApiProtocol,
    type ProviderStatusView,
  } from '../agent-contracts'
  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { AgentProviderSettingsStore } from '../agent-provider-settings-store'

  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconPlus from '~icons/tabler/plus'
  import IconRefresh from '~icons/tabler/refresh'

  const props = defineProps<{
    providerSettings: AgentProviderSettingsStore
    status: ProviderStatusView
    locale: AgentLocale
  }>()

  const profileNameInput = ref<HTMLInputElement | null>(null)
  const creatingProfile = ref(false)
  const newProfileName = ref('')
  const activeTab = ref<'provider' | 'tools'>('provider')
  const text = computed(() => getAgentCopy(props.locale))
  const modelSearch = ref('')
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
  const modelPoolIds = computed(
    () => new Set(props.providerSettings.modelPool.map((model) => model.id)),
  )
  const filteredModels = computed(() => {
    const query = modelSearch.value.trim().toLowerCase()
    if (!query) return props.providerSettings.modelCatalog
    return props.providerSettings.modelCatalog.filter((model) =>
      model.name.toLowerCase().includes(query),
    )
  })
  const canRefreshModels = computed(() =>
    Boolean(props.providerSettings.profileName && props.providerSettings.baseUrl.trim()),
  )

  /** 返回协议选择器的本地化名称。 */
  function protocolLabel(protocol: ProviderApiProtocol): string {
    return {
      'openai-completions': text.value.openAiCompletions,
      'openai-responses': text.value.openAiResponses,
    }[protocol]
  }

  /** 更新协议并立即保存连接，避免协议草稿与已保存连接不一致。 */
  function updateProtocol(value: string): void {
    props.providerSettings.setProtocol(value)
    void props.providerSettings.persistConnection()
  }

  /** 将模型声明的上下文窗口格式化为紧凑标签。 */
  function formatContextWindow(value: number): string {
    if (props.locale === 'zh-CN') {
      const tenThousands = value / 10_000
      const window = value >= 10_000 ? tenThousands.toFixed(1).replace(/\.0$/, '') : String(value)
      return `${window} 万`
    }
    const thousands = value / 1_000
    const window =
      value >= 1_000
        ? `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`
        : String(value)
    return `${text.value.contextWindow} ${window}`
  }

  /** 更新模型是否属于当前 Provider 的模型池。 */
  function setModelPoolMembership(modelId: string, enabled: boolean): void {
    void props.providerSettings.setModelPoolMembership(modelId, enabled)
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
      activeTab.value = 'provider'
    },
  )
</script>

<style scoped>
  .provider-form {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: var(--klc-color-foreground);
  }

  .provider-form__fields {
    display: grid;
    gap: 12px;
  }

  .agent-settings-body {
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .agent-settings-tabs {
    display: flex;
    gap: 2px;
    padding: 0 20px;
    border-bottom: 1px solid var(--klc-color-grid-major);
    background: var(--klc-color-background);
  }

  .agent-settings-tabs button {
    padding: 8px 10px;
    border: 0;
    border-bottom: 2px solid transparent;
    color: var(--klc-color-axis-text);
    background: transparent;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .agent-settings-tabs button:hover,
  .agent-settings-tabs button:focus-visible {
    color: var(--klc-color-foreground);
    outline: 0;
  }

  .agent-settings-tabs button.is-active {
    border-bottom-color: var(--klc-color-selection-stroke);
    color: var(--klc-color-foreground);
    font-weight: 600;
  }

  .agent-settings-tools {
    max-height: min(560px, calc(100vh - 230px));
    overflow-y: auto;
  }

  .provider-settings-layout {
    width: 100%;
    max-width: 760px;
    min-height: 420px;
    display: grid;
    grid-template-columns: 144px minmax(0, 1fr);
    border: 1px solid var(--klc-color-grid-major);
    border-radius: 8px;
    overflow: hidden;
  }

  .provider-settings-profiles {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    border-right: 1px solid var(--klc-color-grid-major);
    background: var(--klc-color-grid-minor);
  }

  .provider-settings-profiles__header,
  .provider-settings-models__header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--klc-color-axis-text);
    font-size: 11px;
    font-weight: 500;
  }

  .provider-settings-profiles__header {
    justify-content: space-between;
    padding: 0 4px 6px;
  }

  .provider-settings-profile {
    min-width: 0;
    padding: 7px 8px;
    border: 0;
    border-radius: 5px;
    color: var(--klc-color-foreground);
    background: transparent;
    font: inherit;
    font-size: 12px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .provider-settings-profile:hover,
  .provider-settings-profile:focus-visible {
    background: var(--klc-color-tag-bg-hover);
    outline: 0;
  }

  .provider-settings-profile.is-active {
    background: var(--klc-color-background);
    font-weight: 600;
  }

  .provider-settings-detail {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
  }

  .provider-settings-connection {
    padding: 12px;
    border-bottom: 1px solid var(--klc-color-grid-major);
  }

  .provider-settings-models {
    width: 100%;
    max-width: 760px;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    padding: 12px;
  }

  .provider-settings-models__header input {
    min-width: 0;
    height: 28px;
    flex: 1 1 auto;
    padding: 0 8px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 5px;
    outline: none;
    color: var(--klc-color-foreground);
    background: var(--klc-color-background);
    font: inherit;
    font-size: 11px;
  }

  .provider-settings-models__list {
    max-height: 240px;
    min-height: 0;
    display: grid;
    align-content: start;
    overflow-y: auto;
  }

  .provider-settings-model {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 4px 6px 8px;
    border-bottom: 1px solid var(--klc-color-grid-minor);
    color: var(--klc-color-foreground);
    font-size: 12px;
  }

  .provider-settings-model span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .provider-settings-model__actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .provider-settings-model__actions small {
    color: var(--klc-color-axis-text);
    font-size: 11px;
    white-space: nowrap;
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

  .provider-settings-models__refresh {
    width: 28px;
    height: 28px;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    padding: 5px;
    border-radius: 6px;
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
    font-size: 12px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s,
      opacity 0.15s;
  }

  .provider-profile-new-button {
    margin-top: auto;
    width: 100%;
    height: 28px;
    box-sizing: border-box;
    padding: 0 8px;
    border: 0;
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

  @media (max-width: 640px) {
    .provider-settings-layout {
      grid-template-columns: 1fr;
    }

    .provider-settings-profiles {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border-right: 0;
      border-bottom: 1px solid var(--klc-color-grid-major);
    }

    .provider-settings-profiles__header {
      grid-column: 1 / -1;
    }

    .provider-settings-models__header {
      flex-wrap: wrap;
    }

    .provider-settings-models__header input {
      min-width: 120px;
    }
  }
</style>
