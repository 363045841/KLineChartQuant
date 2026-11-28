<!--
  新建警报弹窗：选择警报脚本与作用品种，独立于警报面板。
  - 脚本入口打开独立选择弹窗，目录由选择器自己读取，本组件只持有选中的定义；
  - 品种默认当前图表品种，可搜索切换；
  - 标题 13px，字段与提示 12–13px，全部走 token，不使用 deep。
-->
<template>
  <BaseModal
    body="list"
    :open="open"
    size="sm"
    footer-align="flex-end"
    @update:open="!$event && emit('update:open', false)"
  >
    <template #title>
      <span class="alert-draft__dialog-title">添加警报</span>
    </template>

    <p v-if="error" class="alert-draft__error" role="alert">
      <IconTablerAlertTriangle aria-hidden="true" />
      <span>{{ error }}</span>
    </p>

    <ModalScrollArea>
      <div class="alert-draft">
        <div class="alert-draft__section" role="group" :aria-labelledby="scriptLabelId">
          <h3 :id="scriptLabelId" class="alert-draft__section-title">警报脚本</h3>

          <SelectionField
            :value="selectedScript?.label ?? ''"
            placeholder="选择脚本"
            aria-haspopup="dialog"
            :aria-expanded="scriptPickerOpen"
            @click="scriptPickerOpen = true"
          />
        </div>

        <div class="alert-draft__section" role="group" :aria-labelledby="symbolLabelId">
          <h3 :id="symbolLabelId" class="alert-draft__section-title">作用品种</h3>

          <SymbolSelector
            variant="field"
            :symbol="instrument?.symbol ?? ''"
            :selected-item="instrument ?? undefined"
            :symbols="instruments"
            :search="searchSymbols"
            :aggregation-sources="aggregationSources"
            :enabled-source-names="enabledSourceNames"
            :show-watchlist-action="false"
            :show-manage-sources="false"
            @change="selectInstrument"
          />
        </div>
      </div>
    </ModalScrollArea>

    <AlertScriptSelector
      v-model:open="scriptPickerOpen"
      :definition-id="selectedScript?.id ?? null"
      :definitions="definitions"
      @select="selectScript"
    />

    <template #footer>
      <BaseButton @click="close">取消</BaseButton>
      <BaseButton variant="primary" :disabled="!canAdd" @click="submit">添加</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import type {
    AlertService,
    DefinitionRegistry,
  } from '@363045841yyt/klinechart-core/controllers'
  import type { SymbolSpec } from '@363045841yyt/klinechart-core'
  import AlertScriptSelector from '@vue-src/components/alert/AlertScriptSelector.vue'
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import BaseModal from '@vue-src/components/common/dialog/BaseModal.vue'
  import ModalScrollArea from '@vue-src/components/common/dialog/ModalScrollArea.vue'
  import SelectionField from '@vue-src/components/common/form/SelectionField.vue'
  import type { SymbolItem } from '@vue-src/components/symbol/SymbolSelector.vue'
  import SymbolSelector from '@vue-src/components/symbol/SymbolSelector.vue'
  import { useAlertDraft } from '@vue-src/composables/alerts/useAlertDraft.js'
  import type { AggregationSourceDefinition } from '@vue-src/composables/market/useAggregationSources.js'
  import type { SymbolSearchFn } from '@vue-src/composables/symbol/useSymbolSearch.js'
  import { ref, useId, watch } from 'vue'
  import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'

  const props = defineProps<{
    open: boolean
    alerts: AlertService | null
    /** 当前运行时定义注册表；脚本选择器只读它。 */
    definitions: DefinitionRegistry
    /** 当前图表品种快照；新建默认使用它的品种、周期与复权。 */
    currentSpec: SymbolSpec | null
    /** 品种选择器的本地候选列表；搜索仍走 searchSymbols。 */
    instruments: readonly SymbolItem[]
    searchSymbols: SymbolSearchFn<SymbolItem>
    /** 已注册数据源，供品种选择器展示源页签。 */
    aggregationSources: ReadonlyArray<AggregationSourceDefinition>
    /** 已启用的搜索源名称。 */
    enabledSourceNames: ReadonlySet<string>
  }>()
  const emit = defineEmits<{ 'update:open': [open: boolean] }>()

  const {
    instrument,
    error,
    selectedScript,
    canAdd,
    reset,
    selectScript,
    selectInstrument,
    confirm,
  } = useAlertDraft({
    alerts: () => props.alerts,
    currentSpec: () => props.currentSpec,
  })

  const scriptPickerOpen = ref(false)
  // 字段组的可访问名称：视觉标签与控件通过 id 关联，读屏进入分组时能听到字段用途。
  const scriptLabelId = useId()
  const symbolLabelId = useId()

  watch(
    () => props.open,
    (open) => {
      // 任一方向都先收起脚本选择器；打开时再重置草稿。
      scriptPickerOpen.value = false
      if (open) reset()
    },
  )

  function close(): void {
    emit('update:open', false)
  }

  function submit(): void {
    if (confirm()) close()
  }
</script>

<style scoped>
  .alert-draft__dialog-title {
    font-size: var(--klc-text-label-13-font-size, 13px);
    line-height: var(--klc-text-label-13-line-height, 18px);
  }

  .alert-draft__error {
    display: flex;
    align-items: flex-start;
    gap: var(--klc-space-8);
    margin: var(--klc-space-8) var(--base-modal-content-inset) 0;
    padding: var(--klc-space-8) var(--klc-space-12);
    border-radius: var(--klc-radius-sm);
    background: var(--klc-color-ui-danger-background);
    color: var(--klc-color-ui-danger-text);
    font-size: var(--klc-text-12-font-size);
    line-height: var(--klc-text-12-line-height);
  }

  .alert-draft__error svg {
    flex: none;
    margin-top: 0.15em;
  }

  .alert-draft {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-16);
    padding: var(--klc-space-8) var(--base-modal-content-inset) var(--klc-space-12);
  }

  .alert-draft__section {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-8);
  }

  .alert-draft__section-title {
    margin: 0;
    font-size: var(--klc-text-12-font-size);
    line-height: var(--klc-text-12-line-height);
    font-weight: var(--klc-text-label-12-font-weight);
    color: var(--klc-color-ui-muted);
  }
</style>
