<template>
  <BaseModal
    :open="providerSettings.open"
    :title="text.settings"
    width="min(92vw, 780px)"
    max-height="calc(100vh - 36px)"
    body-padding="12px 20px 20px"
    :body-scrollable="false"
    @update:open="!$event && closeProviderSettings()"
  >
    <template #tabs>
      <BaseTabs v-model="activeTab" :tabs="agentTabs" :aria-label="text.settings" />
    </template>

    <div class="settings agent-settings-selects">
      <div class="settings__body">
        <!-- ───────────── Provider ───────────── -->
        <section
          v-if="activeTab === 'provider'"
          class="provider"
          role="tabpanel"
        >
          <aside class="provider__rail" :aria-label="text.providerProfile">
            <header class="rail__title">{{ text.providerProfile }}</header>

            <ul class="rail__list">
              <li
                v-for="profile in profileOptions"
                :key="profile.value"
                class="rail__item"
                :class="{
                  'is-active': profile.value === providerSettings.profileName,
                  'is-editing':
                    renamingProfile === profile.value || deletingProfile === profile.value,
                }"
              >
                <!-- 行内重命名 -->
                <form
                  v-if="profileNameMode === 'rename' && renamingProfile === profile.value"
                  class="rail__inline"
                  @submit.prevent="submitProfileName()"
                >
                  <input
                    ref="profileNameInput"
                    class="form-control-inline-name"
                    v-model="profileNameDraft"
                    type="text"
                    autocomplete="off"
                    :aria-label="text.providerProfileName"
                    :aria-invalid="profileNameDialogError ? 'true' : undefined"
                    @keydown.escape.stop.prevent="closeProfileNameDialog()"
                  />
                  <BaseTooltip :content="text.save" placement="top">
                    <button
                      type="submit"
                      class="rail__inline-save"
                      :aria-label="text.save"
                      :disabled="!profileNameDraft.trim()"
                    >
                      <IconCheck aria-hidden="true" />
                    </button>
                  </BaseTooltip>
                </form>

                <!-- 删除确认：会移除凭据与模型池，不可恢复 -->
                <div
                  v-else-if="deletingProfile === profile.value"
                  class="rail__confirm"
                  role="group"
                  :aria-label="text.deleteProviderProfile"
                  @keydown.escape.stop.prevent="cancelRemoveProfile()"
                >
                  <p>{{ text.deleteProviderProfileConfirm }}</p>
                  <div class="rail__confirm-actions">
                    <button
                      ref="deleteCancelButton"
                      type="button"
                      class="text-button"
                      @click="cancelRemoveProfile()"
                    >
                      {{ text.cancel }}
                    </button>
                    <button
                      type="button"
                      class="text-button text-button--danger"
                      @click="confirmRemoveProfile(profile.value)"
                    >
                      {{ text.deleteProviderProfile }}
                    </button>
                  </div>
                </div>

                <template v-else>
                  <button
                    type="button"
                    class="rail__select"
                    :aria-current="profile.value === providerSettings.profileName ? 'true' : undefined"
                    @click="selectProfile(profile.value)"
                  >
                    <span class="rail__name">{{ profile.label }}</span>
                  </button>
                  <span v-if="persistedProfileNames.has(profile.value)" class="rail__actions">
                    <BaseTooltip :content="text.renameProviderProfile" placement="top">
                      <button
                        type="button"
                        class="icon-button"
                        :aria-label="`${text.renameProviderProfile}: ${profile.label}`"
                        @click.stop="openRenameProfileDialog(profile.value)"
                      >
                        <IconPencil aria-hidden="true" />
                      </button>
                    </BaseTooltip>
                    <BaseTooltip :content="text.deleteProviderProfile" placement="top">
                      <button
                        type="button"
                        class="icon-button icon-button--danger"
                        :aria-label="`${text.deleteProviderProfile}: ${profile.label}`"
                        @click.stop="removeProfile(profile.value)"
                      >
                        <IconTrash aria-hidden="true" />
                      </button>
                    </BaseTooltip>
                  </span>
                </template>
              </li>
            </ul>

            <form
              v-if="profileNameMode === 'create'"
              class="rail__inline rail__inline--create"
              @submit.prevent="submitProfileName()"
            >
              <input
                ref="profileNameInput"
                class="form-control-inline-name"
                v-model="profileNameDraft"
                type="text"
                autocomplete="off"
                :placeholder="`${text.providerProfileName}…`"
                :aria-label="text.providerProfileName"
                :aria-invalid="profileNameDialogError ? 'true' : undefined"
                @keydown.escape.stop.prevent="closeProfileNameDialog()"
              />
              <BaseTooltip :content="text.save" placement="top">
                <button
                  type="submit"
                  class="rail__inline-save"
                  :aria-label="text.save"
                  :disabled="!profileNameDraft.trim()"
                >
                  <IconCheck aria-hidden="true" />
                </button>
              </BaseTooltip>
            </form>
            <button v-else type="button" class="rail__new" @click="openCreateProfileDialog()">
              <IconPlus aria-hidden="true" />
              <span>{{ text.newProviderProfile }}</span>
            </button>

            <p v-if="profileNameDialogError" class="rail__error" role="alert">
              {{ profileNameDialogError }}
            </p>
          </aside>

          <div class="provider__detail">
            <!-- 连接 -->
            <section class="card connection">
              <label class="field">
                <span class="field__label">{{ text.apiProtocol }}</span>
                <DropMenu
                  :label="text.apiProtocol"
                  :groups="protocolGroups"
                  class="protocol-control"
                  density="compact"
                  @select="selectProtocol"
                >
                  <template #trigger>
                    <span class="selection-menu__value">{{ selectedProtocolLabel }}</span>
                    <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
                  </template>
                  <template #item-action="{ item }">
                    <span v-if="item.id === providerSettings.protocol" class="drop-menu__status">
                      <IconCheck aria-hidden="true" />
                    </span>
                  </template>
                </DropMenu>
              </label>
              <label class="field">
                <span class="field__label">{{ text.baseUrl }}</span>
                <input
                  class="form-control"
                  v-model="providerSettings.baseUrl"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  @blur="providerSettings.persistConnection()"
                />
              </label>
              <label class="field">
                <span class="field__label">{{ text.apiKey }}</span>
                <input
                  class="form-control"
                  v-model="providerSettings.apiKey"
                  type="password"
                  autocomplete="new-password"
                  :placeholder="
                    status.configured ? MASKED_SECRET_PLACEHOLDER : text.apiKeyPlaceholder
                  "
                  @blur="providerSettings.persistConnection()"
                />
              </label>
              <label class="field">
                <span class="field__label">{{ text.additionalHeaders }}</span>
                <BaseTextarea
                  v-model="providerSettings.headers"
                  class="field__mono"
                  size="sm"
                  :min-rows="3"
                  :max-rows="8"
                  spellcheck="false"
                  :placeholder="text.additionalHeadersPlaceholder"
                  @blur="providerSettings.persistConnection()"
                />
              </label>
            </section>

            <!-- 模型 -->
            <section class="card models">
              <header class="models__header">
                <span class="models__title">
                  {{ text.modelList }}
                  <em class="badge" :title="text.modelPool">{{ modelPoolIds.size }}</em>
                </span>
                <input
                  v-model="modelSearch"
                  class="models__search"
                  type="search"
                  :placeholder="text.modelSearchPlaceholder"
                  :disabled="providerSettings.modelsLoading"
                />
                <BaseTooltip :content="text.refreshModels" placement="top">
                  <BaseButton
                    size="sm"
                    class="models__refresh"
                    :class="{ 'is-loading': providerSettings.modelsLoading }"
                    :aria-label="text.refreshModels"
                    :disabled="providerSettings.modelsLoading || !hasProviderConnection"
                    @click="providerSettings.refreshModelCatalog()"
                  >
                    <IconRefresh aria-hidden="true" />
                  </BaseButton>
                </BaseTooltip>
              </header>

              <ul v-if="providerSettings.modelCatalog.length" class="models__list">
                <li v-for="model in filteredModels" :key="model.id" class="model">
                  <span class="model__name" :title="model.name">{{ model.name }}</span>
                  <span class="model__meta">
                    <small v-if="model.contextWindow" class="chip">
                      {{ formatContextWindow(model.contextWindow) }}
                    </small>
                    <ToggleSwitch
                      :model-value="modelPoolIds.has(model.id)"
                      :aria-label="`${text.modelPool}: ${model.name}`"
                      size="compact"
                      @update:model-value="setModelPoolMembership(model.id, $event)"
                    />
                  </span>
                </li>
              </ul>
              <p v-else class="empty">{{ text.noModelsInPool }}</p>
            </section>
          </div>
        </section>

        <!-- ───────────── Tools ───────────── -->
        <section v-else-if="activeTab === 'tools'" class="tools" role="tabpanel">
          <template v-if="providerSettings.tools.length">
            <article
              v-for="tool in providerSettings.tools"
              :key="tool.name"
              class="card tool"
              :class="{ 'is-disabled': tool.available === false }"
            >
              <header class="tool__head">
                <span class="tool__text">
                  <strong>{{ tool.label }}</strong>
                  <small>{{ tool.description }}</small>
                </span>
                <ToggleSwitch
                  :model-value="tool.enabled"
                  :disabled="tool.available === false"
                  :aria-label="tool.label"
                  @update:model-value="setToolEnabled(tool.name, $event)"
                />
              </header>

              <p v-if="tool.unavailableReason" class="tool__note">
                {{ tool.unavailableReason }}
              </p>

              <div v-if="tool.name === 'web_search'" class="field">
                <span class="field__label">{{ text.exaApiKey }}</span>
                <div class="field__row">
                  <input
                    class="form-control"
                    v-model="providerSettings.exaApiKey"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="
                      status.exaConfigured ? MASKED_SECRET_PLACEHOLDER : text.exaApiKeyPlaceholder
                    "
                  />
                  <BaseButton
                    size="sm"
                    class="field__save"
                    :disabled="!providerSettings.exaApiKey.trim()"
                    @click="providerSettings.persistWebSearchApiKey()"
                  >
                    {{ text.save }}
                  </BaseButton>
                </div>
                <small class="field__help">{{ text.exaApiKeyPlaceholder }}</small>
              </div>

              <details class="tool__params">
                <summary>{{ text.toolParameters }}</summary>
                <BaseTextarea
                  :model-value="providerSettings.toolInputs[tool.name] ?? '{}'"
                  class="field__mono"
                  size="sm"
                  :min-rows="3"
                  :max-rows="12"
                  spellcheck="false"
                  :aria-label="`${tool.label} ${text.toolParameters}`"
                  @update:model-value="setToolInput(tool.name, $event)"
                />
              </details>

              <div class="tool__foot">
                <BaseButton
                  size="sm"
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
              </div>

              <p v-if="providerSettings.toolErrors[tool.name]" class="tool__error" role="alert">
                {{ providerSettings.toolErrors[tool.name] }}
              </p>
              <pre v-if="providerSettings.toolResults[tool.name]" class="tool__result">{{
                providerSettings.toolResults[tool.name].content
              }}</pre>
            </article>
          </template>
          <p v-else class="empty">{{ text.noTools }}</p>
        </section>

        <!-- ───────────── Interface ───────────── -->
        <section v-else class="interface" role="tabpanel">
          <div class="card interface__list">
            <div class="row">
              <span class="row__label">{{ text.language }}</span>
              <DropMenu
                class="language-control"
                :label="text.language"
                :groups="languageGroups"
                density="compact"
                @select="(_groupId, value) => setLocale(value)"
              >
                <template #trigger>
                  <span>{{ selectedLanguageLabel }}</span>
                  <IconChevronDown class="language-chevron" aria-hidden="true" />
                </template>
              </DropMenu>
            </div>
            <div class="row">
              <span class="row__label">{{ text.collapseReasoning }}</span>
              <ToggleSwitch
                :model-value="collapseReasoning"
                :aria-label="text.collapseReasoning"
                @update:model-value="emit('update:collapseReasoning', $event)"
              />
            </div>
          </div>
        </section>
      </div>

      <div v-if="visibleError" class="alert" role="alert">
        <IconAlertTriangle aria-hidden="true" />
        <span>
          <strong>{{ visibleError.message }}</strong>
          <small v-if="visibleError.providerCode">{{ visibleError.providerCode }}</small>
          <small v-if="visibleError.raw" class="alert__raw">{{ visibleError.raw }}</small>
          <small v-if="visibleError.recommendedAction">
            {{ visibleError.recommendedAction }}
          </small>
        </span>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import BaseTabs from '@vue-src/components/common/BaseTabs.vue'
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
  import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconCheck from '~icons/tabler/check'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconPencil from '~icons/tabler/pencil'
  import IconPlus from '~icons/tabler/plus'
  import IconRefresh from '~icons/tabler/refresh'
  import IconTrash from '~icons/tabler/trash'
  import BaseTextarea from '../../../components/common/BaseTextarea.vue'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import ToggleSwitch from '../../../components/common/ToggleSwitch.vue'
  import {
    PROVIDER_API_PROTOCOLS,
    type ProviderApiProtocol,
    type ProviderStatusView,
  } from '../agent-contracts.js'
  import { AGENT_LOCALE_OPTIONS, type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import type { AgentProviderSettingsStore } from '../browser-agent/provider-settings/types.js'

  type SettingsTab = 'provider' | 'tools' | 'interface'

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
  const activeTab = ref<SettingsTab>('provider')
  const modelSearch = ref('')

  const text = computed(() => getAgentCopy(props.locale))
  const languageGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'language',
      label: '',
      items: AGENT_LOCALE_OPTIONS.map((option) => ({
        id: option.value,
        label: option.label,
        active: option.value === props.locale,
      })),
    },
  ])
  const selectedLanguageLabel = computed(
    () => AGENT_LOCALE_OPTIONS.find((option) => option.value === props.locale)?.label,
  )
  const agentTabs = computed<ReadonlyArray<{ id: SettingsTab; label: string }>>(() => [
    { id: 'provider', label: text.value.providerSettings },
    { id: 'tools', label: text.value.tools },
    { id: 'interface', label: text.value.interface },
  ])
  const persistedProfileNames = computed(
    () => new Set(props.providerSettings.profiles.map((profile) => profile.name)),
  )
  const visibleError = computed(() => props.providerSettings.operationError ?? props.status.error)
  const profileNameDialogError = computed(() =>
    props.providerSettings.profileNameError ? text.value.providerProfileNameDuplicated : '',
  )
  /** 协议选项不需要分组标题，空 label 让 DropMenu 省略分组行。 */
  const protocolGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'protocol',
      label: '',
      items: PROVIDER_API_PROTOCOLS.map((protocol) => ({
        id: protocol,
        label: protocolLabel(protocol),
      })),
    },
  ])
  const selectedProtocolLabel = computed(() => protocolLabel(props.providerSettings.protocol))
  const profileOptions = computed(() => {
    const profiles = props.providerSettings.profiles.map((profile) => ({
      value: profile.name,
      label: profile.name,
    }))
    const draftName = props.providerSettings.profileName
    const isNewProfile = draftName && !profiles.some((profile) => profile.value === draftName)
    return isNewProfile ? [{ value: draftName, label: draftName }, ...profiles] : profiles
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

  /** 菜单选中协议；值域由 PROVIDER_API_PROTOCOLS 保证，草稿校验仍在 store 内完成。 */
  function selectProtocol(_groupId: string, itemId: string): void {
    updateProtocol(itemId)
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
      const window =
        value >= 10_000 ? (value / 10_000).toFixed(1).replace(/\.0$/, '') : String(value)
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

  /** 聚焦行内命名输入；重命名时全选原名称。 */
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

  /** 取消行内删除确认。 */
  function cancelRemoveProfile(): void {
    deletingProfile.value = ''
  }

  /** 确认删除指定配置。 */
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
      if (open) activeTab.value = 'provider'
    },
  )
</script>

<style scoped src="../../../components/common/form-control.css"></style>

<!-- 当前值与展开箭头的外观复用工具栏单选下拉，避免两套相似样式漂移。 -->
<style scoped src="../../../components/common/selection-menu.css"></style>

<style scoped>
  .language-control :deep(.drop-menu__trigger) {
    min-width: 140px;
    justify-content: space-between;
  }

  .language-chevron {
    width: 14px;
    height: 14px;
    color: var(--klc-color-ui-muted);
  }
  /* ───────── 基础 ───────── */
  .settings {
    --_gap: 12px;
    --_radius: 10px;
    --_pad: 14px;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--_gap);
    color: var(--klc-color-foreground);
  }

  .settings__body {
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  .card {
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--_radius);
    background: color-mix(in srgb, var(--klc-color-ui-input) 40%, transparent);
  }

  .empty {
    margin: 0;
    padding: 24px 12px;
    color: var(--klc-color-ui-muted);
    font-size: 12px;
    text-align: center;
  }

  .badge,
  .chip {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 7px;
    border-radius: 999px;
    color: var(--klc-color-ui-muted);
    background: var(--klc-color-ui-hover);
    font-size: 11px;
    font-style: normal;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }

  /* ───────── 表单字段 ───────── */
  .field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .field__label {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  .field__help {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
  }

  .field__row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .field__row input {
    min-width: 0;
    flex: 1 1 auto;
  }

  .field__save {
    flex: 0 0 auto;
    font-size: 12px;
  }

  .field__mono {
    font-family: var(--klc-typography-font-family-mono);
  }

  /* ───────── 单横线输入 ───────── */
  /* 仅连接卡片的三个字段用下划线样式：去掉四周边框、圆角与填充底色，只保留一条底线。 */
  .connection .form-control,
  .connection :deep(.base-textarea) {
    border: 0;
    border-bottom: 1px solid var(--klc-color-ui-border);
    border-radius: 0;
    background: transparent;
    transition: border-color var(--klc-motion-dur-fast, 160ms)
      var(--klc-motion-ease-out, ease-out);
  }

  /* 聚焦只提亮底线，不画四周框、不加外发光。 */
  .connection .form-control:focus,
  .connection :deep(.base-textarea:focus) {
    border-bottom-color: var(--klc-color-ui-border-strong);
  }

  .connection .form-control {
    height: var(--klc-density-default, 32px);
    padding: 0 2px;
  }

  /* 多行输入高度仍随内容增长，只是不再画四周框线。 */
  .connection :deep(.base-textarea) {
    --base-textarea-border: 0;

    padding: var(--klc-space-4, 4px) 2px;
  }

  .field input::placeholder {
    color: var(--klc-color-ui-text-soft);
    opacity: 0.55;
  }

  /* ───────── Provider 布局 ───────── */
  .provider {
    width: 100%;
    min-height: 440px;
    display: grid;
    grid-template-columns: 164px minmax(0, 1fr);
    gap: var(--_gap);
  }

  /* 左侧配置列表：行高亮贴到列表左右边缘，只留垂直内边距。 */
  .provider__rail {
    /* 配置行与行内命名输入共用同一行高算料，切换编辑态时列表不跳动。 */
    --rail-row-padding-block: 8px;
    --rail-row-line-height: var(--klc-text-12-line-height, 16px);
    --rail-row-height: calc(2 * var(--rail-row-padding-block) + var(--rail-row-line-height));

    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 10px 0;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--_radius);
  }

  .rail__title {
    padding: 2px 10px 6px;
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .rail__list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    overflow-y: auto;
  }

  .rail__item {
    position: relative;
    min-width: 0;
    /* 编辑态只剩行内输入，用行高兜底，避免行高塌缩导致列表跳动。 */
    min-height: var(--rail-row-height);
    display: flex;
    align-items: center;
    color: var(--klc-color-ui-muted);
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .rail__item:hover,
  .rail__item:focus-within,
  .rail__item.is-editing {
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
  }

  .rail__item.is-active {
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
    font-weight: 600;
  }

  .rail__select {
    min-width: 0;
    flex: 1 1 auto;
    padding: var(--rail-row-padding-block) 10px;
    border: 0;
    border-radius: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    font-size: 12px;
    line-height: var(--rail-row-line-height);
    text-align: left;
    cursor: pointer;
    transition: padding-right 0.15s ease;
  }

  .rail__select:focus-visible {
    outline: 0;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-ui-accent) 28%, transparent);
  }

  .rail__name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rail__item:has(.rail__actions):hover .rail__select,
  .rail__item:has(.rail__actions):focus-within .rail__select {
    padding-right: 54px;
  }

  .rail__actions {
    position: absolute;
    top: 50%;
    right: 4px;
    display: flex;
    gap: 2px;
    transform: translateY(-50%);
    visibility: hidden;
  }

  .rail__item:hover .rail__actions,
  .rail__item:focus-within .rail__actions {
    visibility: visible;
  }

  .icon-button {
    width: 22px;
    height: 22px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    color: var(--klc-color-ui-muted);
    background: transparent;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }

  .icon-button svg {
    width: 14px;
    height: 14px;
  }

  .icon-button:hover,
  .icon-button:focus-visible {
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-border);
    outline: 0;
  }

  .icon-button--danger:hover,
  .icon-button--danger:focus-visible {
    color: var(--klc-color-ui-danger-text);
  }

  .rail__inline {
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    min-width: 0;
    flex: 1 1 auto;
    padding-inline: 10px;
  }

  /* 行内命名输入取紧凑档高度，落在行高内而不是撑满整行；左右内边距沿用共享控件的 8px。 */
  .rail__inline input {
    min-width: 0;
    flex: 1 1 0;
    height: var(--klc-density-compact, 24px);
  }

  /* 行内保存按钮：显式确认入口，回车只是额外快捷键。 */
  .rail__inline-save {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: var(--klc-density-compact, 24px);
    height: var(--klc-density-compact, 24px);
    padding: 0;
    border: 0;
    border-radius: var(--klc-radius-xs, 4px);
    color: var(--klc-color-ui-muted);
    background: transparent;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }

  .rail__inline-save svg {
    width: 14px;
    height: 14px;
  }

  .rail__inline-save:hover:not(:disabled),
  .rail__inline-save:focus-visible:not(:disabled) {
    color: var(--klc-color-ui-success);
    background: var(--klc-color-ui-hover);
    outline: 0;
  }

  .rail__inline-save:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .rail__inline input[aria-invalid='true'] {
    border-color: var(--klc-color-ui-danger-text);
  }

  .rail__inline--create {
    margin-top: 4px;
  }

  .rail__confirm {
    width: 100%;
    display: grid;
    gap: 6px;
    padding: 8px 10px;
    font-size: 12px;
    line-height: 1.4;
  }

  .rail__confirm p {
    margin: 0;
  }

  .rail__confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
  }

  .text-button {
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    color: var(--klc-color-ui-text);
    background: transparent;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .text-button:hover,
  .text-button:focus-visible {
    background: var(--klc-color-ui-border);
    outline: 0;
  }

  .text-button--danger {
    color: var(--klc-color-ui-danger-text);
    font-weight: 600;
  }

  .rail__new {
    margin: auto 10px 0;
    align-self: stretch;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px dashed var(--klc-color-ui-border-strong, var(--klc-color-ui-border));
    border-radius: 7px;
    color: var(--klc-color-ui-muted);
    background: transparent;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .rail__new svg {
    width: 14px;
    height: 14px;
  }

  .rail__new:hover,
  .rail__new:focus-visible {
    color: var(--klc-color-ui-text);
    border-color: var(--klc-color-ui-accent);
    background: var(--klc-color-ui-hover);
    outline: 0;
  }

  .rail__error {
    margin: 2px 10px 0;
    color: var(--klc-color-ui-danger-text);
    font-size: 11px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  /* 右侧详情 */
  .provider__detail {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--_gap);
  }

  .connection {
    display: grid;
    gap: 12px;
    padding: var(--_pad);
  }

  /* 协议选择：触发器与连接表单同宽，视觉复用工具栏单选下拉的变量与箭头。 */
  .protocol-control {
    width: 100%;
  }

  .protocol-control :deep(.drop-menu__trigger) {
    width: 100%;
    box-sizing: border-box;
    --control-button-background: var(--klc-color-ui-input);
    --control-button-color: var(--klc-color-ui-text);
    --control-button-active-border: var(--klc-color-ui-border-strong);
    --control-button-active-background: var(--klc-color-ui-hover);
    --control-button-focus-border: var(--klc-color-ui-accent);
    --control-button-focus-background: var(--klc-color-ui-hover);
  }

  .protocol-control :deep(.selection-menu__value) {
    flex: 1 1 auto;
    font-size: 11px;
    font-weight: 400;
    text-align: left;
  }

  /* 模型列表 */
  .models {
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .models__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px var(--_pad);
    border-bottom: 1px solid var(--klc-color-ui-border);
  }

  .models__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--klc-color-ui-text);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .models__search {
    min-width: 0;
    height: 28px;
    flex: 1 1 auto;
    padding: 0 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    outline: none;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-input);
    font: inherit;
    font-size: 11px;
    transition: border-color var(--klc-motion-dur-fast, 160ms)
      var(--klc-motion-ease-out, ease-out);
  }

  /* 聚焦只提亮已有边框，不画焦点环、不加外发光。 */
  .models__search:focus {
    border-color: var(--klc-color-ui-border-strong);
  }

  .models__search:disabled {
    color: var(--klc-color-ui-muted);
    background: transparent;
    cursor: not-allowed;
  }

  .models__search::placeholder {
    color: var(--klc-color-ui-text-soft);
    opacity: 0.55;
  }

  .models__refresh {
    width: 28px;
    height: 28px;
    padding: 0;
  }

  .models__refresh svg {
    width: 16px;
    height: 16px;
  }

  .models__refresh.is-loading svg {
    animation: settings-spin 0.9s linear infinite;
  }

  .models__list {
    margin: 0;
    padding: 4px;
    list-style: none;
    min-height: 0;
    max-height: 260px;
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 1px;
  }

  .model {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 7px;
    font-size: 12px;
    transition: background-color 0.15s ease;
  }

  .model:hover {
    background: var(--klc-color-ui-hover);
  }

  .model__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model__meta {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  /* ───────── Tools ───────── */
  .tools {
    display: grid;
    align-content: start;
    gap: 10px;
    max-height: min(560px, calc(100vh - 230px));
  }

  .tool {
    display: grid;
    gap: 12px;
    padding: var(--_pad);
  }

  .tool.is-disabled {
    opacity: 0.7;
  }

  .tool__head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
  }

  .tool__text {
    display: grid;
    gap: 3px;
  }

  .tool__text strong {
    font-size: 13px;
    font-weight: 600;
  }

  .tool__text small {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    line-height: 1.45;
  }

  .tool__note,
  .tool__error {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
  }

  .tool__note {
    color: var(--klc-color-ui-muted);
  }

  .tool__error {
    color: var(--klc-color-ui-danger-text);
  }

  .tool__params {
    display: grid;
    gap: 6px;
    color: var(--klc-color-ui-muted);
    font-size: 11px;
  }

  .tool__params summary {
    width: fit-content;
    cursor: pointer;
    user-select: none;
  }

  .tool__params summary:hover {
    color: var(--klc-color-ui-text);
  }

  .tool__params[open] summary {
    margin-bottom: 6px;
  }

  .tool__foot {
    display: flex;
    justify-content: flex-start;
    font-size: 12px;
  }

  .tool__result {
    box-sizing: border-box;
    width: 100%;
    min-height: 74px;
    max-height: 220px;
    margin: 0;
    padding: 10px;
    overflow: auto;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-input);
    font: 11px/1.5 var(--klc-typography-font-family-mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* ───────── Interface ───────── */
  .interface__list {
    display: grid;
  }

  .row {
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px var(--_pad);
    font-size: 12px;
  }

  .row + .row {
    border-top: 1px solid var(--klc-color-ui-border);
  }

  .row__label {
    font-weight: 500;
  }

  /* ───────── 错误提示 ───────── */
  .alert {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--klc-color-ui-danger-text) 45%, transparent);
    border-radius: 8px;
    color: var(--klc-color-ui-danger-text);
    background: color-mix(in srgb, var(--klc-color-ui-danger-text) 8%, transparent);
    font-size: 11px;
    line-height: 1.45;
  }

  .alert svg {
    width: 16px;
    height: 16px;
  }

  .alert span {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .alert strong,
  .alert small {
    overflow-wrap: anywhere;
    font: inherit;
  }

  .alert strong {
    font-weight: 600;
  }

  @keyframes settings-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .models__refresh.is-loading svg {
      animation: none;
    }
  }

  /* ───────── 窄屏 ───────── */
  @media (max-width: 640px) {
    .provider {
      grid-template-columns: 1fr;
    }

    .rail__list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .models__header {
      flex-wrap: wrap;
    }

    .models__search {
      min-width: 120px;
    }
  }
</style>
<style src="./agent-select-trigger.css"></style>
