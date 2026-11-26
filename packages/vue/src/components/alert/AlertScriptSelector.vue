<!--
  警报脚本选择弹窗：列表直接订阅 Core 的 alertCatalog，宿主不传目录。
  - 只负责选择：点击整行发出 select 并请求关闭，不创建规则；
  - 行结构与指标选择弹窗同构，复用弹窗列表的共享排版；
  - 字号统一 12px，标题走 title 插槽。
-->
<template>
  <BaseModal body="list" :open="open" size="md" @update:open="!$event && emit('update:open', false)">
    <template #title>
      <span class="alert-script-selector__title">选择警报脚本</span>
    </template>

    <template #tabs>
      <ModalSearchBar
        v-model="searchQuery"
        placeholder="搜索警报脚本..."
        aria-label="搜索警报脚本"
      />
    </template>

    <div class="alert-script-selector__content">
      <ModalScrollArea>
        <div
          class="modal-list"
          role="list"
          aria-label="警报脚本列表"
          @pointerover="onPointerOver"
          @pointerleave="hideHighlight"
          @focusin="onFocusIn"
          @focusout="hideHighlight"
        >
          <SlidingHighlight ref="listHighlight" class="alert-script-selector__highlight" />
          <div
            v-for="script in filteredScripts"
            :key="script.id"
            class="modal-list-entry modal-list-row"
            role="listitem"
          >
            <button
              type="button"
              class="item-select"
              :aria-current="script.id === definitionId ? 'true' : undefined"
              @click="chooseScript(script)"
            >
              <div class="item-header">
                <span class="item-label">
                  <!-- 文本单独一层：省略号只裁文本。 -->
                  <span class="item-label__text">
                    {{ script.label }}
                    <span v-if="script.name && script.name !== script.label" class="item-name">
                      {{ script.name }}
                    </span>
                  </span>
                </span>
              </div>
            </button>
            <!-- 说明入口是整行的兄弟节点，不能嵌在选择按钮里。 -->
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
              <p class="modal-list-description__title">{{ script.name }}</p>
              <p class="modal-list-description">{{ script.description }}</p>
            </BasePopover>
            <span v-if="script.id === definitionId" class="item-check" aria-hidden="true">
              <IconTablerCheck />
            </span>
          </div>
        </div>

        <BaseEmptyState v-if="filteredScripts.length === 0" class="modal-list-item" role="status">
          <template v-if="isSearchEmpty" #icon><IconTablerSearch /></template>
          {{ emptyTitle }}
          <template v-if="isSearchEmpty" #hint>请尝试其他关键词</template>
        </BaseEmptyState>
      </ModalScrollArea>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/dialog/modal-list.css'
  import '@vue-src/components/common/dialog/modal-list-item.css'

  import { alertCatalog } from '@363045841yyt/klinechart-core/controllers'
  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import BaseModal from '@vue-src/components/common/dialog/BaseModal.vue'
  import ModalScrollArea from '@vue-src/components/common/dialog/ModalScrollArea.vue'
  import ModalSearchBar from '@vue-src/components/common/dialog/ModalSearchBar.vue'
  import BaseEmptyState from '@vue-src/components/common/feedback/BaseEmptyState.vue'
  import BasePopover from '@vue-src/components/common/overlay/BasePopover.vue'
  import SlidingHighlight from '@vue-src/components/common/SlidingHighlight.vue'
  import type { AlertScriptSelection } from '@vue-src/composables/alerts/useAlertDraft.js'
  import { useSlidingHighlight } from '@vue-src/composables/ui/useSlidingHighlight.js'
  import { coreSignalToVueRef } from '@vue-src/utils/signalBridge.js'
  import { computed, ref, watch } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerInfoCircle from '~icons/tabler/info-circle'
  import IconTablerSearch from '~icons/tabler/search'

  const props = defineProps<{
    open: boolean
    /** 当前选中的脚本身份；只用于列表打勾，不参与筛选。 */
    definitionId: string | null
  }>()

  const emit = defineEmits<{
    'update:open': [open: boolean]
    select: [script: AlertScriptSelection]
  }>()

  // 目录是 Core 注册表投影，选择器自己订阅；宿主只拿到用户选中的那一项。
  const scripts = coreSignalToVueRef(alertCatalog)
  const searchQuery = ref('')

  const isSearchEmpty = computed(() => searchQuery.value.trim().length > 0)
  const filteredScripts = computed(() => {
    const needle = searchQuery.value.trim().toLowerCase()
    if (needle.length === 0) return scripts.value
    return scripts.value.filter(
      (script) =>
        script.label.toLowerCase().includes(needle) || script.name.toLowerCase().includes(needle),
    )
  })
  const emptyTitle = computed(() =>
    isSearchEmpty.value ? '未找到匹配的警报脚本' : '没有可用的警报脚本',
  )

  const listHighlight = ref<InstanceType<typeof SlidingHighlight> | null>(null)
  const {
    onPointerOver,
    onFocusIn,
    hide: hideHighlight,
  } = useSlidingHighlight(listHighlight, (target) => target.closest<HTMLElement>('.modal-list-entry'))

  // 搜索让当前行消失时指针不会移动，高亮块会停在旧位置，这里主动收起。
  watch(filteredScripts, () => hideHighlight())

  // 每次打开回到完整列表，避免上次搜索词把当前选中项藏起来。
  watch(
    () => props.open,
    (open) => {
      if (open) searchQuery.value = ''
    },
  )

  /**
   * 选择一条脚本：只把草稿实际消费的身份与展示名交给宿主，并请求关闭弹窗。
   *
   * @param script 目录项；只投影草稿消费的 id 与 label
   */
  function chooseScript(script: AlertScriptSelection): void {
    emit('select', { id: script.id, label: script.label })
    emit('update:open', false)
  }
</script>

<style scoped>
  .alert-script-selector__title {
    font-size: var(--klc-text-12-font-size);
    line-height: var(--klc-text-12-line-height);
  }

  /* 列表固定高度：弹窗尺寸不随目录条数跳动；82px 是标题栏与搜索栏的合计高度。 */
  .alert-script-selector__content {
    display: flex;
    height: min(420px, calc(75dvh - 82px));
    min-height: 0;
  }

  .alert-script-selector__highlight {
    --sliding-highlight-radius: 0;
  }
</style>
