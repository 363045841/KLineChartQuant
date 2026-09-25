## ⚡ Performance

KLineChartQuant ships a self-developed rendering engine that submits drawing primitives directly to Canvas, WebGL, or WebGPU, so a single codebase can switch rendering backends seamlessly. The numbers below come from the reproducible benchmark in [`bench/`]({{root}}bench/README.md) (`node bench/run.mjs`). Default setup: headless Chrome, 1180 × 640 viewport, DPR 2, 4× MSAA, 120 warm-up frames + 600 sampled frames. FPS is `requestAnimationFrame`-observed and capped by the display refresh rate (200 Hz here); Canvas2D has no page-level GPU timer, so its GPU time is empty. Hardware: NVIDIA GeForce RTX 4060 Laptop GPU (driver 616.92) with headless Chrome 153, forced to the discrete GPU.

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
| 1,000 | WebGL2 | 0.300 | 0.900 | 0.277 | 199.3 | 192.3 | 5.20 | 0.33% |
| 1,000 | WebGPU | 0.300 | 0.300 | 0.017 | 200.0 | 192.3 | 5.20 | 0.00% |
| 5,000 | Canvas2D | 0.600 | 1.100 | N/A | 102.2 | 66.2 | 15.10 | 25.83% |
| 5,000 | WebGL2 | 0.900 | 1.800 | 0.324 | 199.7 | 192.3 | 5.20 | 0.00% |
| 5,000 | WebGPU | 1.100 | 0.400 | 0.044 | 200.0 | 192.3 | 5.20 | 0.00% |
| 10,000 | Canvas2D | 1.100 | 2.000 | N/A | 97.2 | 65.4 | 15.30 | 32.33% |
| 10,000 | WebGL2 | 1.200 | 2.100 | 0.496 | 198.0 | 190.5 | 5.25 | 0.33% |
| 10,000 | WebGPU | 1.900 | 0.500 | 0.017 | 197.4 | 190.6 | 5.25 | 0.50% |

### Ichimoku (Complex Rendering Workload)

| Visible K-lines | Backend | Prepare P50 (ms) | CPU Submit P50 (ms) | GPU P50 (ms) | FPS | 1% Low | Frame P99 (ms) | Jank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000 | Canvas2D | 0.700 | 0.400 | N/A | 164.4 | 98.0 | 10.20 | 6.50% |
| 1,000 | WebGL2 | 1.700 | 0.800 | 0.308 | 200.0 | 192.3 | 5.20 | 0.00% |
| 1,000 | WebGPU | 1.900 | 0.300 | 0.042 | 200.0 | 192.3 | 5.20 | 0.00% |
| 5,000 | Canvas2D | 3.500 | 1.700 | N/A | 66.2 | 49.5 | 20.20 | 97.17% |
| 5,000 | WebGL2 | 3.400 | 1.600 | 0.294 | 182.1 | 99.0 | 10.10 | 3.83% |
| 5,000 | WebGPU | 3.500 | 0.300 | 0.084 | 198.0 | 188.7 | 5.30 | 0.50% |
| 10,000 | Canvas2D | 6.800 | 3.100 | N/A | 60.3 | 49.0 | 20.40 | 100.00% |
| 10,000 | WebGL2 | 6.800 | 3.300 | 1.968 | 89.3 | 65.8 | 15.20 | 46.00% |
| 10,000 | WebGPU | 6.800 | 0.600 | 0.095 | 123.5 | 67.1 | 14.90 | 17.33% |

> **Note**: The frame drops (jank) in the Ichimoku case are not caused by the rendering engine — they stem from a CPU-side bottleneck, which will be optimized in a future release.
