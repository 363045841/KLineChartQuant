<!--
  新建警报弹窗：选择警报脚本与作用品种，独立于警报面板。
  - 脚本用下拉菜单选择，不在弹窗内平铺全部脚本；
  - 品种默认当前图表品种，可搜索切换；
  - 字号统一 12px，标题走 title 插槽，不使用 deep。
-->
<template>
  <BaseModal
    body="list"
    :open="open"
    size="sm"
    footer-align="space-between"
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
        <section class="alert-draft__section">
          <h3 class="alert-draft__section-title">警报脚本</h3>

          <DropMenu
            class="selection-menu"
            label="选择警报脚本"
            :groups="scriptGroups"
            empty-text="没有可用的警报脚本"
            fill
            @select="onSelectScript"
          >
            <template #trigger>
              <span class="selection-menu__value">
                {{ selectedScript?.label ?? '选择脚本' }}
              </span>
              <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
            </template>
          </DropMenu>
        </section>

        <section class="alert-draft__section">
          <h3 class="alert-draft__section-title">作用品种</h3>

          <SymbolSelector
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
        </section>
      </div>
    </ModalScrollArea>

    <template #footer>
      <BaseButton size="sm" @click="close">取消</BaseButton>
      <BaseButton variant="primary" size="sm" :disabled="!canAdd" @click="submit">
        添加
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/menu/selection-menu.css'

  import type {
    AlertService,
    SymbolSpec,
  } from '@363045841yyt/klinechart-core/controllers'
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import BaseModal from '@vue-src/components/common/dialog/BaseModal.vue'
  import ModalScrollArea from '@vue-src/components/common/dialog/ModalScrollArea.vue'
  import DropMenu, {
    type DropMenuGroup,
  } from '@vue-src/components/common/menu/DropMenu.vue'
  import type { SymbolItem } from '@vue-src/components/symbol/SymbolSelector.vue'
  import SymbolSelector from '@vue-src/components/symbol/SymbolSelector.vue'
  import { useAlertDraft } from '@vue-src/composables/alerts/useAlertDraft.js'
  import type { AggregationSourceDefinition } from '@vue-src/composables/market/useAggregationSources.js'
  import type { SymbolSearchFn } from '@vue-src/composables/symbol/useSymbolSearch.js'
  import { computed, watch } from 'vue'
  import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'
  import IconChevronDown from '~icons/tabler/chevron-down'

  const props = defineProps<{
    open: boolean
    alerts: AlertService | null
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
    scripts,
    definitionId,
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

  const scriptGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'alerts',
      label: '',
      items: scripts.value.map((script) => ({
        id: script.id,
        label: script.label,
        checked: script.id === definitionId.value,
        selection: 'radio' as const,
      })),
    },
  ])

  watch(
    () => props.open,
    (open) => {
      if (open) reset()
    },
  )

  function onSelectScript(_groupId: string, itemId: string): void {
    selectScript(itemId)
  }

  function close(): void {
    emit('update:open', false)
  }

  function submit(): void {
    if (confirm()) close()
  }
</script>

<style scoped>
  .alert-draft__dialog-title {
    font-size: var(--klc-text-12-font-size);
    line-height: var(--klc-text-12-line-height);
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
    color: var(--klc-color-ui-text);
  }
</style>
