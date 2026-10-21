## ⚡ 性能

本项目把渲染原语直接提交到 Canvas2D、WebGL2 或 WebGPU。设计目标是 **200 FPS（每帧 5 ms）**，下图是实测帧生成时间及其占该预算的比例。

基准条件：1180 × 640 视口、DPR 2、4× MSAA、300–10,000 根可见 K 线，每个场景重复 3 轮合并取百分位。硬件为 NVIDIA GeForce RTX 4060 Laptop GPU，无头 Chrome 155。复现命令见 [`bench/`]({{root}}bench/README.md)。

![12 条指标线在 Canvas2D、WebGL2、WebGPU 下的帧生成时间与帧预算占用（300 至 10,000 根可见 K 线）]({{root}}docs/Pics/render-bench-local-promo.png)
