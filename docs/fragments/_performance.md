## ⚡ Performance

KLineChartQuant submits drawing primitives directly to Canvas2D, WebGL2 or WebGPU. The design target is **200 FPS (5 ms per frame)**; the chart shows measured frame generation time and its share of that budget.

Benchmark: 1180 × 640 viewport, DPR 2, 4× MSAA, 300–10,000 visible K-lines, three pooled rounds per scenario. NVIDIA GeForce RTX 4060 Laptop GPU, headless Chrome 155. Reproduce it with [`bench/`]({{root}}bench/README.md).

![Frame generation time and frame budget share for 12 indicator lines across Canvas2D, WebGL2 and WebGPU, from 300 to 10,000 visible K-lines]({{root}}docs/Pics/render-bench-local-promo.png)
