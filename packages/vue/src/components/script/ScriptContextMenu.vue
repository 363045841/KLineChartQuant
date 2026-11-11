<!-- 脚本右键菜单：分组列表、命名输入、二次确认与声明预览统一走 DropMenu 面板。 -->
<template>
  <DropMenu
    ref="menu"
    context
    controlled
    keep-open-on-select
    focus-on-open
    :open="open"
    :origin="origin"
    :body-mode="bodyMode"
    :panel-role="panelRole"
    :label="label"
    :groups="groups"
    :focus-target="focusTarget"
    @open="onOpen"
    @update:open="onUpdateOpen"
    @select="onSelect"
  >
    <template #body>
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
          <button type="button" class="script-menu__action" @click="model.close()">取消</button>
          <button
            v-auto-focus
            type="button"
            class="script-menu__action is-danger"
            :disabled="content.running"
            @click="model.confirmAction()"
          >
            {{ content.confirmLabel }}
          </button>
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
    </template>
  </DropMenu>
</template>

<script setup lang="ts">
  import DropMenu from '@vue-src/components/common/DropMenu.vue'
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
    panelRole,
    focusTarget,
    open,
    origin,
    onOpen,
    onUpdateOpen,
    onSelect,
  } = useScriptMenuPanel(props.model)
</script>
