<!-- 指标模板菜单：工具栏独立入口，弹层分「指标」与「模板」两个页签。 -->
<template>
  <div class="indicator-template">
    <ControlTrigger label="指标" @click="emit('toggleIndicator')">
      <IconTablerMathFunction class="indicator-template__icon" aria-hidden="true" />
      <span>指标</span>
    </ControlTrigger>
    <BaseTooltip content="指标模板" placement="bottom" :disabled="open">
      <button
        ref="trigger"
        type="button"
        class="control-button indicator-template__entry"
        aria-label="指标模板"
        aria-haspopup="dialog"
        :aria-expanded="open"
        :disabled="!controller"
        @click="toggle"
      >
        <IconBookmark aria-hidden="true" />
      </button>
    </BaseTooltip>

    <BaseModal
      :open="open"
      title="指标模板"
      width="min(640px, calc(100vw - 32px))"
      max-height="min(560px, 75dvh)"
      overlay-padding="var(--klc-space-16, 16px)"
      body-padding="0"
      :body-scrollable="false"
      @update:open="!$event && close()"
    >
      <template #tabs>
        <BaseTabs v-model="tab" :tabs="TEMPLATE_TABS" aria-label="指标模板页签" />
        <ModalSearchBar
          v-if="tab === INDICATOR_TEMPLATE_TABS.templates"
          v-model="searchQuery"
          placeholder="搜索模板名称..."
          aria-label="搜索模板"
          :top-border="false"
        />
      </template>

      <div class="indicator-template__content">
        <div v-if="error" class="indicator-template__error" role="alert">{{ error }}</div>
        <div v-if="message" class="indicator-template__message" role="status">{{ message }}</div>

        <!-- 页签一：保存与打开入口、最近使用的模板。 -->
        <template v-if="tab === INDICATOR_TEMPLATE_TABS.indicators">
          <OverlayScrollArea class="indicator-template__scroll">
            <button type="button" class="indicator-template__row" @click="openSaveDialog">
              <IconTablerDeviceFloppy aria-hidden="true" />
              <span>保存指标模板</span>
              <span
                v-if="saved"
                class="indicator-template__saved"
                role="status"
                aria-label="模板已保存"
              >
                <IconTablerCheck aria-hidden="true" />
              </span>
            </button>
            <button
              type="button"
              class="indicator-template__row"
              @click="setTab(INDICATOR_TEMPLATE_TABS.templates)"
            >
              <IconTablerFolderOpen aria-hidden="true" />
              <span>打开模板</span>
            </button>

            <div class="indicator-template__group-title">最近</div>
            <template v-if="recentTemplates.length > 0">
              <div
                v-for="template in recentTemplates"
                :key="template.id"
                class="indicator-template__item"
              >
                <button
                  type="button"
                  class="indicator-template__item-main"
                  :disabled="busy"
                  @click="applyTemplate(template.id)"
                >
                  <span class="indicator-template__item-name">{{ template.name }}</span>
                  <span class="indicator-template__item-chips">
                    <BaseChip
                      v-for="(label, index) in template.labels"
                      :key="`${template.id}-${index}`"
                      size="sm"
                    >
                      {{ label }}
                    </BaseChip>
                    <span
                      v-if="template.labels.length === 0"
                      class="indicator-template__item-empty"
                    >
                      无指标
                    </span>
                  </span>
                </button>
                <BaseTooltip content="删除" placement="bottom">
                  <button
                    type="button"
                    class="indicator-template__item-action"
                    :aria-label="`删除 ${template.name}`"
                    :disabled="busy"
                    @click="removeTemplate(template.id)"
                  >
                    <IconTablerTrash aria-hidden="true" />
                  </button>
                </BaseTooltip>
              </div>
            </template>
            <p v-else class="indicator-template__empty">暂无最近使用的模板</p>
          </OverlayScrollArea>
        </template>

        <!-- 页签二：搜索与完整模板列表。 -->
        <template v-else>
          <OverlayScrollArea class="indicator-template__scroll">
            <div
              v-for="template in visibleTemplates"
              :key="template.id"
              class="indicator-template__item"
            >
              <button
                type="button"
                class="indicator-template__item-main"
                :disabled="busy"
                @click="applyTemplate(template.id)"
              >
                <span class="indicator-template__item-name">{{ template.name }}</span>
                <span class="indicator-template__item-chips">
                  <BaseChip
                    v-for="(label, index) in template.labels"
                    :key="`${template.id}-${index}`"
                    size="sm"
                  >
                    {{ label }}
                  </BaseChip>
                  <span v-if="template.labels.length === 0" class="indicator-template__item-empty">
                    无指标
                  </span>
                </span>
              </button>
              <BaseTooltip content="重命名" placement="bottom">
                <button
                  type="button"
                  class="indicator-template__item-action"
                  :aria-label="`重命名 ${template.name}`"
                  :disabled="busy"
                  @click="startRename(template)"
                >
                  <IconTablerPencil aria-hidden="true" />
                </button>
              </BaseTooltip>
              <BaseTooltip content="删除" placement="bottom">
                <button
                  type="button"
                  class="indicator-template__item-action"
                  :aria-label="`删除 ${template.name}`"
                  :disabled="busy"
                  @click="removeTemplate(template.id)"
                >
                  <IconTablerTrash aria-hidden="true" />
                </button>
              </BaseTooltip>
            </div>
            <p v-if="visibleTemplates.length === 0" class="indicator-template__empty">
              {{ searchQuery.trim() ? '未找到匹配的模板' : '暂无模板' }}
            </p>
          </OverlayScrollArea>
        </template>
      </div>
    </BaseModal>

    <IndicatorTemplateNameDialog
      :show="saving"
      title="保存指标模板"
      :initial-name="''"
      :indicators="currentIndicators"
      :busy="busy"
      :error="error"
      @close="closeSave"
      @submit="submitSave"
    />
    <IndicatorTemplateNameDialog
      :show="renaming !== null"
      title="重命名模板"
      :initial-name="renaming?.name ?? ''"
      :indicators="null"
      :busy="busy"
      :error="error"
      @close="closeRename"
      @submit="submitRename"
    />
  </div>
</template>

<script setup lang="ts">
  import '../../../common/control-button.css'

  import type {
    ChartController,
    IndicatorTemplateSummary,
  } from '@363045841yyt/klinechart-core/controllers'
  import BaseChip from '@vue-src/components/common/BaseChip.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import BaseTabs from '@vue-src/components/common/BaseTabs.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import ControlTrigger from '@vue-src/components/common/ControlTrigger.vue'
  import ModalSearchBar from '@vue-src/components/common/ModalSearchBar.vue'
  import OverlayScrollArea from '@vue-src/components/common/OverlayScrollArea.vue'
  import {
    INDICATOR_TEMPLATE_TABS,
    type IndicatorTemplateTab,
    useIndicatorTemplates,
  } from '@vue-src/composables/indicator/useIndicatorTemplates.js'
  import { computed, onBeforeUnmount, ref } from 'vue'
  import IconBookmark from '~icons/tabler/bookmark'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerDeviceFloppy from '~icons/tabler/device-floppy'
  import IconTablerFolderOpen from '~icons/tabler/folder-open'
  import IconTablerMathFunction from '~icons/tabler/math-function'
  import IconTablerPencil from '~icons/tabler/pencil'
  import IconTablerTrash from '~icons/tabler/trash'
  import IndicatorTemplateNameDialog from './IndicatorTemplateNameDialog.vue'

  const props = defineProps<{
    controller?: ChartController | null
  }>()
  const emit = defineEmits<{ toggleIndicator: [] }>()

  /** 弹层页签顺序；统一交给 BaseTabs 渲染。 */
  const TEMPLATE_TABS: ReadonlyArray<{ id: IndicatorTemplateTab; label: string }> = [
    { id: INDICATOR_TEMPLATE_TABS.indicators, label: '指标' },
    { id: INDICATOR_TEMPLATE_TABS.templates, label: '模板' },
  ]

  const controller = computed(() => props.controller ?? null)
  const {
    tab,
    searchQuery,
    busy,
    error,
    message,
    saving,
    saved,
    currentIndicators,
    visibleTemplates,
    recentTemplates,
    refresh,
    save,
    apply,
    remove,
    rename,
    openSave,
    closeSave,
    setTab,
  } = useIndicatorTemplates(controller)

  const open = ref(false)
  const trigger = ref<HTMLButtonElement | null>(null)
  /** 重命名目标；null 表示对话框关闭。 */
  const renaming = ref<IndicatorTemplateSummary | null>(null)

  /** 打开或关闭弹层；打开时读取真实归档。 */
  function toggle(): void {
    if (open.value) {
      close()
      return
    }
    open.value = true
    void refresh()
  }

  /** 关闭弹层，复位页签与搜索词，并把焦点还给触发按钮。 */
  function close(): void {
    open.value = false
    closeSave()
    closeRename()
    setTab(INDICATOR_TEMPLATE_TABS.indicators)
    searchQuery.value = ''
    trigger.value?.focus()
  }

  /** 打开保存对话框；先收起主弹层，避免两层模态叠加。 */
  function openSaveDialog(): void {
    open.value = false
    openSave()
  }

  /** 提交保存；成功后关闭对话框并刷新列表。 */
  async function submitSave(
    name: string,
    indicatorIds: ReadonlyArray<string> | null,
  ): Promise<void> {
    const done = indicatorIds === null ? await save(name) : await save(name, indicatorIds)
    if (!done) return
    closeSave()
    await refresh()
  }

  /** 应用模板并保持弹层打开，让用户看到结果提示。 */
  async function applyTemplate(id: string): Promise<void> {
    await apply(id)
  }

  /** 删除模板；失败文案由组合式函数写入。 */
  async function removeTemplate(id: string): Promise<void> {
    await remove(id)
  }

  /** 打开重命名对话框。 */
  function startRename(template: IndicatorTemplateSummary): void {
    renaming.value = template
  }

  /** 关闭重命名对话框。 */
  function closeRename(): void {
    renaming.value = null
  }

  /** 提交改名；成功后关闭对话框。 */
  async function submitRename(name: string): Promise<void> {
    const target = renaming.value
    if (!target) return
    if (await rename(target.id, name)) closeRename()
  }

  onBeforeUnmount(() => {
    closeSave()
    closeRename()
  })

  defineExpose({ toggle, close })
</script>


<style scoped>
  .indicator-template {
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
  }

  .indicator-template__icon {
    width: 16px;
    height: 16px;
  }

  /* 模板入口只保留图标，外观与自选股等工具栏图标按钮一致。 */
  .indicator-template__entry {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-muted);
  }

  .indicator-template__entry:hover:not(:disabled),
  .indicator-template__entry[aria-expanded='true']:not(:disabled) {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .indicator-template__entry svg {
    width: 18px;
    height: 18px;
  }

  .indicator-template__content {
    display: flex;
    flex-direction: column;
    /* 内容区自身提供高度，避免没有最近记录时弹窗塌成两行。 */
    height: min(320px, calc(75dvh - 88px));
    min-height: 0;
  }

  .indicator-template__error,
  .indicator-template__message {
    margin: 0;
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px);
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .indicator-template__error {
    color: var(--klc-color-danger, #e04a4a);
  }

  .indicator-template__message {
    color: var(--klc-color-ui-text-secondary);
  }

  .indicator-template__scroll {
    flex: 1;
    min-height: 0;
    padding: 0;
  }

  .indicator-template__row {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    width: 100%;
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px);
    border: 0;
    background: none;
    color: var(--klc-color-ui-text);
    font-size: var(--klc-text-12-font-size, 12px);
    text-align: left;
    cursor: pointer;
  }

  .indicator-template__row:hover {
    background: var(--klc-color-ui-hover);
  }

  .indicator-template__row svg {
    width: 16px;
    height: 16px;
  }

  .indicator-template__saved {
    margin-left: auto;
    color: var(--klc-color-success, #21a05f);
  }

  .indicator-template__group-title {
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px);
    font-size: var(--klc-text-12-font-size, 12px);
    color: var(--klc-color-ui-text-secondary);
  }

  .indicator-template__item {
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    padding-right: var(--klc-space-8, 8px);
  }

  /* 行 hover 用比胶囊更深的选中色，避免胶囊和行背景融在一起。 */
  .indicator-template__item:hover {
    background: var(--klc-color-ui-selected);
  }

  .indicator-template__item-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-flow: row nowrap;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px);
    border: 0;
    background: none;
    color: var(--klc-color-ui-text);
    text-align: left;
    cursor: pointer;
  }

  .indicator-template__item-name {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: var(--klc-text-12-font-size, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .indicator-template__item-chips {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    gap: var(--klc-space-4, 4px);
    min-width: 0;
  }

  .indicator-template__item-empty {
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .indicator-template__item-action {
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 0;
    background: none;
    color: var(--klc-color-ui-text-secondary);
    cursor: pointer;
    opacity: 0;
  }

  .indicator-template__item:hover .indicator-template__item-action,
  .indicator-template__item-action:focus-visible {
    opacity: 1;
  }

  /* 只高亮图标本身，不给按钮加背景或外框。 */
  .indicator-template__item-action:hover,
  .indicator-template__item-action:focus-visible {
    color: var(--klc-color-ui-text);
  }

  .indicator-template__item-action svg {
    width: 16px;
    height: 16px;
  }

  .indicator-template__empty {
    margin: 0;
    padding: var(--klc-space-24, 24px) var(--klc-space-12, 12px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
    text-align: center;
  }
</style>
