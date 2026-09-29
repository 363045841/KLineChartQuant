/**
 * 外部渲染器 Demo（无状态）：主图中部蓝色虚线参考线 + 标签。
 *
 * 用法：预览工作台 URL 追加 ?externalRenderers=/external-demo-renderer.js
 * （本文件经 preview/public/ 原样服务，纯 ESM，不经 vite 转换）。
 * 契约：default 导出 Scene Layer（upstream #277，见 core rendering/scene/types）：
 * id/role/pane/z/visible/paint/dispose；paint 入参为 LayerPaint<RenderContext>
 * （即旧 RenderContext 加 paneId/clear/sceneRenderer 透传字段）。
 */
const layer = {
  id: 'kcq_demo_external',
  role: 'overlay',
  pane: 'main',
  z: 9999,
  visible: true,
  paint(context) {
    const ctx = context && context.ctx
    const pane = context && context.pane
    if (!ctx || !pane) return
    const width = pane.width || 800
    const y = pane.height * 0.5
    ctx.save()
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = 'rgba(41, 98, 255, 0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(41, 98, 255, 0.85)'
    ctx.font = '11px sans-serif'
    ctx.textBaseline = 'bottom'
    ctx.fillText('EXTERNAL RENDERER OK', 8, y - 4)
    ctx.restore()
  },
  dispose() {},
}

export default layer
