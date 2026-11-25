<!--
  警报选择弹窗：列出 kind=alert 的脚本，按「脚本 + 当前品种」管理规则。
  - 行结构与指标弹窗共用同一套样式与说明气泡；
  - 面板只展示当前品种的规则，其他品种的规则在后台继续运行；
  - 渠道只注册意图，投递由警报服务与通知订阅者承担。
-->
<template>
  <BaseModal body="list"
    :open="open"
    title="警报"
    size="lg"
    @update:open="!$event && emit('update:open', false)"
  >
    <template #tabs>
      <ModalSearchBar
        v-model="search"
        placeholder="搜索警报名称..."
        aria-label="搜索警报"
      />
    </template>

    <p v-if="error" class="alert-error modal-list-item" role="alert">{{ error }}</p>
    <p v-if="otherRuleCount > 0" class="alert-scope modal-list-item" role="status">
      另有 {{ otherRuleCount }} 条规则在其他品种上运行，切换品种可分别管理。
    </p>

    <ModalScrollArea>
      <div class="indicator-list" role="list" aria-label="警报列表">
        <div
          v-for="script in filtered"
          :key="script.id"
          class="indicator-item modal-list-row"
          role="listitem"
        >
          <button
            type="button"
            class="item-select"
            :aria-pressed="isEnabled(script.id)"
            @click="toggle(script.id, !isEnabled(script.id))"
          >
            <div class="item-header">
              <span class="item-label">
                <!-- 文本单独一层：省略号只裁文本，说明图标不被裁掉。 -->
                <span class="item-label__text">
                  {{ script.label }}
                  <span v-if="script.name && script.name !== script.label" class="item-name">
                    {{ script.name }}
                  </span>
                </span>
                <BasePopover
                  v-if="script.description"
                  :label="`${script.name} 警报说明`"
                  role="note"
                  placement="auto"
                  trigger="hover"
                >
                  <template #trigger="{ props: triggerProps }">
                    <BaseIconButton
                      size="xs"
                      class="item-info-btn"
                      :label="`查看警报说明：${script.name}`"
                      v-bind="triggerProps"
                    >
                      <IconTablerInfoCircle aria-hidden="true" />
                    </BaseIconButton>
                  </template>
                  <p class="indicator-description__title">{{ script.name }}</p>
                  <p class="indicator-description">{{ script.description }}</p>
                </BasePopover>
              </span>
            </div>
          </button>
          <BaseTooltip v-if="script.inputs.length > 0" content="编辑参数" placement="top">
            <BaseIconButton
              class="item-action-btn"
              :label="`编辑参数：${script.label}`"
              :disabled="!ruleFor(script.id)"
              @click="openParams(script.id)"
            >
              <IconTablerSettings aria-hidden="true" />
            </BaseIconButton>
          </BaseTooltip>
          <BaseTooltip
            v-if="ruleFor(script.id)"
            :content="hasSound(script.id) ? '关闭声音' : '开启声音'"
            placement="top"
          >
            <BaseIconButton
              class="item-action-btn sound-toggle"
              :class="{ active: hasSound(script.id) }"
              :label="`${hasSound(script.id) ? '关闭' : '开启'}声音提醒：${script.label}`"
              :aria-pressed="hasSound(script.id)"
              @click="toggleSound(script.id)"
            >
              <IconTablerBell aria-hidden="true" />
            </BaseIconButton>
          </BaseTooltip>
          <BaseTooltip v-if="ruleFor(script.id)" content="删除警报" placement="top">
            <BaseIconButton
              class="item-action-btn"
              tone="danger"
              :label="`删除警报：${script.label}`"
              @click="removeRule(script.id)"
            >
              <IconTablerTrash aria-hidden="true" />
            </BaseIconButton>
          </BaseTooltip>
          <ToggleSwitch
            :model-value="isEnabled(script.id)"
            :label="`启用警报：${script.label}`"
            :disabled="!controller || !symbol"
            @update:model-value="(next) => toggle(script.id, next)"
          />
        </div>
      </div>

      <BaseEmptyState v-if="filtered.length === 0" class="modal-list-item" role="status">
        暂无警报脚本
        <template #hint>用 defineAlert 编写一个脚本后即可在这里启用</template>
      </BaseEmptyState>
    </ModalScrollArea>

    <ParamsDialog
      v-if="paramsScript"
      :visible="paramsVisible"
      :definition-id="paramsScript.id"
      :definition-name="paramsScript.name"
      :description="paramsScript.description"
      :params="paramsScript.inputs"
      :values="paramValues"
      @close="paramsVisible = false"
      @confirm="onParamsConfirm"
    />
  </BaseModal>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/dialog/modal-list.css'
  import '@vue-src/components/common/dialog/modal-list-item.css'

  import {
    type Alert,
    type AlertChannel,
    type AlertScriptDefinition,
    alertCatalog,
    type ChartController,
    type SymbolSpec,
  } from '@363045841yyt/klinechart-core/controllers'
  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import BaseModal from '@vue-src/components/common/dialog/BaseModal.vue'
  import ModalScrollArea from '@vue-src/components/common/dialog/ModalScrollArea.vue'
  import ModalSearchBar from '@vue-src/components/common/dialog/ModalSearchBar.vue'
  import BaseEmptyState from '@vue-src/components/common/feedback/BaseEmptyState.vue'
  import ToggleSwitch from '@vue-src/components/common/form/ToggleSwitch.vue'
  import BasePopover from '@vue-src/components/common/overlay/BasePopover.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import ParamsDialog from '@vue-src/components/params/impl/ParamsDialog.vue'
  import { coreSignalToVueRef, useSignalSource } from '@vue-src/utils/signalBridge.js'
  import { computed, ref } from 'vue'
  import IconTablerBell from '~icons/tabler/bell'
  import IconTablerInfoCircle from '~icons/tabler/info-circle'
  import IconTablerSettings from '~icons/tabler/settings'
  import IconTablerTrash from '~icons/tabler/trash'

  const props = defineProps<{
    open: boolean
    controller: ChartController | null
    /** 当前图表品种；面板只管理该品种的规则。 */
    symbol: SymbolSpec | null
  }>()
  const emit = defineEmits<{ 'update:open': [open: boolean] }>()

  /** 目录是 Core 注册表投影，只含警报脚本。 */
  const scripts = coreSignalToVueRef(alertCatalog)
  const search = ref('')
  const error = ref<string | null>(null)
  /** 当前品种的规则投影；身份换算由警报服务提供。 */
  const rules = useSignalSource(
    () => (props.symbol ? props.controller?.alerts.forSymbol(props.symbol) : undefined),
    (value) => value,
    () => [],
  )
  /** 全部品种的规则，用于提示后台仍在运行的规则数量。 */
  const allRules = useSignalSource(
    () => props.controller?.alerts.alerts,
    (value) => value,
    () => [],
  )
  const otherRuleCount = computed(() => allRules.value.length - rules.value.length)
  const paramsScriptId = ref<string | null>(null)
  const paramsVisible = ref(false)

  const filtered = computed(() => {
    const query = search.value.trim().toLowerCase()
    if (!query) return scripts.value
    return scripts.value.filter(
      (script) =>
        script.label.toLowerCase().includes(query) || script.name.toLowerCase().includes(query),
    )
  })

  /** 一个脚本对应当前品种的一条规则；不存在时返回 undefined。 */
  function ruleFor(definitionId: string): Alert | undefined {
    return rules.value.find((rule) => rule.script.definitionId === definitionId)
  }

  function isEnabled(definitionId: string): boolean {
    return ruleFor(definitionId)?.enabled === true
  }

  function hasSound(definitionId: string): boolean {
    return ruleFor(definitionId)?.channels.includes('sound') === true
  }

  /** 脚本参数默认值；规则不存在时用作新建入参。 */
  function defaultInputs(
    script: AlertScriptDefinition,
  ): Record<string, number | string | boolean> {
    const values: Record<string, number | string | boolean> = {}
    for (const input of script.inputs) {
      if (input.default !== undefined) values[input.key] = input.default
    }
    return values
  }

  /** 规则当前参数；编辑弹窗回填已有值。 */
  const paramsScript = computed(() =>
    scripts.value.find((script) => script.id === paramsScriptId.value),
  )
  const paramValues = computed<Record<string, number | string | boolean>>(() => {
    const script = paramsScript.value
    if (!script) return {}
    const rule = ruleFor(script.id)
    const values = { ...defaultInputs(script) }
    for (const [key, value] of Object.entries(rule?.script.inputs ?? {})) {
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        values[key] = value
      }
    }
    return values
  })

  function fail(cause: unknown): void {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }

  function createRule(
    script: AlertScriptDefinition,
    inputs: Record<string, number | string | boolean>,
  ): void {
    const controller = props.controller
    const symbol = props.symbol
    if (!controller || !symbol) return
    controller.alerts.create({
      name: script.label,
      script: { definitionId: script.id, inputs },
      symbol,
      message: '{{message}}',
      channels: ['in-app'],
    })
  }

  /** 开关：有规则改启用状态，没有规则则按默认参数新建。 */
  function toggle(scriptId: string, next: boolean): void {
    error.value = null
    try {
      const rule = ruleFor(scriptId)
      if (rule) {
        props.controller?.alerts.setEnabled(rule.id, next)
        return
      }
      if (!next) return
      const script = scripts.value.find((item) => item.id === scriptId)
      if (!script) return
      if (!props.symbol) {
        error.value = '请先选择图表品种'
        return
      }
      createRule(script, {})
    } catch (cause) {
      fail(cause)
    }
  }

  /** 声音只是规则渠道的一项；打开与关闭都只提交意图。 */
  function toggleSound(definitionId: string): void {
    const rule = ruleFor(definitionId)
    if (!rule) return
    error.value = null
    const channels: readonly AlertChannel[] = rule.channels.includes('sound')
      ? rule.channels.filter((channel) => channel !== 'sound')
      : [...rule.channels, 'sound']
    try {
      props.controller?.alerts.update(rule.id, { channels })
    } catch (cause) {
      fail(cause)
    }
  }

  function removeRule(definitionId: string): void {
    const rule = ruleFor(definitionId)
    if (!rule) return
    error.value = null
    try {
      props.controller?.alerts.remove(rule.id)
    } catch (cause) {
      fail(cause)
    }
  }

  function openParams(definitionId: string): void {
    error.value = null
    paramsScriptId.value = definitionId
    paramsVisible.value = true
  }

  /** 参数确认：已有规则更新参数，没有规则则用新参数新建并启用。 */
  function onParamsConfirm(values: Record<string, number | string | boolean>): void {
    const script = paramsScript.value
    if (!script) return
    error.value = null
    try {
      const rule = ruleFor(script.id)
      if (rule) {
        props.controller?.alerts.update(rule.id, {
          script: { definitionId: script.id, inputs: values },
        })
      } else if (props.symbol) {
        createRule(script, values)
      }
      paramsVisible.value = false
    } catch (cause) {
      fail(cause)
    }
  }
</script>

<style scoped>
  .alert-error {
    margin: 0;
    padding-block: var(--klc-space-8, 8px);
    font-size: var(--klc-text-12-font-size, 12px);
    color: var(--klc-color-danger, #e04a4a);
  }

  .alert-scope {
    margin: 0;
    padding-block: var(--klc-space-8, 8px);
    font-size: var(--klc-text-12-font-size, 12px);
    color: var(--klc-color-ui-text-soft);
  }

  .sound-toggle.active {
    --base-icon-button-color: var(--klc-color-ui-accent);
    --base-icon-button-hover-color: var(--klc-color-ui-accent);
  }
</style>
