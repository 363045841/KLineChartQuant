<template>
  <DropMenu
    :label="label"
    :groups="groups"
    :disabled="disabled"
    :message="message"
    empty-text="暂无模板"
    :trigger-class="triggerClass"
    @open="emit('open')"
    @select="select"
  >
    <template #trigger><slot name="trigger">{{ label }}</slot></template>
    <template #item-action="{ group, item }">
      <button
        v-if="group.id === 'apply' && canSave"
        type="button"
        :class="{ 'drop-menu__action--success': item.id === savedName }"
        :aria-label="item.id === savedName ? `已保存模板 ${item.label}` : `保存模板 ${item.label}`"
        :disabled="disabled || item.id === savedName"
        @click.stop="emit('saveExisting', item.id)"
      >
        <IconTablerCheck v-if="item.id === savedName" aria-hidden="true" />
        <IconTablerDeviceFloppy v-else aria-hidden="true" />
      </button>
      <button
        v-if="group.id === 'apply'"
        type="button"
        class="drop-menu__action--danger"
        :aria-label="`删除模板 ${item.label}`"
        :disabled="disabled"
        @click.stop="emit('remove', item.id)"
      ><IconTablerTrash aria-hidden="true" /></button>
    </template>
  </DropMenu>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerDeviceFloppy from '~icons/tabler/device-floppy'
  import IconTablerTrash from '~icons/tabler/trash'
  import DropMenu, { type DropMenuGroup } from './DropMenu.vue'

  const props = withDefaults(
    defineProps<{
      label: string
      names: ReadonlyArray<string>
      message?: string
      disabled?: boolean
      canSave?: boolean
      canApply?: boolean
      savedName?: string | null
      triggerClass?: string
      showSave?: boolean
    }>(),
    { disabled: false, canSave: false, canApply: true, savedName: null, showSave: false },
  )
  const emit = defineEmits<{
    open: []
    saveNew: []
    apply: [name: string]
    saveExisting: [name: string]
    remove: [name: string]
  }>()
  const groups = computed<DropMenuGroup[]>(() => [
    ...(props.showSave
      ? [
          {
            id: 'save',
            label: '保存',
            items: [
              { id: 'save', label: '保存为模板', disabled: props.disabled || !props.canSave },
            ],
          },
        ]
      : []),
    {
      id: 'apply',
      label: '应用模板',
      items: props.names.map((name) => ({
        id: name,
        label: name,
        disabled: props.disabled || !props.canApply,
      })),
    },
  ])
  function select(group: string, name: string) {
    if (group === 'save') emit('saveNew')
    else if (group === 'apply') emit('apply', name)
  }
</script>
