<!-- 布局管理下拉：商品选择同款 trigger，保存与最近布局在同一面板内。 -->
<template>
  <DropMenu :label="currentName" :groups="groups" :disabled="!controller" :message="message" empty-text="暂无布局" trigger-class="symbol-chip" tooltip-placement="bottom" placement="bottom" panel-width="220px" keep-open-on-select @open="refresh" @select="onSelect">
    <template #trigger><span class="symbol-chip__code">{{ currentName }}{{ dirty ? ' *' : '' }}</span></template>
    <template #item="{ group, item, select }">
      <form v-if="group.id === 'layouts' && edit?.mode === 'rename' && edit.id === item.id" class="drop-menu__item-editor" @submit.stop.prevent="submit" @keydown.stop @keydown.esc.prevent="edit = null">
        <input :ref="focusRenameInput" v-model="name" name="layout-name" :aria-label="`重命名 ${item.label}`" required :disabled="busy" @click.stop />
      </form>
      <button v-else type="button" role="menuitem" class="drop-menu__item-main" :disabled="item.disabled" @click="select">
        <IconDeviceFloppy v-if="item.id === 'save' && group.id === 'actions'" aria-hidden="true" />
        <IconDeviceFloppy v-else-if="item.id === 'autosave' && group.id === 'actions'" aria-hidden="true" />
        <IconPlus v-else-if="group.id === 'create'" aria-hidden="true" />
        <span>{{ item.label }}</span>
        <span v-if="item.id === 'autosave' && group.id === 'actions'" class="drop-menu__switch" role="switch" :aria-checked="autoSave" aria-label="自动保存"><span /></span>
      </button>
    </template>
    <template #item-action="{ group, item }">
      <span v-if="group.id === 'actions' && item.id === 'save' && saved" class="drop-menu__status" role="status" aria-label="布局保存成功"><IconCheck aria-hidden="true" /></span>
      <button v-if="group.id === 'layouts'" type="button" :disabled="busy" :aria-label="`复制 ${item.label}`" title="复制" @click.stop="begin('duplicate', layouts.find(layout => layout.id === item.id))"><IconCopy aria-hidden="true" /></button>
      <button v-if="group.id === 'layouts'" type="button" :disabled="busy" :aria-label="`重命名 ${item.label}`" title="重命名" @click.stop="begin('rename', layouts.find(layout => layout.id === item.id))"><IconPencil aria-hidden="true" /></button>
      <button v-if="group.id === 'layouts' && item.id !== 'default' && item.id !== activeId" type="button" class="drop-menu__action--danger" :disabled="busy" :aria-label="`删除 ${item.label}`" title="删除" @click.stop="deleting = item.id"><IconTrash aria-hidden="true" /></button>
      <span v-if="group.id === 'layouts' && item.id === activeId" class="drop-menu__status"><IconCheck aria-label="当前布局" /></span>
    </template>
    <template #footer>
      <div v-if="deleting || (edit && edit.mode !== 'rename')" class="layout-menu__editor">
        <div v-if="deleting" class="layout-menu__actions">
          <span>确定删除此布局？</span>
          <button type="button" class="control-button control-button--sm" :disabled="busy" @click="remove(deleting)">删除</button>
          <button type="button" class="control-button control-button--sm" :disabled="busy" @click="deleting = null">取消</button>
        </div>
        <form v-if="edit && edit.mode !== 'rename'" class="layout-menu__form" @submit.prevent="submit" @keydown.stop>
          <label>{{ edit.mode === 'duplicate' ? '复制布局' : '创建新布局' }}
            <input v-model="name" name="layout-name" placeholder="布局名称" required :disabled="busy" />
          </label>
          <div class="layout-menu__actions">
            <button type="submit" class="control-button control-button--sm" :disabled="busy || !name.trim()">{{ edit.mode === 'create' ? '创建' : '保存' }}</button>
            <button type="button" class="control-button control-button--sm" :disabled="busy" @click="edit = null">取消</button>
          </div>
        </form>
      </div>
    </template>
  </DropMenu>
</template>

<script setup lang="ts">
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { toRef } from 'vue'
  import IconCheck from '~icons/tabler/check'
  import IconCopy from '~icons/tabler/copy'
  import IconDeviceFloppy from '~icons/tabler/device-floppy'
  import IconPencil from '~icons/tabler/pencil'
  import IconPlus from '~icons/tabler/plus'
  import IconTrash from '~icons/tabler/trash'
  import { useLayouts } from '../composables/chart/useLayouts.js'
  import DropMenu from './DropMenu.vue'

  const props = defineProps<{ controller: ChartController | null }>()
  const {
    layouts,
    begin,
    focusRenameInput,
    groups,
    activeId,
    currentName,
    busy,
    saved,
    message,
    autoSave,
    dirty,
    name,
    edit,
    deleting,
    refresh,
    onSelect,
    submit,
    remove,
  } = useLayouts(toRef(props, 'controller'))
</script>

<style scoped src="./common/control-button.css"></style>
<style scoped>
.symbol-chip__code { display: block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.layout-menu__editor { display: grid; gap: 8px; color: var(--klc-color-ui-text); font-size: 12px; }
.layout-menu__actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.layout-menu__form, .layout-menu__form label { display: grid; gap: 8px; }
.layout-menu__form input { border: 1px solid var(--klc-color-ui-border); background: var(--klc-color-ui-control-background); color: var(--klc-color-ui-text); padding: 8px; border-radius: 6px; font: inherit; min-width: 0; }
</style>
