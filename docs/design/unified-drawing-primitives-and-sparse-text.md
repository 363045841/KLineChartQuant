# 默认绘制统一原语与稀疏文字表面

问题是 drawing 已经生成公共原语，却仍声明为 context layer；混合文字批次因此绕过 GPU 直出，完整 2D 主画布也一直驻留。仅修改 role 只改变输出层带，没有完成原语通道迁移。

默认 drawing 投影现在由不接收 ctx 的 builder 转换为 PaintPrimitive。指标、用户文档和交互预览共用它；显式提供自定义 Canvas renderer 的扩展仍使用 context layer。比较线、足迹、极值和最新价线也只提交指令，坐标轴标签、范围带与十字线通过同一公共解释器执行。内部指标工厂必须显式选择 kind，避免无意回落到 context。

Scene 同时按目标和 kind 决定路由：只有 main draw-list 使用主图 GPU 表面，drawing 和 overlay 保持各自层带。主图几何与文字本来就处于两个 DOM 层，沿用几何在下、文字在上的语义。Scene 汇集 main 文字后一次提交给 Pane 拥有的 TextSurfacePool。

文字池按 256×256 物理像素网格分配。字体度量包含基线、旋转、行偏移及 maxWidth；跨格文字在每个相交网格按原顺序重放。网格在物理像素边界拼接，局部文字坐标扣除网格原点，避免额外缩放和 DPR 错位。空格不会分配表面，失效格立即归零并移除，不依赖浏览器延后释放。

当 main 没有自定义 context 层且 GPU 可直出时，完整 main 2D canvas 保留布局尺寸，像素后备存储归零。Canvas 后端和自定义 context 层恢复完整后备存储；GPU 直出失败通过 ensureMainTarget 在同帧恢复，再重放完整几何。任何后备存储尺寸变化之后都恢复当前 DPR 变换。

main 更新才替换文字池，单独 Overlay 更新保留 main 文字。隐藏 Pane、空数据、改用完整 Canvas 和销毁会释放文字池。十字线隐藏时释放独立表面，不再仅清空并长期保留整幅像素。

这次统一的是图元契约、后端执行和表面所有权，不为 drawing、overlay 或坐标轴强制新增 GPU DOM 表面。混合图文的普通 2D 目标仍有序执行，以保持遮挡语义。Worker、开发模块及其他内存基线不属于这次变更。

验证包括核心单测、类型检查、真实 Binance BTCUSDT 1min + PVP + MACD，以及真实 Chrome 下 1、1.25、1.5、2、3 DPR 的文字像素对照；文字用例包含跨格、旋转、叠加透明度、压缩宽度和越界裁切。
