<!-- 脚本右键入口按内容使用菜单或锚定对话框。 -->
<template>
  <MenuSurface
    v-if="!bodyMode"
    ref="menu"
    :open="open"
    :anchor="anchor"
    keep-open-on-select
    focus-on-open
    :label="label"
    :groups="groups"
    :restore-focus-to="focusTarget"
    @open="onOpen"
    @update:open="onUpdateOpen"
    @select="onSelect"
  />
  <AnchoredDialog
    v-else
    ref="menu"
    :open="open"
    :anchor="anchor"
    :label="label"
    :restore-focus-to="focusTarget"
    @open="onOpen"
    @update:open="onUpdateOpen"
  >
      <div v-if="content?.kind === 'message'" class="klc-script-menu-status" role="status">
        {{ content.text }}
      </div>

      <ScriptMenuInput
        v-else-if="content?.kind === 'input'"
        :label="content.label"
        :value="content.value"
        :error="content.error"
        :running="content.running"
        @submit="model.submitInput($event)"
      />

      <div v-else-if="content?.kind === 'confirm'" class="script-menu__confirm">
        <div class="klc-script-menu-status">{{ content.text }}</div>
        <div v-if="content.error" class="klc-script-menu-status is-error" role="alert">
          {{ content.error }}
        </div>
        <div class="script-menu__actions">
          <BaseButton size="sm" @click="model.close()">取消</BaseButton>
          <BaseButton
            v-auto-focus
            size="sm"
            class="script-menu__danger"
            :disabled="content.running"
            @click="model.confirmAction()"
          >
            {{ content.confirmLabel }}
          </BaseButton>
        </div>
      </div>

      <div v-else-if="content?.kind === 'preview'" class="script-menu__preview">
        <div class="klc-script-preview-header">
          <div class="klc-script-preview-path" :title="content.preview.path">
            {{ content.preview.path }}
          </div>
          <button
            v-auto-focus
            type="button"
            class="klc-script-preview-close"
            aria-label="关闭声明预览"
            title="关闭声明预览 (Esc)"
            @click="model.close()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
        <ScriptDefinitionPreview :preview="content.preview" :theme="theme" />
      </div>
  </AnchoredDialog>
</template>

<script setup lang="ts">
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import MenuSurface from '@vue-src/components/common/menu/MenuSurface.vue'
  import AnchoredDialog from '@vue-src/components/common/overlay/AnchoredDialog.vue'
  import type { ScriptMenuModel } from '@vue-src/composables/chart/scriptEditor/impl/scriptMenuModel.js'
  import { useScriptMenuPanel } from '@vue-src/composables/chart/scriptEditor/impl/useScriptMenuPanel.js'
  import { vAutoFocus } from '@vue-src/utils/autoFocus.js'
  import ScriptDefinitionPreview from './ScriptDefinitionPreview.vue'
  import ScriptMenuInput from './ScriptMenuInput.vue'
  import './scriptMenuPanel.css'

  const props = withDefaults(
    defineProps<{
      model: ScriptMenuModel
      /** 声明预览的语法高亮配色。 */
      theme?: 'light' | 'dark'
    }>(),
    { theme: 'dark' },
  )

  const {
    menu,
    content,
    groups,
    bodyMode,
    label,
    focusTarget,
    open,
    anchor,
    onOpen,
    onUpdateOpen,
    onSelect,
  } = useScriptMenuPanel(props.model)
</script>
