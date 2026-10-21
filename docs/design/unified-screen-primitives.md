# 有序屏幕原语与三后端绘制

Plot 与 drawing 原先分别调用 Canvas API，GPU 只覆盖矩形和实线。这使虚线、区域、标记、文字、选中锚点与预览无法共享后端。

统一的 `PaintPrimitive` 包含多轮廓 fill、带样式 stroke、circle、rect、text，以及同色矩形的 `rects` 批次。业务模块只投影几何和排版；Canvas、WebGL2、WebGPU 消费同一份有序命令。圆、矩形与圆角矩形在 GPU 上使用解析形状实例管线；箭头归约成通用路径，不增加业务专用后端方法。

复杂 GPU 填充通过有向三角扇累计 stencil winding，支持凹形、自交、多轮廓和 evenodd。复杂描边在共享几何层展开为同向轮廓，使用 nonzero 并集，避免透明线条连接处重复混合；dash 按路径长度连续切分。基础形状实例化，简单几何直接绘制；文字直接使用 Canvas。几何路径不经 Canvas 栅格化。

各批次先在隔离 GPU 目标上绘制，完整成功后合成到 Scene 指定画布。这保留主图、正式 drawing 与 session 的清屏、裁剪和层级语义，也保证一批失败时能完整回退。`Renderer.primitives` 是唯一且必需的后端绘制能力；旧的可见 surface 契约、旧 buffer/pipeline API 和旧行情绘制链路已经删除，主图带的可见直出表面改由 `PrimitiveBackend.createSurface` 提供，详见 `scene-owned-composition.md`。

后续优化已改为基础形状实例化、几何与颜色缓存、连续缓冲复用和有序合批，详见 `primitive-batching-and-reuse.md`。文字按产品要求直接由 Canvas 绘制，不再上传 GPU 字形纹理。图文交错时必须保留原始顺序，Canvas 文字会形成 GPU 提交边界。此变更不扩展到坐标轴、十字线及第三方自定义 Canvas 插件，也不实现局部重绘。

验证需覆盖 dash 跨折点、凹形与孔洞、交叉透明填充、旋转多行文字、非整数 DPR、正式层/预览层隔离、整批失败回退和后端资源释放，并通过真实浏览器检查三后端像素。

真实浏览器回归入口是 `bench/primitives.html`，通过 `pnpm exec vite --config bench/vite.config.ts` 启动后访问。页面直接调用三后端的 `paint`，任何 GPU 失败都会报错，不经过 Canvas 回退。已在本机 Chrome 验证 Canvas2D、WebGL2、WebGPU 和 DPR 1 / 1.25 / 1.5 / 2 的十二种组合。该页面为像素正确性检查，不是性能基准，也不代表不同后端的边缘抗锯齿像素完全相同。
