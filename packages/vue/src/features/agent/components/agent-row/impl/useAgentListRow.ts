/** 可编辑列表行的焦点管理与提交校验；展示模式由调用方统一维护。 */

import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
import BaseInput from '@vue-src/components/common/form/BaseInput.vue'
import { computed, nextTick, type Ref, useTemplateRef, watch } from 'vue'
import { type AgentLocale, getAgentCopy } from '../../../agent-copy/index.js'
import type { AgentListRowMode } from '../types.js'

/**
 * 面板按钮的本地化文案，以及模式切换后的受控聚焦。
 * @param props 行的展示模式与界面语言。
 * @param draft 行内名称草稿。
 * @param events 提交、删除与取消事件。
 */
export function useAgentListRow(
  props: { mode: AgentListRowMode; locale: AgentLocale },
  draft: Ref<string>,
  events: { submit(title: string): void; cancel(): void; delete(): void },
) {
  const text = computed(() => getAgentCopy(props.locale))
  const renameInput = useTemplateRef<InstanceType<typeof BaseInput>>('renameInput')
  const cancelButton = useTemplateRef<InstanceType<typeof BaseButton>>('cancelButton')

  /** 草稿去空白后非空才允许提交，避免产生空名称。 */
  const canSubmit = computed(() => draft.value.trim().length > 0)

  // 模式切换后把焦点交给当前编辑区域：重命名选中正文，删除确认落在取消，避免回车误删。
  watch(
    () => props.mode,
    (mode) => {
      void nextTick(() => {
        if (props.mode !== mode) return
        if (mode === 'rename') {
          renameInput.value?.focus()
          renameInput.value?.select()
        }
        if (mode === 'delete') cancelButton.value?.focus()
      })
    },
    { immediate: true },
  )

  /** 提交去空白的名称；是否退出编辑由调用方决定，校验失败需要保留输入。 */
  function submitRename(): void {
    if (!canSubmit.value) return
    events.submit(draft.value.trim())
  }

  /** 确认删除后退出确认区域。 */
  function confirmDelete(): void {
    events.delete()
    events.cancel()
  }

  return { text, canSubmit, submitRename, confirmDelete }
}
