<!-- 菜单内的只读声明预览：挂载时创建 CodeMirror，销毁时释放，避免外部排时序。 -->
<template>
  <div ref="host" class="klc-script-definition-preview"></div>
</template>

<script setup lang="ts">
  import { javascript } from '@codemirror/lang-javascript'
  import { EditorState } from '@codemirror/state'
  import { EditorView } from '@codemirror/view'
  import {
    scriptEditorHighlight,
    scriptEditorTheme,
  } from '@vue-src/composables/chart/scriptEditor/impl/editorTheme.js'
  import type { ScriptMenuPreview } from '@vue-src/composables/chart/scriptEditor/impl/scriptMenuModel.js'
  import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

  const props = defineProps<{ preview: ScriptMenuPreview; theme: 'light' | 'dark' }>()

  const host = useTemplateRef<HTMLDivElement>('host')
  let view: EditorView | null = null

  onMounted(() => {
    if (!host.value) return
    view = new EditorView({
      parent: host.value,
      state: EditorState.create({
        doc: props.preview.source,
        selection: { anchor: props.preview.from, head: props.preview.to },
        extensions: [
          javascript({ typescript: true }),
          scriptEditorTheme,
          scriptEditorHighlight(props.theme),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
        ],
      }),
    })
    view.dispatch({ effects: EditorView.scrollIntoView(props.preview.from, { y: 'center' }) })
  })

  onBeforeUnmount(() => view?.destroy())
</script>
