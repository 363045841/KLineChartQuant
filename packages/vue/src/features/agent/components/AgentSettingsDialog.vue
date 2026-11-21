<template>
  <BaseModal body="fixed-form"
    :open="providerSettings.open"
    :title="text.settings"
    size="xl"
    @update:open="!$event && closeProviderSettings()"
  >
    <template #tabs>
      <BaseTabs v-model="activeTab" :tabs="agentTabs" :panel-id="panelId" :aria-label="text.settings" />
    </template>

    <div class="settings agent-settings-selects">
      <div v-bind="panelAttrs" class="settings__body">
        <!-- ───────────── Provider ───────────── -->
        <section
          v-if="activeTab === 'provider'"
          class="provider"
        >
          <aside class="provider__rail" :aria-label="text.providerProfile">
            <header class="rail__title">{{ text.providerProfile }}</header>

            <AgentRowList class="rail__list">
              <AgentListRow
                v-for="profile in profileOptions"
                :key="profile.value"
                v-model:draft="profileNameDraft"
                :mode="profileRowMode(profile.value)"
                :active="profile.value === providerSettings.profileName"
                :locale="locale"
                :rename-label="text.providerProfileName"
                :invalid="Boolean(profileNameDialogError)"
                :confirm-label="text.deleteProviderProfile"
                @select="selectProfile(profile.value)"
                @submit="submitProfileName"
                @delete="confirmRemoveProfile(profile.value)"
                @cancel="closeProfileEditor()"
              >
                {{ profile.label }}
                <template v-if="persistedProfileNames.has(profile.value)" #actions>
                  <BaseTooltip :content="text.renameProviderProfile" placement="top">
                    <BaseIconButton
                      :label="`${text.renameProviderProfile}: ${profile.label}`"
                      @click="openRenameProfile(profile.value)"
                    >
                      <IconPencil aria-hidden="true" />
                    </BaseIconButton>
                  </BaseTooltip>
                  <BaseTooltip :content="text.deleteProviderProfile" placement="top">
                    <BaseIconButton
                      tone="danger"
                      :label="`${text.deleteProviderProfile}: ${profile.label}`"
                      @click="openDeleteProfile(profile.value)"
                    >
                      <IconTrash aria-hidden="true" />
                    </BaseIconButton>
                  </BaseTooltip>
                </template>
              </AgentListRow>

              <!-- 新建配置与其它行共用同一个编辑器，贴在列表末尾，位置不跳动 -->
              <AgentListRow
                v-if="isCreatingProfile"
                v-model:draft="profileNameDraft"
                class="rail__create"
                mode="rename"
                :locale="locale"
                :rename-label="text.providerProfileName"
                :rename-placeholder="`${text.providerProfileName}…`"
                :invalid="Boolean(profileNameDialogError)"
                :confirm-label="text.deleteProviderProfile"
                @submit="submitProfileName"
                @cancel="closeProfileEditor()"
              />
            </AgentRowList>

            <button
              v-if="!isCreatingProfile"
              type="button"
              class="rail__new"
              @click="openCreateProfileDialog()"
            >
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
                  fill
                  @select="selectProtocol"
                >
                  <template #trigger>
                    <span class="selection-menu__value">{{ selectedProtocolLabel }}</span>
                    <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
                  </template>
                </DropMenu>
              </label>
              <label class="field">
                <span class="field__label">{{ text.baseUrl }}</span>
                <BaseInput
                  v-model="providerSettings.baseUrl"
                  variant="underline"
                  autocomplete="off"
                  spellcheck="false"
                  @blur="providerSettings.persistConnection()"
                />
              </label>
              <label class="field">
                <span class="field__label">{{ text.apiKey }}</span>
                <BaseInput
                  v-model="providerSettings.apiKey"
                  type="password"
                  variant="underline"
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
                  variant="underline"
                  size="sm"
                  spellcheck="false"
                  :placeholder="text.additionalHeadersPlaceholder"
                  @blur="providerSettings.persistConnection()"
                />
              </label>
            </section>

            <!-- 模型 -->
            <section class="card models">
              <header class="models__header">
                <span
                  class="models__count"
                  role="img"
                  :title="text.modelPool"
                  :aria-label="`${text.modelPool}: ${modelPoolIds.size}`"
                >
                  <IconStack aria-hidden="true" />
                  {{ modelPoolIds.size }}
                </span>
                <SearchField
                  v-model="modelSearch"
                  variant="compact"
                  class="models__search"
                  :placeholder="text.modelSearchPlaceholder"
                  :aria-label="text.modelSearchPlaceholder"
                  :disabled="providerSettings.modelsLoading"
                />
                <BaseTooltip :content="text.refreshModels" placement="top">
                  <BaseIconButton
                    size="lg"
                    :label="text.refreshModels"
                    :disabled="providerSettings.modelsLoading || !hasProviderConnection"
                    @click="providerSettings.refreshModelCatalog()"
                  >
                    <IconRefresh
                      :class="{ 'klc-spin': providerSettings.modelsLoading }"
                      aria-hidden="true"
                    />
                  </BaseIconButton>
                </BaseTooltip>
              </header>

              <ul v-if="providerSettings.modelCatalog.length" class="models__list">
                <li v-for="model in filteredModels" :key="model.id" class="model">
                  <span class="model__name" :title="model.name">{{ model.name }}</span>
                  <span class="model__meta">
                    <BaseChip v-if="model.contextWindow">
                      {{ formatContextWindow(model.contextWindow) }}
                    </BaseChip>
                    <ToggleSwitch
                      :model-value="modelPoolIds.has(model.id)"
                      :label="`${text.modelPool}: ${model.name}`"
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
        <section v-else-if="activeTab === 'tools'" class="tools">
          <template v-if="providerSettings.tools.length">
            <article v-for="tool in providerSettings.tools" :key="tool.name" class="card tool">
              <header class="tool__head">
                <span class="tool__text">
                  <strong>{{ tool.label }}</strong>
                  <small>{{ tool.description }}</small>
                </span>
                <ToggleSwitch
                  :model-value="tool.enabled"
                  :label="tool.label"
                  @update:model-value="setToolEnabled(tool.name, $event)"
                />
              </header>

              <div v-if="tool.name === 'web_search'" class="field">
                <span class="field__label">{{ text.exaApiKey }}</span>
                <div class="field__row">
                  <BaseInput
                    v-model="providerSettings.exaApiKey"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="
                      status.exaConfigured ? MASKED_SECRET_PLACEHOLDER : text.exaApiKeyPlaceholder
                    "
                  />
                  <BaseButton
                    size="sm"
                    :disabled="!providerSettings.exaApiKey.trim() && !status.exaConfigured"
                    @click="providerSettings.persistWebSearchApiKey()"
                  >
                    {{ text.save }}
                  </BaseButton>
                </div>
                <small class="field__help">{{ text.exaApiKeyHelp }}</small>
              </div>

              <details class="tool__params">
                <summary>{{ text.toolParameters }}</summary>
                <BaseTextarea
                  :model-value="providerSettings.toolInputs[tool.name] ?? '{}'"
                  class="field__mono"
                  size="sm"
                  :max-rows="12"
                  spellcheck="false"
                  :aria-label="`${tool.label} ${text.toolParameters}`"
                  @update:model-value="setToolInput(tool.name, $event)"
                />
              </details>

              <div class="tool__foot">
                <BaseButton
                  size="sm"
                  :disabled="!tool.enabled || providerSettings.runningToolName !== null"
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
        <section v-else class="interface">
          <div class="card interface__list">
            <div class="row">
              <span class="row__label">{{ text.language }}</span>
              <DropMenu
                class="language-control"
                :label="text.language"
                :groups="languageGroups"
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
                :label="text.collapseReasoning"
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
  import { useTabPanel } from '@vue-src/components/common/tabs/useTabPanel.js'
  import '@vue-src/components/common/menu/selection-menu.css'

  import BaseChip from '@vue-src/components/common/BaseChip.vue'
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import BaseModal from '@vue-src/components/common/dialog/BaseModal.vue'
  import BaseInput from '@vue-src/components/common/form/BaseInput.vue'
  import BaseTextarea from '@vue-src/components/common/form/BaseTextarea.vue'
  import SearchField from '@vue-src/components/common/form/SearchField.vue'
  import ToggleSwitch from '@vue-src/components/common/form/ToggleSwitch.vue'
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/menu/DropMenu.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import BaseTabs from '@vue-src/components/common/tabs/BaseTabs.vue'
  import { computed, ref, watch } from 'vue'
  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconPencil from '~icons/tabler/pencil'
  import IconPlus from '~icons/tabler/plus'
  import IconRefresh from '~icons/tabler/refresh'
  import IconStack from '~icons/tabler/stack-2'
  import IconTrash from '~icons/tabler/trash'
  import {
    PROVIDER_API_PROTOCOLS,
    type ProviderApiProtocol,
    type ProviderStatusView,
  } from '../agent-contracts.js'
  import { AGENT_LOCALE_OPTIONS, type AgentLocale, getAgentCopy } from '../agent-copy/index.js'
  import type { AgentProviderSettingsStore } from '../browser-agent/provider-settings/types.js'
  import AgentListRow from './AgentListRow.vue'
  import AgentRowList from './AgentRowList.vue'
  import type { AgentListRowMode } from './agent-row/types.js'

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

  /** 侧栏唯一编辑目标：新建没有目标行，重命名与删除锁定一个已保存的配置名。 */
  type ProfileEditor = { mode: 'create' } | { mode: 'rename' | 'delete'; name: string } | null

  const profileEditor = ref<ProfileEditor>(null)
  const profileNameDraft = ref('')
  const activeTab = ref<SettingsTab>('provider')
  const { panelId, panelAttrs } = useTabPanel(() => activeTab.value)
  const modelSearch = ref('')

  const text = computed(() => getAgentCopy(props.locale))
  const languageGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'language',
      label: '',
      items: AGENT_LOCALE_OPTIONS.map((option) => ({
        id: option.value,
        label: option.label,
        selection: 'radio',
        checked: option.value === props.locale,
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
        checked: protocol === props.providerSettings.protocol,
        selection: 'radio',
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
  /** 新建配置是否正在行内编辑。 */
  const isCreatingProfile = computed(() => profileEditor.value?.mode === 'create')

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

  /** 行的展示模式：只有被编辑目标锁定的行才离开空闲态。 */
  function profileRowMode(name: string): AgentListRowMode {
    const editor = profileEditor.value
    return editor && editor.mode !== 'create' && editor.name === name ? editor.mode : 'idle'
  }

  /** 在列表末尾展开行内「新建配置」输入。 */
  function openCreateProfileDialog(): void {
    profileNameDraft.value = ''
    props.providerSettings.clearProfileNameError()
    profileEditor.value = { mode: 'create' }
  }

  /** 把目标配置行切换为行内重命名输入并预填当前名称。 */
  function openRenameProfile(name: string): void {
    profileNameDraft.value = name
    props.providerSettings.clearProfileNameError()
    profileEditor.value = { mode: 'rename', name }
  }

  /** 展开删除确认；行内焦点由共享行落在「取消」上。 */
  function openDeleteProfile(name: string): void {
    profileEditor.value = { mode: 'delete', name }
  }

  /** 退出行内编辑并清空临时名称与校验错误。 */
  function closeProfileEditor(): void {
    profileEditor.value = null
    profileNameDraft.value = ''
    props.providerSettings.clearProfileNameError()
  }

  /** 提交行内名称：创建新配置或重命名现有配置；失败时保留输入并显示错误。 */
  function submitProfileName(title: string): void {
    const editor = profileEditor.value
    if (!editor) return
    if (editor.mode === 'rename' && title === editor.name) {
      closeProfileEditor()
      return
    }
    const operation =
      editor.mode === 'rename'
        ? props.providerSettings.renameProfile(editor.name, title)
        : props.providerSettings.createProfile(title)
    void operation.then((succeeded) => {
      if (succeeded) closeProfileEditor()
    })
  }

  /** 确认删除指定配置；删除会移除凭据，不可恢复。 */
  function confirmRemoveProfile(name: string): void {
    closeProfileEditor()
    void props.providerSettings.deleteProfile(name)
  }

  /** 关闭主设置时一并退出行内编辑。 */
  function closeProviderSettings(): void {
    closeProfileEditor()
    props.providerSettings.close()
  }

  watch(
    () => props.providerSettings.open,
    (open) => {
      if (open) activeTab.value = 'provider'
    },
  )
</script>

<!-- 当前值与展开箭头的外观复用工具栏单选下拉，避免两套相似样式漂移。 -->

<style scoped>
  /* 设置弹窗里的下拉触发器统一紧凑外观：变量向下继承，不再穿透组件内部。 */
  .agent-settings-selects {
    --control-button-height: 26px;
    --control-button-inline-padding: calc(var(--klc-space-8, 8px) + var(--klc-space-2, 2px));
    --control-button-radius: var(--klc-radius-xs, 4px);
    --control-button-font-size: var(--klc-text-11-mono-font-size, 11px);
    --control-button-active-background: var(--klc-color-ui-hover);
    --control-button-focus-shadow: none;
  }

  .language-control {
    --control-button-min-width: 140px;
    --control-button-justify: space-between;
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

  /* ───────── 表单字段 ───────── */
  .field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .field__label {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
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

  .field__mono {
    font-family: var(--klc-font-family-mono);
    font-weight: var(--klc-font-weight-mono);
  }

  /* ───────── 单横线输入 ───────── */
  /* 多行字段用 BaseTextarea 的 underline 变体，不再在这里穿透改样式。 */

  /* ───────── Provider 布局 ───────── */
  .provider {
    width: 100%;
    min-height: 440px;
    display: grid;
    grid-template-columns: 164px minmax(0, 1fr);
    gap: var(--_gap);
  }

  /* 左侧配置列表：行与行内编辑器由 AgentListRow 提供，这里只负责容器与列表编排。 */
  .provider__rail {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-4, 4px);
    min-width: 0;
    padding: var(--klc-space-8, 8px) 0;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--_radius);
  }

  .rail__title {
    padding: 0 var(--klc-space-8, 8px);
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    letter-spacing: 0.04em;
  }

  /* 列表撑满侧栏，行高亮由 AgentRowList 的滑动块提供。 */
  .rail__list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  /* 新建配置贴着列表末尾展开，替换掉原先独占底部的按钮位置。 */
  .rail__create {
    margin-top: auto;
  }

  .rail__new {
    margin: 0 var(--klc-space-8, 8px);
    height: var(--klc-density-default, 32px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--klc-space-4, 4px);
    padding: 0 var(--klc-space-8, 8px);
    border: 1px dashed var(--klc-color-ui-border-strong);
    border-radius: var(--klc-radius-sm, 6px);
    color: var(--klc-color-ui-muted);
    background: transparent;
    font: inherit;
    font-size: var(--klc-text-12-font-size, 12px);
    cursor: pointer;
    transition:
      color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard),
      background-color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard),
      border-color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
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
    margin: 0 var(--klc-space-8, 8px);
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

  /* 协议选择：与连接表单同宽，视觉复用工具栏单选下拉的变量与箭头。 */
  .protocol-control {
    --control-button-color: var(--klc-color-ui-text);
    --control-button-active-background: var(--klc-color-ui-hover);
    --control-button-focus-background: var(--klc-color-ui-hover);
    --control-button-font-size: var(--klc-text-11-mono-font-size, 11px);
  }

  .protocol-control .selection-menu__value {
    flex: 1 1 auto;
    font-size: 11px;
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

  /* 模型池计数：图标 + 数字，不再用胶囊承载。 */
  .models__count {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
    font-variant-numeric: var(--klc-text-numeric);
    white-space: nowrap;
  }

  .models__search {
    min-width: 0;
    flex: 1 1 auto;
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
    transition: background-color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
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
  }

  .tool__text small {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    line-height: 1.45;
  }

  .tool__error {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
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
    font-family: var(--klc-font-family-mono);
    font-weight: var(--klc-font-weight-mono);
    font-size: var(--klc-text-11-mono-font-size, 11px);
    line-height: 1.5;
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


/* ───────── 窄屏 ───────── */
  @media (max-width: 640px) {
    .provider {
      grid-template-columns: 1fr;
    }

    .models__header {
      flex-wrap: wrap;
    }

    .models__search {
      min-width: 120px;
    }
  }
</style>
