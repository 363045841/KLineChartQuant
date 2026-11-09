<!-- 指标模板名称弹窗：保存与重命名共用，名称校验与预填逻辑只实现一次。 -->
<template>
  <BaseModal
    :open="show"
    :title="title"
    width="min(92vw, 360px)"
    :close-on-overlay="!busy"
    :show-close="!busy"
    @update:open="!$event && emit('close')"
  >
    <form :id="formId" class="template-name" @submit.prevent="submit">
      <label class="template-name__label" :for="nameId">名称</label>
      <BaseInput
        :id="nameId"
        v-model="name"
        variant="underline"
        maxlength="40"
        autocomplete="off"
        :disabled="busy"
        autofocus
        @focus="selectOnOpen"
      />
      <div v-if="indicators !== null" class="template-name__summary">
        <span class="template-name__summary-title">指标</span>
        <p v-if="indicators.length === 0" class="template-name__empty">当前图表没有指标</p>
        <p v-else-if="visibleIndicators.length === 0" class="template-name__empty">未选择指标</p>
        <div v-else class="template-name__chips">
          <BaseChip
            v-for="entry in visibleIndicators"
            :key="entry.id"
            removable
            :remove-label="`移除 ${chipLabel(entry)}`"
            @remove="removeIndicator(entry.id)"
          >
            {{ chipLabel(entry) }}
          </BaseChip>
        </div>
      </div>
      <span v-if="error" class="template-name__error" role="alert">{{ error }}</span>
    </form>
    <template #footer>
      <BaseButton :disabled="busy" @click="emit('close')">取消</BaseButton>
      <BaseButton type="submit" :form="formId" :disabled="!name.trim() || busy">保存</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import type { IndicatorTemplateIndicator } from '@363045841yyt/klinechart-core/controllers'
  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseChip from '@vue-src/components/common/BaseChip.vue'
  import BaseInput from '@vue-src/components/common/BaseInput.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import { computed, ref, useId, watch } from 'vue'

  const props = defineProps<{
    show: boolean
    /** 弹窗标题，保存与重命名分别传入。 */
    title: string
    /** 打开时预填的名称；保存时为空串。 */
    initialName: string
    /** 保存时展示的指标摘要；重命名传 null 表示不展示。 */
    indicators: ReadonlyArray<IndicatorTemplateIndicator> | null
    busy: boolean
    error: string
  }>()
  const emit = defineEmits<{
    close: []
    submit: [name: string, indicatorIds: ReadonlyArray<string> | null]
  }>()

  const formId = useId()
  const nameId = `${formId}-name`
  const name = ref('')
  // 只在弹窗打开时选中预填文本，之后用户点入输入框可正常定位光标。
  let selectPending = false
  /** 本次保存中已移除的指标定义；关闭或重新打开时清空。 */
  const removedIds = ref<ReadonlySet<string>>(new Set())

  /** 胶囊展示的文本：同名指标多实例时带数量。 */
  function chipLabel(entry: IndicatorTemplateIndicator): string {
    return entry.count > 1 ? `${entry.label} x ${entry.count}` : entry.label
  }

  /** 仍参与本次保存的指标，按当前图表顺序。 */
  const visibleIndicators = computed(
    () => props.indicators?.filter((entry) => !removedIds.value.has(entry.id)) ?? [],
  )

  /** 打开时用调用方给的值预填，并允许首次聚焦全选以便直接替换。 */
  watch(
    () => props.show,
    (visible) => {
      if (!visible) return
      name.value = props.initialName
      selectPending = true
      removedIds.value = new Set()
    },
  )

  /** 从本次保存的模板中移除一个指标；不修改当前图表。 */
  function removeIndicator(id: string): void {
    const next = new Set(removedIds.value)
    next.add(id)
    removedIds.value = next
  }

  /** 首次聚焦时全选预填名称。 */
  function selectOnOpen(event: FocusEvent): void {
    if (!selectPending || !(event.target instanceof HTMLInputElement)) return
    selectPending = false
    event.target.select()
  }

  /** 提交名称与仍保留的指标；空名称由按钮禁用与父级校验双重拦下。 */
  function submit(): void {
    const value = name.value.trim()
    if (!value || props.busy) return
    emit(
      'submit',
      value,
      props.indicators === null ? null : visibleIndicators.value.map((entry) => entry.id),
    )
  }
</script>

<style scoped>
  .template-name {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-8, 8px);
  }

  .template-name__label {
    font-size: var(--klc-text-12-font-size, 12px);
    color: var(--klc-color-ui-text-secondary);
  }

  .template-name__summary {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-8, 8px);
    margin-top: var(--klc-space-8, 8px);
    padding-top: var(--klc-space-8, 8px);
  }

  .template-name__summary-title {
    font-size: var(--klc-text-12-font-size, 12px);
    color: var(--klc-color-ui-text-secondary);
  }

  .template-name__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--klc-space-6, 6px);
  }

  .template-name__empty {
    margin: 0;
    font-size: var(--klc-text-12-font-size, 12px);
    color: var(--klc-color-ui-text-secondary);
  }

  .template-name__error {
    font-size: var(--klc-text-12-font-size, 12px);
    color: var(--klc-color-danger, #e04a4a);
  }
</style>
