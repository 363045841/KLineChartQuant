## ⚡ Performance

KLineChartQuant ships a self-developed rendering engine that submits drawing primitives directly to Canvas, WebGL, or WebGPU, so a single codebase can switch rendering backends seamlessly. The numbers below come from the reproducible benchmark in [`bench/`]({{root}}bench/README.md) (`node bench/run.mjs`). Default setup: headless Chrome, 1180 × 640 viewport, DPR 2, 4× MSAA, 120 warm-up frames + 600 sampled frames. FPS is `requestAnimationFrame`-observed and capped by the display refresh rate (200 Hz here); Canvas2D has no page-level GPU timer, so its GPU time is empty.

### WebGPU Command Submission

Seven command buffers submitted as one batched `queue.submit` versus seven separate submissions:

| Submission | P50 (ms) |
| --- | --- |
| One `queue.submit` (batched) | 0.002 |
| Seven `queue.submit` (split) | 0.011 |
| Speedup | **5.50×** |

### MA5 / MA20 / MA60 (Simple Indicator)

| Visible K-lines | Backend | Prepare P50 (ms) | CPU Submit P50 (ms) | GPU P50 (ms) | FPS | 1% Low | Frame P99 (ms) | Jank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000 | Canvas2D | 0.200 | 0.300 | N/A | 200.0 | 192.3 | 5.20 | 0.00% |
| 1,000 | WebGL2 | 0.400 | 0.700 | 0.338 | 200.0 | 192.3 | 5.20 | 0.00% |
| 1,000 | WebGPU | 0.400 | 1.300 | 0.009 | 199.7 | 192.3 | 5.20 | 0.17% |
| 5,000 | Canvas2D | 0.600 | 1.100 | N/A | 106.9 | 65.8 | 15.20 | 24.50% |
| 5,000 | WebGL2 | 1.200 | 1.700 | 0.178 | 200.0 | 192.3 | 5.20 | 0.00% |
| 5,000 | WebGPU | 1.000 | 1.800 | 0.040 | 200.0 | 192.3 | 5.20 | 0.00% |
| 10,000 | Canvas2D | 1.100 | 1.900 | N/A | 97.2 | 65.8 | 15.20 | 30.67% |
| 10,000 | WebGL2 | 1.400 | 1.700 | 0.252 | 198.0 | 190.6 | 5.25 | 0.17% |
| 10,000 | WebGPU | 1.200 | 1.900 | 0.041 | 199.3 | 192.3 | 5.20 | 0.00% |

### Ichimoku (Complex Rendering Workload)

| Visible K-lines | Backend | Prepare P50 (ms) | CPU Submit P50 (ms) | GPU P50 (ms) | FPS | 1% Low | Frame P99 (ms) | Jank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000 | Canvas2D | 0.700 | 0.400 | N/A | 163.3 | 98.0 | 10.20 | 5.67% |
| 1,000 | WebGL2 | 1.900 | 0.700 | 0.339 | 200.0 | 192.3 | 5.20 | 0.00% |
| 1,000 | WebGPU | 1.500 | 0.900 | 0.014 | 199.3 | 192.3 | 5.20 | 0.00% |
| 5,000 | Canvas2D | 3.400 | 1.700 | N/A | 67.8 | 49.5 | 20.20 | 94.17% |
| 5,000 | WebGL2 | 3.500 | 1.400 | 0.227 | 188.4 | 99.0 | 10.10 | 2.17% |
| 5,000 | WebGPU | 3.500 | 1.500 | 0.054 | 178.6 | 99.0 | 10.10 | 2.50% |
| 10,000 | Canvas2D | 6.700 | 2.900 | N/A | 60.4 | 48.8 | 20.50 | 100.00% |
| 10,000 | WebGL2 | 6.500 | 2.400 | 0.885 | 101.4 | 66.2 | 15.10 | 30.33% |
| 10,000 | WebGPU | 6.800 | 2.700 | 0.158 | 94.9 | 66.2 | 15.10 | 36.17% |

> **Note**: The frame drops (jank) in the Ichimoku case are not caused by the rendering engine — they stem from a CPU-side bottleneck, which will be optimized in a future release.
