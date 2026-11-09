<!-- 指标模板菜单：工具栏独立入口，弹层分「指标」与「模板」两个页签。 -->
<template>
  <div class="indicator-template">
    <BaseTooltip content="指标模板" placement="bottom">
      <button
        ref="trigger"
        type="button"
        class="control-button indicator-template__trigger"
        aria-label="指标模板"
        aria-haspopup="dialog"
        :aria-expanded="open"
        :disabled="!controller"
        @click="toggle"
      >
        <IconTablerLayoutGridAdd aria-hidden="true" />
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
        <div class="indicator-template__tabs" role="tablist" aria-label="指标模板页签">
          <button
            type="button"
            role="tab"
            class="indicator-template__tab"
            :class="{ 'is-active': tab === INDICATOR_TEMPLATE_TABS.indicators }"
            :aria-selected="tab === INDICATOR_TEMPLATE_TABS.indicators"
            @click="setTab(INDICATOR_TEMPLATE_TABS.indicators)"
          >
            指标
          </button>
          <button
            type="button"
            role="tab"
            class="indicator-template__tab"
            :class="{ 'is-active': tab === INDICATOR_TEMPLATE_TABS.templates }"
            :aria-selected="tab === INDICATOR_TEMPLATE_TABS.templates"
            @click="setTab(INDICATOR_TEMPLATE_TABS.templates)"
          >
            模板
          </button>
        </div>
      </template>

      <div class="indicator-template__content">
        <div v-if="error" class="indicator-template__error" role="alert">{{ error }}</div>
        <div v-if="message" class="indicator-template__message" role="status">{{ message }}</div>

        <!-- 页签一：保存入口、最近用过、打开模板入口。 -->
        <template v-if="tab === INDICATOR_TEMPLATE_TABS.indicators">
          <OverlayScrollArea class="indicator-template__scroll">
            <button type="button" class="indicator-template__row" @click="openSaveDialog">
              <IconTablerDeviceFloppy aria-hidden="true" />
              <span>保存指标模板…</span>
              <span
                v-if="saved"
                class="indicator-template__saved"
                role="status"
                aria-label="模板已保存"
              >
                <IconTablerCheck aria-hidden="true" />
              </span>
            </button>

            <template v-if="recentTemplates.length > 0">
              <div class="indicator-template__group-title">最近用过</div>
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
                  <span class="indicator-template__item-labels">{{ describeLabels(template) }}</span>
                </button>
                <BaseTooltip content="删除" placement="top">
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

            <div class="indicator-template__footer-row">
              <button
                type="button"
                class="indicator-template__row"
                @click="setTab(INDICATOR_TEMPLATE_TABS.templates)"
              >
                <IconTablerFolderOpen aria-hidden="true" />
                <span>打开模板…</span>
              </button>
            </div>
          </OverlayScrollArea>
        </template>

        <!-- 页签二：搜索与完整模板列表。 -->
        <template v-else>
          <div class="indicator-template__search">
            <ModalSearchBar
              v-model="searchQuery"
              placeholder="搜索模板名称..."
              aria-label="搜索模板"
            />
          </div>
          <OverlayScrollArea class="indicator-template__scroll">
            <div class="indicator-template__list-head">模板名称</div>
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
                <span class="indicator-template__item-labels">{{ describeLabels(template) }}</span>
              </button>
              <BaseTooltip content="重命名" placement="top">
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
              <BaseTooltip content="删除" placement="top">
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
      :labels="currentIndicatorLabels"
      :busy="busy"
      :error="error"
      @close="closeSave"
      @submit="submitSave"
    />
    <IndicatorTemplateNameDialog
      :show="renaming !== null"
      title="重命名模板"
      :initial-name="renaming?.name ?? ''"
      :labels="null"
      :busy="busy"
      :error="error"
      @close="closeRename"
      @submit="submitRename"
    />
  </div>
</template>

<script setup lang="ts">
  import type {
    ChartController,
    IndicatorTemplateSummary,
  } from '@363045841yyt/klinechart-core/controllers'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import ModalSearchBar from '@vue-src/components/common/ModalSearchBar.vue'
  import OverlayScrollArea from '@vue-src/components/common/OverlayScrollArea.vue'
  import {
    INDICATOR_TEMPLATE_TABS,
    useIndicatorTemplates,
  } from '@vue-src/composables/indicator/useIndicatorTemplates.js'
  import { computed, onBeforeUnmount, ref } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerDeviceFloppy from '~icons/tabler/device-floppy'
  import IconTablerFolderOpen from '~icons/tabler/folder-open'
  import IconTablerLayoutGridAdd from '~icons/tabler/layout-grid-add'
  import IconTablerPencil from '~icons/tabler/pencil'
  import IconTablerTrash from '~icons/tabler/trash'
  import IndicatorTemplateNameDialog from './IndicatorTemplateNameDialog.vue'

  const props = defineProps<{
    controller?: ChartController | null
  }>()

  const controller = computed(() => props.controller ?? null)
  const {
    tab,
    searchQuery,
    busy,
    error,
    message,
    saving,
    saved,
    currentIndicatorLabels,
    visibleTemplates,
    recentTemplates,
    describeLabels,
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
  const trigger = ref<HTMLElement | null>(null)
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
  async function submitSave(name: string): Promise<void> {
    if (!(await save(name))) return
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
  .indicator-template__trigger {
    display: inline-grid;
    place-items: center;
  }

  .indicator-template__trigger svg {
    width: 16px;
    height: 16px;
  }

  .indicator-template__tabs {
    display: flex;
    gap: var(--klc-space-16, 16px);
  }

  .indicator-template__tab {
    padding: var(--klc-space-4, 4px) 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--klc-color-ui-text-secondary);
    font-size: var(--klc-font-size-sm, 12px);
    cursor: pointer;
  }

  .indicator-template__tab.is-active {
    border-bottom-color: var(--klc-color-ui-focus);
    color: var(--klc-color-ui-text);
  }

  .indicator-template__content {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .indicator-template__error,
  .indicator-template__message {
    margin: 0;
    padding: var(--klc-space-8, 8px) var(--klc-space-16, 16px);
    font-size: var(--klc-font-size-sm, 12px);
  }

  .indicator-template__error {
    color: var(--klc-color-danger, #e04a4a);
  }

  .indicator-template__message {
    color: var(--klc-color-ui-text-secondary);
  }

  .indicator-template__search {
    padding: var(--klc-space-8, 8px) var(--klc-space-16, 16px);
  }

  .indicator-template__scroll {
    flex: 1;
    min-height: 0;
  }

  .indicator-template__row {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    width: 100%;
    padding: var(--klc-space-8, 8px) var(--klc-space-16, 16px);
    border: 0;
    background: none;
    color: var(--klc-color-ui-text);
    font-size: var(--klc-font-size-md, 13px);
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

  .indicator-template__group-title,
  .indicator-template__list-head {
    padding: var(--klc-space-8, 8px) var(--klc-space-16, 16px);
    font-size: var(--klc-font-size-sm, 12px);
    color: var(--klc-color-ui-text-secondary);
  }

  .indicator-template__list-head {
    border-bottom: 1px solid var(--klc-color-ui-border);
  }

  .indicator-template__item {
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    padding-right: var(--klc-space-8, 8px);
  }

  .indicator-template__item:hover {
    background: var(--klc-color-ui-hover);
  }

  .indicator-template__item-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
    padding: var(--klc-space-8, 8px) var(--klc-space-16, 16px);
    border: 0;
    background: none;
    color: var(--klc-color-ui-text);
    text-align: left;
    cursor: pointer;
  }

  .indicator-template__item-name {
    font-size: var(--klc-font-size-md, 13px);
  }

  .indicator-template__item-labels {
    overflow: hidden;
    color: var(--klc-color-ui-text-secondary);
    font-size: var(--klc-font-size-sm, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .indicator-template__item-action svg {
    width: 16px;
    height: 16px;
  }

  .indicator-template__footer-row {
    border-top: 1px solid var(--klc-color-ui-border);
  }

  .indicator-template__empty {
    margin: 0;
    padding: var(--klc-space-24, 24px) var(--klc-space-16, 16px);
    color: var(--klc-color-ui-text-secondary);
    font-size: var(--klc-font-size-sm, 12px);
    text-align: center;
  }
</style>
