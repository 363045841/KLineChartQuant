# 脚本编辑器独立窗口

脚本编辑器工作区工具栏右侧提供「在新窗口打开」，把编辑界面搬进 Document Picture-in-Picture 窗口，便于主窗口继续看图的同时编辑脚本。原弹窗随之关闭，同一草稿不会同时出现两个编辑器。

## 承载方式

独立窗口是一个新的浏览器文档，编辑器通过 `Teleport` 挂载到该文档的 `body`：CodeMirror 与 Vue 组件仍是主应用的一部分，源码仓库、草稿与保存校验都只有一份，不需要第二个 Vue 应用，也不需要跨窗口消息通道。

`window.documentPictureInPicture` 尚未进入 `lib.dom`，能力探测与类型声明收敛在 `packages/vue/src/composables/chart/scriptEditor/impl/detachedWindow.ts`；不支持的浏览器不渲染该入口。

新文档没有主应用的样式与主题变量。打开时克隆样式表节点：普通应用在文档 `head`，Web Component 构建的组件样式只存在于图表宿主所在的 shadow root，因此按宿主所在根节点与文档两级复制，文档级在前、shadow 级在后。随后镜像 `html`、`body` 上的 `class` 与内联样式（图表主题的 CSS 变量写在 `body` 内联样式上），再以 `MutationObserver` 跟随主题切换。浮层默认 `Teleport` 到字符串 `'body'`，在独立窗口内会解析回主文档，因此窗口内的浮层目标改指向新文档的 `body`。

## 会话边界

窗口是副作用，编辑状态仍由 `useScriptEditor` 的会话持有；`useScriptEditorWindow` 只负责开关窗口与提供挂载点。

- 打开独立窗口即关闭页面内弹窗，避免同一草稿出现两个编辑器。
- 关闭独立窗口（`pagehide`，含浏览器自带的「返回标签页」）与窗口内「返回标签页」走同一条路径：释放窗口并把编辑器交回标签页弹窗。
- 交回弹窗只切换展示位置，不重新加载源码，未保存的草稿与保存用的 revision 都保留；结束编辑仍在弹窗里点「关闭」。
- 会话重新在页面内打开时关闭独立窗口，让弹窗成为唯一编辑器。

## 范围

只支持 Document Picture-in-Picture 可用的浏览器（Chromium 116+）。不额外提供 `window.open` 路径：两条窗口链路会各自带一套样式复制与状态同步逻辑，收益不足。
