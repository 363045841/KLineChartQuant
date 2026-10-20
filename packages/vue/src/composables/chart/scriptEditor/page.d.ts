/** 构建插件生成的独立编辑器资源，语言服务保留为独立的异步模块。 */
declare module 'virtual:klinechart-script-editor-page' {
  const page: { script: string; styles: readonly string[] }
  export default page
}
