<!-- 全局绘图锁定：与图元自身 locked 正交的移动冻结开关。 -->

# 全局绘图锁定

## 决策

全局绘图锁定是 `kernel.drawing` 上独立的布尔信号 `globalDrawingLock`，与每个图元自身的 `locked` 字段正交。打开全局锁**不改写任何图元的 `locked`**，只冻结图元的几何移动。

有效移动锁由纯函数统一判定：

```ts
isDrawingMovementLocked(drawing, globalLocked) = globalLocked || isDrawingLocked(drawing)
```

图元自身 `locked` 与全局锁互不覆盖：关闭全局锁后，各图元仍保留自己的锁定状态。

## 门禁范围

**移动被冻结**（走 `isDrawingMovementLocked`）：

- `DrawingInteractionController.startDrag` —— 不进入拖拽会话，光标下无拖动。
- `DrawingDocument.updateDrawing` —— 锚点变化时拒绝全量快照。
- `DrawingDocument.updateDrawingFromInput` —— 带 `anchors` 的声明式 patch 拒绝。
- `DrawingDocument.commitDrawingDrags` —— 拖拽落库整体拒绝。

**不冻结**：

- 删除（`removeDrawing` / `removeBatch`）只看图元自身 `locked`，全局锁不参与。
- undo/redo 历史回放照常（原本就绕过锁定策略）。
- 样式、显隐、zIndex、文本等非几何更新照常可写。
- 命中、悬停、选中、框选照常包含被全局锁定的图元。

## 单一事实来源

锁定判定此前已收敛在 `drawingAccess.ts` 的 `isDrawingLocked`，6 个强制点全部经由它。全局锁只在同一文件新增 `isDrawingMovementLocked`，移动类门禁改走该函数，删除类保持原函数，避免把「全局锁是否挡删除」的策略散落到各调用点。

全局锁状态进 StateKernel，是因为模型层（`DrawingDocument`）与交互层（`DrawingInteractionController`）都必须读到同一份状态；交互层通过 `DrawingDocumentPort.isGlobalDrawingLocked()` 读取，模型层直接读 `drawingState.readonly.globalDrawingLock`。
