<template>
  <BaseModal
    :show="providerSettings.open"
    :title="text.settings"
    width="min(92vw, 760px)"
    max-height="calc(100vh - 36px)"
    body-padding="12px 20px 16px"
    :body-scrollable="false"
    @close="closeProviderSettings()"
  >
    <template #tabs>
      <BaseTabs v-model="activeTab" :tabs="agentTabs" :aria-label="text.settings" />
    </template>

    <div class="provider-form agent-settings-selects">
      <div class="agent-settings-body">
        <section v-if="activeTab === 'interface'" class="agent-settings-interface" role="tabpanel">
          <div class="settings-item">
            <span>{{ text.language }}</span>
            <Dropdown
              :model-value="locale"
              :options="languageOptions"
              :title="text.language"
              size="sm"
              min-width="120px"
              @update:model-value="setLocale($event)"
            />
          </div>
          <div class="settings-item">
            <span>{{ text.collapseReasoning }}</span>
            <ToggleSwitch
              :model-value="collapseReasoning"
              :aria-label="text.collapseReasoning"
              @update:model-value="emit('update:collapseReasoning', $event)"
            />
          </div>
        </section>

        <section
          v-else-if="activeTab === 'provider'"
          class="provider-settings-layout"
          role="tabpanel"
        >
          <aside class="provider-settings-profiles">
            <div class="provider-settings-profiles__header">
              <span>{{ text.providerProfile }}</span>
            </div>
            <div
              v-for="profile in profileOptions"
              :key="profile.value"
              class="provider-settings-profile"
              :class="{
                'is-active': profile.value === providerSettings.profileName,
                'is-editing': renamingProfile === profile.value || deletingProfile === profile.value,
              }"
            >
              <!-- 行内重命名（替代设置弹窗上再叠一层命名弹窗）。 -->
              <form
                v-if="profileNameMode === 'rename' && renamingProfile === profile.value"
                class="provider-profile-inline"
                @submit.prevent="submitProfileName()"
              >
                <input
                  ref="profileNameInput"
                  v-model="profileNameDraft"
                  type="text"
                  autocomplete="off"
                  :aria-label="text.providerProfileName"
                  :aria-invalid="profileNameDialogError ? 'true' : undefined"
                  @keydown.escape.stop.prevent="closeProfileNameDialog()"
                />
              </form>

              <!-- 删除会移除凭据与模型池，不可恢复：行内确认并说明后果。 -->
              <div
                v-else-if="deletingProfile === profile.value"
                class="provider-profile-confirm"
                role="group"
                :aria-label="text.deleteProviderProfile"
                @keydown.escape.stop.prevent="cancelRemoveProfile()"
              >
                <span>{{ text.deleteProviderProfileConfirm }}</span>
                <div class="provider-profile-confirm__actions">
                  <button
                    ref="deleteCancelButton"
                    type="button"
                    class="provider-profile-text-button"
                    @click="cancelRemoveProfile()"
                  >
                    {{ text.cancel }}
                  </button>
                  <button
                    type="button"
                    class="provider-profile-text-button provider-profile-text-button--danger"
                    @click="confirmRemoveProfile(profile.value)"
                  >
                    {{ text.deleteProviderProfile }}
                  </button>
                </div>
              </div>

              <template v-else>
                <button
                  type="button"
                  class="provider-settings-profile__select"
                  @click="selectProfile(profile.value)"
                >
                  {{ profile.label }}
                </button>
                <span
                  v-if="persistedProfileNames.has(profile.value)"
                  class="provider-settings-profile__actions"
                >
                  <BaseTooltip :content="text.renameProviderProfile" placement="top">
                    <button
                      type="button"
                      class="provider-settings-profile__action"
                      :aria-label="`${text.renameProviderProfile}: ${profile.label}`"
                      @click.stop="openRenameProfileDialog(profile.value)"
                    >
                      <IconPencil aria-hidden="true" />
                    </button>
                  </BaseTooltip>
                  <BaseTooltip :content="text.deleteProviderProfile" placement="top">
                    <button
                      type="button"
                      class="provider-settings-profile__action provider-settings-profile__action--danger"
                      :aria-label="`${text.deleteProviderProfile}: ${profile.label}`"
                      @click.stop="removeProfile(profile.value)"
                    >
                      <IconTrash aria-hidden="true" />
                    </button>
                  </BaseTooltip>
                </span>
              </template>
            </div>

            <form
              v-if="profileNameMode === 'create'"
              class="provider-profile-inline provider-profile-inline--create"
              @submit.prevent="submitProfileName()"
            >
              <input
                ref="profileNameInput"
                v-model="profileNameDraft"
                type="text"
                autocomplete="off"
                :placeholder="`${text.providerProfileName}…`"
                :aria-label="text.providerProfileName"
                :aria-invalid="profileNameDialogError ? 'true' : undefined"
                @keydown.escape.stop.prevent="closeProfileNameDialog()"
              />
            </form>
            <button
              v-else
              type="button"
              class="provider-profile-new-button"
              @click="openCreateProfileDialog()"
            >
              <IconPlus aria-hidden="true" />
              <span>{{ text.newProviderProfile }}</span>
            </button>
            <p v-if="profileNameDialogError" class="provider-profile-error" role="alert">
              {{ profileNameDialogError }}
            </p>
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
                  :placeholder="
                    status.configured ? MASKED_SECRET_PLACEHOLDER : text.apiKeyPlaceholder
                  "
                  @blur="providerSettings.persistConnection()"
                />
              </label>
              <label class="provider-field">
                <span class="provider-field__label">{{ text.additionalHeaders }}</span>
                <BaseTextarea
                  v-model="providerSettings.headers"
                  class="provider-field__textarea"
                  size="sm"
                  :min-rows="3"
                  :max-rows="10"
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
                <BaseTooltip :content="text.refreshModels" placement="top">
                  <BaseButton
                    size="sm"
                    class="provider-settings-models__refresh"
                    :aria-label="text.refreshModels"
                    :disabled="providerSettings.modelsLoading || !hasProviderConnection"
                    @click="providerSettings.refreshModelCatalog()"
                  >
                    <IconRefresh aria-hidden="true" />
                  </BaseButton>
                </BaseTooltip>
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
              <div class="agent-tool__toggle">
                <span>
                  <strong>{{ tool.label }}</strong>
                  <small>{{ tool.description }}</small>
                </span>
                <ToggleSwitch
                  :model-value="tool.enabled"
                  :disabled="tool.available === false"
                  :aria-label="tool.label"
                  @update:model-value="setToolEnabled(tool.name, $event)"
                />
              </div>
              <p v-if="tool.unavailableReason" class="agent-tool__unavailable">
                {{ tool.unavailableReason }}
              </p>
              <div v-if="tool.name === 'web_search'" class="provider-field">
                <span class="provider-field__label">{{ text.exaApiKey }}</span>
                <div class="provider-field__control">
                  <input
                    v-model="providerSettings.exaApiKey"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="
                      status.exaConfigured ? MASKED_SECRET_PLACEHOLDER : text.exaApiKeyPlaceholder
                    "
                  />
                  <BaseButton
                    size="sm"
                    class="provider-field__save"
                    :disabled="!providerSettings.exaApiKey.trim()"
                    @click="providerSettings.persistWebSearchApiKey()"
                  >
                    {{ text.save }}
                  </BaseButton>
                </div>
                <small class="provider-field__help">{{ text.exaApiKeyPlaceholder }}</small>
              </div>
              <details class="agent-tool__parameters">
                <summary>{{ text.toolParameters }}</summary>
                <BaseTextarea
                  :model-value="providerSettings.toolInputs[tool.name] ?? '{}'"
                  class="agent-tool__input"
                  size="sm"
                  :min-rows="3"
                  :max-rows="12"
                  spellcheck="false"
                  :aria-label="`${tool.label} ${text.toolParameters}`"
                  @update:model-value="setToolInput(tool.name, $event)"
                />
              </details>
              <BaseButton
                size="sm"
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
              </BaseButton>
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
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconPencil from '~icons/tabler/pencil'
  import IconPlus from '~icons/tabler/plus'
  import IconRefresh from '~icons/tabler/refresh'
  import IconTrash from '~icons/tabler/trash'
  import BaseButton from '../../../components/BaseButton.vue'
  import BaseModal from '../../../components/BaseModal.vue'
  import BaseTabs from '../../../components/BaseTabs.vue'
  import BaseTextarea from '../../../components/common/BaseTextarea.vue'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import ToggleSwitch from '../../../components/common/ToggleSwitch.vue'
  import Dropdown from '../../../components/Dropdown.vue'
  import {
    PROVIDER_API_PROTOCOLS,
    type ProviderApiProtocol,
    type ProviderStatusView,
  } from '../agent-contracts.js'
  import { AGENT_LOCALE_OPTIONS, type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import type { AgentProviderSettingsStore } from '../browser-agent/provider-settings/types.js'

  const props = defineProps<{
    providerSettings: AgentProviderSettingsStore
    status: ProviderStatusView
    locale: AgentLocale
    collapseReasoning: boolean
  }>()

  const emit = defineEmits<{
    'update:locale': [value: AgentLocale]
    'update:collapseReasoning': [value: boolean]
  }>()

  /** 密码型凭据已保存时的掩码占位符；只提示已保存，不承载真实 Key。 */
  const MASKED_SECRET_PLACEHOLDER = '••••••••'

  /** 行内命名输入；v-for 中的 ref 收集为数组，同一时间只渲染一个。 */
  const profileNameInput = useTemplateRef<HTMLInputElement | HTMLInputElement[]>('profileNameInput')
  const deleteCancelButton = useTemplateRef<HTMLButtonElement[]>('deleteCancelButton')
  const profileNameMode = ref<'create' | 'rename' | null>(null)
  const profileNameDraft = ref('')
  const renamingProfile = ref('')
  const deletingProfile = ref('')
  const activeTab = ref<'provider' | 'tools' | 'interface'>('provider')
  const text = computed(() => getAgentCopy(props.locale))
  const languageOptions = computed(() => [...AGENT_LOCALE_OPTIONS])
  const agentTabs = computed<
    ReadonlyArray<{ id: 'provider' | 'tools' | 'interface'; label: string }>
  >(() => [
    { id: 'interface', label: text.value.interface },
    { id: 'provider', label: text.value.providerSettings },
    { id: 'tools', label: text.value.tools },
  ])
  const persistedProfileNames = computed(
    () => new Set(props.providerSettings.profiles.map((profile) => profile.name)),
  )
  const modelSearch = ref('')
  const visibleError = computed(() => props.providerSettings.operationError ?? props.status.error)
  const profileNameDialogError = computed(() =>
    props.providerSettings.profileNameError ? text.value.providerProfileNameDuplicated : '',
  )
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
  /** 当前是否具备可写入/可刷新的 Provider 连接（配置名与 Base URL 均存在）。 */
  const hasProviderConnection = computed(() =>
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

  /** 判断下拉返回的字符串是否为受支持的界面语言。 */
  function isAgentLocale(value: string): value is AgentLocale {
    return AGENT_LOCALE_OPTIONS.some((option) => option.value === value)
  }

  /** 提交界面语言变更，交由上层 Workspace 更新全局 locale。 */
  function setLocale(value: string): void {
    if (isAgentLocale(value)) emit('update:locale', value)
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

  /** 更新工具启用状态。 */
  function setToolEnabled(name: string, enabled: boolean): void {
    void props.providerSettings.setToolEnabled(name, enabled)
  }

  /** 保存当前工具的 JSON 参数草稿。 */
  function setToolInput(name: string, value: string): void {
    props.providerSettings.setToolInput(name, value)
  }

  /** 切换到选择的已保存配置。 */
  function selectProfile(id: string): void {
    if (id) void props.providerSettings.selectProfile(id)
  }

  function focusProfileNameInput(select: boolean): void {
    void nextTick(() => {
      const value = profileNameInput.value
      const input = Array.isArray(value) ? value[0] : value
      input?.focus()
      if (select) input?.select()
    })
  }

  /** 在列表底部展开行内「新建配置」输入。 */
  function openCreateProfileDialog(): void {
    deletingProfile.value = ''
    profileNameDraft.value = ''
    renamingProfile.value = ''
    props.providerSettings.clearProfileNameError()
    profileNameMode.value = 'create'
    focusProfileNameInput(false)
  }

  /** 把目标配置行切换为行内重命名输入并预填当前名称。 */
  function openRenameProfileDialog(name: string): void {
    deletingProfile.value = ''
    profileNameDraft.value = name
    renamingProfile.value = name
    props.providerSettings.clearProfileNameError()
    profileNameMode.value = 'rename'
    focusProfileNameInput(true)
  }

  /** 退出行内命名并清空临时名称。 */
  function closeProfileNameDialog(): void {
    profileNameMode.value = null
    profileNameDraft.value = ''
    renamingProfile.value = ''
    props.providerSettings.clearProfileNameError()
  }

  /** Enter 提交：创建新配置或重命名现有配置；失败时保留输入并显示错误。 */
  function submitProfileName(): void {
    const draft = profileNameDraft.value.trim()
    if (!draft || profileNameMode.value === null) return
    if (profileNameMode.value === 'rename' && draft === renamingProfile.value) {
      closeProfileNameDialog()
      return
    }
    const operation =
      profileNameMode.value === 'rename'
        ? props.providerSettings.renameProfile(renamingProfile.value, draft)
        : props.providerSettings.createProfile(draft)
    void operation.then((succeeded) => {
      if (succeeded) closeProfileNameDialog()
    })
  }

  /** 删除配置会移除凭据，不可恢复：在该行内展开确认，默认聚焦「取消」。 */
  function removeProfile(name: string): void {
    closeProfileNameDialog()
    deletingProfile.value = name
    void nextTick(() => deleteCancelButton.value?.[0]?.focus())
  }

  function cancelRemoveProfile(): void {
    deletingProfile.value = ''
  }

  function confirmRemoveProfile(name: string): void {
    deletingProfile.value = ''
    void props.providerSettings.deleteProfile(name)
  }

  /** 关闭主设置时一并退出行内编辑。 */
  function closeProviderSettings(): void {
    closeProfileNameDialog()
    cancelRemoveProfile()
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

  .agent-settings-tools {
    max-height: min(560px, calc(100vh - 230px));
    overflow-y: auto;
  }

  .agent-settings-interface {
    display: grid;
    gap: 10px;
    padding: 12px;
  }

  .settings-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--klc-color-foreground);
    font-size: 12px;
  }

  .provider-settings-layout {
    width: 100%;
    max-width: 760px;
    min-height: 420px;
    display: grid;
    grid-template-columns: 144px minmax(0, 1fr);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .provider-settings-profiles {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    border-right: 1px solid var(--klc-color-ui-border);
  }

  .provider-settings-profiles__header,
  .provider-settings-models__header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .provider-settings-profiles__header {
    justify-content: space-between;
    padding: 0 4px 6px;
  }

  .provider-settings-profile {
    position: relative;
    min-width: 0;
    display: flex;
    align-items: center;
    border-radius: 5px;
    color: var(--klc-color-ui-muted);
    background: transparent;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .provider-settings-profile:hover,
  .provider-settings-profile:focus-within {
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
  }

  .provider-settings-profile.is-active {
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
    font-weight: 600;
  }

  .provider-settings-profile__select {
    min-width: 0;
    flex: 1 1 auto;
    padding: 7px 10px;
    border: 0;
    border-radius: 5px;
    color: inherit;
    background: transparent;
    font: inherit;
    font-size: 12px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    transition: padding-right 0.15s ease;
  }

  .provider-settings-profile:has(.provider-settings-profile__actions):hover
    .provider-settings-profile__select,
  .provider-settings-profile:has(.provider-settings-profile__actions):focus-within
    .provider-settings-profile__select {
    padding-right: 52px;
  }

  .provider-settings-profile__select:focus-visible {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-ui-accent) 24%, transparent);
    outline: 0;
  }

  .provider-settings-profile__actions {
    position: absolute;
    top: 50%;
    right: 4px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: 6px;
    background: var(--klc-color-ui-hover);
    transform: translateY(-50%);
    visibility: hidden;
  }

  .provider-settings-profile:hover .provider-settings-profile__actions,
  .provider-settings-profile:focus-within .provider-settings-profile__actions {
    visibility: visible;
  }

  .provider-settings-profile__action {
    width: 20px;
    height: 20px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    color: var(--klc-color-ui-muted);
    background: transparent;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }

  .provider-settings-profile__action svg {
    width: 14px;
    height: 14px;
  }

  .provider-settings-profile__action:hover,
  .provider-settings-profile__action:focus-visible {
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-border);
    outline: 0;
  }

  .provider-settings-profile__action--danger:hover,
  .provider-settings-profile__action--danger:focus-visible {
    color: var(--klc-color-ui-danger-text);
  }

  .provider-settings-detail {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
  }

  .provider-settings-connection {
    padding: 12px;
    border-bottom: 1px solid var(--klc-color-ui-border);
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
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    outline: none;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-input);
    font: inherit;
    font-size: 11px;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
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
    border-bottom: 1px solid var(--klc-color-ui-border);
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
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
  }

  .agent-tool__toggle {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
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

  .agent-tool__input {
    font-family: var(--klc-typography-font-family-mono);
  }

  .agent-tool__result {
    box-sizing: border-box;
    width: 100%;
    min-height: 74px;
    margin: 0;
    padding: 8px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 4px;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-input);
    font: 11px/1.4 var(--klc-typography-font-family-mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .agent-tool__run {
    justify-self: start;
    font-size: 12px;
  }

  .provider-settings-models__refresh {
    width: 28px;
    height: 28px;
    padding: 0;
  }

  .provider-settings-models__refresh svg {
    width: 16px;
    height: 16px;
  }

  .agent-tool__error {
    margin: 0;
    color: var(--klc-color-ui-danger-text);
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
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .provider-field__help {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
  }

  .provider-field__control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .provider-field__control input {
    min-width: 0;
    flex: 1 1 auto;
  }

  .provider-field__save {
    flex: 0 0 auto;
    font-size: 12px;
  }

  .provider-field input,
  .provider-field select {
    width: 100%;
    height: 34px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    outline: none;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-input);
    font: inherit;
    font-size: 12px;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .provider-field input:disabled,
  .provider-field select:disabled,
  .provider-settings-models__header input:disabled {
    color: var(--klc-color-ui-muted);
    background: transparent;
    cursor: not-allowed;
  }

  .provider-field input::placeholder,
  .provider-settings-models__header input::placeholder {
    color: var(--klc-color-ui-text-soft);
    opacity: 0.55;
  }

  .provider-field__textarea {
    font-family: var(--klc-typography-font-family-mono);
  }

  .provider-profile-inline {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
  }

  .provider-profile-inline--create {
    margin-top: var(--klc-space-4, 4px);
  }

  .provider-profile-inline input {
    width: 100%;
    min-width: 0;
    height: var(--klc-density-default, 32px);
    box-sizing: border-box;
    padding: 0 var(--klc-space-8, 8px);
    border: 1px solid var(--klc-color-ui-accent);
    border-radius: var(--klc-radius-sm, 6px);
    outline: none;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-input);
    font: inherit;
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .provider-profile-inline input[aria-invalid='true'] {
    border-color: var(--klc-color-ui-danger-text);
  }

  .provider-profile-confirm {
    display: grid;
    gap: var(--klc-space-4, 4px);
    padding: var(--klc-space-8, 8px);
    color: var(--klc-color-ui-text);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: var(--klc-text-12-line-height, 16px);
  }

  .provider-profile-confirm__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--klc-space-4, 4px);
  }

  .provider-profile-text-button {
    height: var(--klc-density-compact, 24px);
    padding: 0 var(--klc-space-8, 8px);
    border: 0;
    border-radius: var(--klc-radius-xs, 4px);
    color: var(--klc-color-ui-text);
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  .provider-profile-text-button:hover,
  .provider-profile-text-button:focus-visible {
    background: var(--klc-color-ui-hover);
  }

  .provider-profile-text-button--danger {
    color: var(--klc-color-ui-danger-text);
    font-weight: 600;
  }

  .provider-settings-profile.is-editing {
    background: var(--klc-color-ui-hover);
  }

  .provider-protocol-control {
    width: 100%;
    --dropdown-trigger-background: var(--klc-color-ui-input);
    --dropdown-trigger-color: var(--klc-color-ui-text);
    --dropdown-trigger-chevron: var(--klc-color-ui-muted);
    --dropdown-trigger-active-border: var(--klc-color-ui-border-strong);
    --dropdown-trigger-active-background: var(--klc-color-ui-hover);
    --dropdown-trigger-focus-border: var(--klc-color-ui-accent);
    --dropdown-trigger-focus-background: var(--klc-color-ui-hover);
    --dropdown-trigger-focus-shadow: 0 0 0 2px
      color-mix(in srgb, var(--klc-color-ui-accent) 24%, transparent);
  }

  .provider-model-dropdown {
    width: 100%;
  }

  .provider-protocol-control :deep(.dropdown__trigger) {
    width: 100%;
    box-sizing: border-box;
  }

  .provider-protocol-control :deep(.dropdown__value),
  .provider-profile-dropdown :deep(.dropdown__value) {
    font-size: 11px;
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
    box-sizing: border-box;
  }

  .provider-profile-new-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--klc-color-ui-border);
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
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-input);
  }

  .provider-profile-new-button:hover:not(:disabled) {
    border-color: var(--klc-color-ui-border-strong);
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
  }

  .provider-error {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    color: var(--klc-color-ui-danger-text);
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

  .provider-profile-error {
    margin: 8px 0 0;
    color: var(--klc-color-ui-danger-text);
    font-size: 11px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  @media (max-width: 640px) {
    .provider-settings-layout {
      grid-template-columns: 1fr;
    }

    .provider-settings-profiles {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border-right: 0;
      border-bottom: 1px solid var(--klc-color-ui-border);
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
<style src="./agent-select-trigger.css"></style>
