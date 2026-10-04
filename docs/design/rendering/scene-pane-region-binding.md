# Scene 绘制时绑定 Pane 区域

## 问题

ChartRenderer 在构建帧时依次调用所有 Pane 的 `beginFrame`，随后才调用 `scene.paint`。共享 GPU 后端在实际绘制时仍绑定最后一个 Pane，导致主图 K 线绘制到副图区域。图层的 Pane 过滤正确，但后端的绘制区域与业务上下文不一致。

## 决策

每个 `FramePaint` 必须携带 `SurfaceRegion` 和具备 `beginFrame` 能力的后端。ChartRenderer 负责生成上下文与区域；Scene 在每次 Pane 图层分发前绑定区域，并传递该绘制批次的 `clear` 标志。区域绑定与图层绘制由同一遍历驱动，避免准备阶段修改共享后端状态。

所有 Pane 上下文仍先构建完成，GPU 仍在全部绘制结束后由 ChartRenderer 调用一次 `endFrame`。Overlay 批次使用 `clear: false`，保留主层内容。WebGPU 与 WebGL 共用这一时序契约。

## 验证

Scene 回归用例使用同一后端绘制主图、副图和全局图层，检查绘制时绑定的区域及 Overlay 的保留标志。配合既有 Scene、K 线和 GPU 后端测试检查图层分发与统一提交行为。
