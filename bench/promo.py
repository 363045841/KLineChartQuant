# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib"]
# ///
"""渲染基准的宣传图：突出帧率与帧生成时间。

用法：
    uv run bench/promo.py [csv 路径] [--profile ichimoku] [--resolution 1080p]

默认读取 bench/results/render-bench-local.csv，为每个分辨率档位各出一张：
default 档沿用 -promo.png，其他档位为 -promo-<resolution>.png；
--resolution 只画指定档位，--profile 只画指定场景并追加 -<profile>。
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

BG = "#0b1220"
PANEL = "#111a2e"
TEXT = "#e2e8f0"
MUTED = "#94a3b8"
GRID = "#1e293b"
DEFAULT_RESOLUTION = "default"
SERIES = {
    "canvas2d": {"color": "#64748b", "label": "Canvas2D", "marker": "o"},
    "webgl2": {"color": "#22d3ee", "label": "WebGL2", "marker": "s"},
    "webgpu": {"color": "#818cf8", "label": "WebGPU", "marker": "^"},
}
PROFILES = ("lines12", "ichimoku")
PROFILE_LABEL = {"lines12": "12 lines", "ichimoku": "Ichimoku + cloud"}


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return [row for row in csv.DictReader(handle) if row.get("backend")]


def value(row: dict[str, str] | None, key: str) -> float | None:
    if row is None:
        return None
    try:
        return float(row.get(key, ""))
    except (TypeError, ValueError):
        return None


def resolution_of(row: dict[str, str]) -> str:
    """结果行所属的分辨率；旧 CSV 没有该列，统一按 default 处理。"""
    return row.get("resolution") or DEFAULT_RESOLUTION


def geometry_of(row: dict[str, str]) -> tuple[int, int] | None:
    """画布 CSS 尺寸，用于图注；旧 CSV 缺少该列时返回 None。"""
    try:
        return int(float(row["width"])), int(float(row["height"]))
    except (KeyError, TypeError, ValueError):
        return None


def area_of(size: tuple[int, int] | None) -> int:
    return 0 if size is None else size[0] * size[1]


def resolution_label(name: str, size: tuple[int, int] | None) -> str:
    """分辨率标注：预设名 + CSS 尺寸，让 2k 这类简称不至于含糊。"""
    return name if size is None else f"{name} · {size[0]}×{size[1]}"


def render(
    source: Path,
    rows: list[dict[str, str]],
    profiles: tuple[str, ...],
    resolution: str,
    size: tuple[int, int] | None,
) -> Path:
    """画一个分辨率档位的宣传图并落盘。

    @param source     读取的 CSV，输出写在其同目录
    @param rows       该档位的行
    @param profiles   要绘制的指标线场景
    @param resolution 分辨率预设名
    @param size       画布 CSS 尺寸，仅用于图注

    @returns 生成的 PNG 路径
    """
    # (backend, profile) -> bars -> row
    data: dict[tuple[str, str], dict[int, dict[str, str]]] = {}
    for row in rows:
        data.setdefault((row["backend"], row["lineProfile"]), {})[int(float(row["visibleBars"]))] = row
    bars_all = sorted({int(float(row["visibleBars"])) for row in rows})
    headline_bars = bars_all[-1]
    hero_profile = profiles[0] if len(profiles) == 1 else "lines12"
    hero = data.get(("webgpu", hero_profile), {}).get(headline_bars)
    if hero is None:
        hero = next(
            (
                series[headline_bars]
                for (_, profile), series in data.items()
                if profile == hero_profile and headline_bars in series
            ),
            None,
        )
    if hero is None:
        raise SystemExit(f"missing headline scenario: {hero_profile}")
    hero_label = PROFILE_LABEL[hero_profile]
    budget = value(hero, "frameIntervalP50Ms") or 8.3
    refresh_fps = 1000 / budget
    fps = value(hero, "observedFps") or refresh_fps
    low_fps = value(hero, "onePercentLowFps") or fps
    jank = value(hero, "severeJankRate") or 0.0
    uploads = value(hero, "uploadsPerFrame") or 0.0
    gpu_paints = [
        value(data.get((backend, hero_profile), {}).get(headline_bars), "cpuFrameP50Ms")
        for backend in ("webgl2", "webgpu")
    ]
    gpu_paints = [item for item in gpu_paints if item is not None]
    if gpu_paints and max(gpu_paints) - min(gpu_paints) < 0.05:
        paint_range = f"{max(gpu_paints):.2f} ms"
    else:
        paint_range = (
            f"{min(gpu_paints):.2f}–{max(gpu_paints):.2f} ms" if gpu_paints else "n/a"
        )

    fig = plt.figure(figsize=(12.5, 7.2), facecolor=BG)
    fig.text(
        0.055,
        0.945,
        "GPU indicator rendering, at scroll speed",
        fontsize=22,
        fontweight=700,
        color=TEXT,
        ha="left",
    )
    fig.text(
        0.055,
        0.895,
        f"Up to {headline_bars:,} visible bars · {hero_label} · "
        f"{resolution_label(resolution, size)} · one scroll frame per sample · no MSAA · analytic AA",
        fontsize=10.5,
        color=MUTED,
        ha="left",
    )

    paint_caption = (
        f"frame time @ {headline_bars:,} bars"
        if len(profiles) == 1
        else f"frame time, {hero_label} @ {headline_bars:,} bars"
    )
    kpis = [
        (f"{fps:.0f} FPS", f"locked to display · 1% low {low_fps:.0f}", "#22d3ee"),
        (paint_range, paint_caption, "#818cf8"),
        (
            f"{jank * 100:.0f}%",
            "severe jank" if len(profiles) == 1 else f"severe jank · {hero_label}",
            "#a3e635",
        ),
        (f"{uploads:.0f}", "buffer uploads per frame", "#fbbf24"),
    ]
    for index, (big, caption, color) in enumerate(kpis):
        x = 0.055 + index * 0.235
        fig.text(x, 0.775, big, fontsize=26, fontweight=700, color=color, ha="left")
        fig.text(x, 0.735, caption, fontsize=9.5, color=MUTED, ha="left")

    time_axis = fig.add_axes([0.055, 0.09, 0.50, 0.56])
    budget_axis = fig.add_axes([0.655, 0.09, 0.295, 0.56])
    for axis in (time_axis, budget_axis):
        axis.set_facecolor(PANEL)
        axis.set_axisbelow(True)
        for side in ("top", "right", "left"):
            axis.spines[side].set_visible(False)
        axis.spines["bottom"].set_color(GRID)
        axis.tick_params(length=0)

    time_axis.grid(axis="y", color=GRID, linewidth=1)
    time_axis.set_title("Frame generation time", loc="left", color=TEXT, fontsize=12, pad=12)
    time_axis.set_ylabel("ms per frame (P50)")
    time_axis.set_xlabel(f"{budget:.1f} ms budget · lower is better", fontsize=9)
    time_axis.set_xscale("log")
    time_axis.set_xticks(bars_all)
    time_axis.set_xticklabels([f"{bars:,}" for bars in bars_all], rotation=0, fontsize=8)
    time_axis.minorticks_off()
    time_axis.set_xlim(bars_all[0] * 0.72, bars_all[-1] * 1.55)
    max_paint = max(
        (
            value(series[bar], "cpuFrameP50Ms") or 0.0
            for (backend, profile), series in data.items()
            if profile in profiles and backend in SERIES
            for bar in series
        ),
        default=0.0,
    )
    time_axis.set_ylim(0, max(6.0, max_paint * 1.18))

    labels = []
    for backend in ("canvas2d", "webgl2", "webgpu"):
        style = SERIES[backend]
        for profile in profiles:
            series = data.get((backend, profile))
            if not series:
                continue
            bars = [bar for bar in bars_all if bar in series]
            values = [value(series[bar], "cpuFrameP50Ms") or 0.0 for bar in bars]
            dashed = len(profiles) > 1 and profile == "ichimoku"
            time_axis.plot(
                bars,
                values,
                color=style["color"],
                linestyle=(0, (4, 3)) if dashed else "-",
                marker=style["marker"],
                linewidth=2.2,
                markersize=5.5,
                alpha=0.75 if dashed else 1.0,
                markeredgecolor=BG,
                markeredgewidth=1.2,
                label=f"{style['label']} · {PROFILE_LABEL[profile]}",
            )
            labels.append(
                {
                    "text": f"{values[-1]:.2f} ms",
                    "y": values[-1],
                    "color": style["color"],
                    "alpha": 0.85 if dashed else 1.0,
                }
            )

    # 末端标签按数值排序后逐个抬高：保证最小间距，并夹在坐标轴内，避免互相重叠或掉出轴外。
    labels.sort(key=lambda item: item["y"])
    ymin, ymax = time_axis.get_ylim()
    pixel_per_data = (
        time_axis.transData.transform((0, 1))[1] - time_axis.transData.transform((0, 0))[1]
    )
    min_gap = 14 * fig.dpi / 72 / pixel_per_data
    placed = []
    for item in labels:
        y = max(item["y"], ymin + min_gap * 0.5)
        if placed and y < placed[-1] + min_gap:
            y = placed[-1] + min_gap
        placed.append(y)
    ceiling = ymax - min_gap * 0.5
    if placed and placed[-1] > ceiling:
        shift = placed[-1] - ceiling
        placed = [value - shift for value in placed]
    for item, y in zip(labels, placed):
        time_axis.annotate(
            item["text"],
            (bars_all[-1], y),
            textcoords="offset points",
            xytext=(9, 0),
            va="center",
            fontsize=8.5,
            fontweight=700,
            color=item["color"],
            alpha=item["alpha"],
        )

    legend = time_axis.legend(
        loc="upper left",
        bbox_to_anchor=(0.015, 0.985),
        frameon=False,
        fontsize=8,
        handlelength=2.4,
        labelcolor=TEXT,
        ncol=1,
    )
    for text in legend.get_texts():
        text.set_color(TEXT)

    # 预算占用：同一帧预算下各后端在最大数据集时的比例；实心为 12 线，浅色为 Ichimoku。
    budget_axis.grid(axis="x", color=GRID, linewidth=1)
    budget_axis.set_title("Share of frame budget", loc="left", color=TEXT, fontsize=12, pad=12)
    entries = []
    for backend in ("canvas2d", "webgl2", "webgpu"):
        for profile in profiles:
            row = data.get((backend, profile), {}).get(headline_bars)
            if row is None:
                continue
            entries.append((backend, profile, (value(row, "cpuFrameP50Ms") or 0.0) / budget * 100))
    backend_order = ["canvas2d", "webgl2", "webgpu"]
    for backend_index, backend in enumerate(backend_order):
        center = len(backend_order) - 1 - backend_index
        for profile_index, profile in enumerate(profiles):
            match = next(
                (percent for name, kind, percent in entries if name == backend and kind == profile),
                None,
            )
            if match is None:
                continue
            position = center + (0.19 if profile_index == 0 else -0.19) if len(profiles) > 1 else center
            budget_axis.barh(
                [position],
                [match],
                height=0.34,
                color=SERIES[backend]["color"],
                alpha=1.0 if len(profiles) == 1 or profile_index == 0 else 0.5,
                edgecolor="none",
            )
            budget_axis.text(
                match + 1.5,
                position,
                f"{match:.0f}%",
                va="center",
                fontsize=9,
                fontweight=700,
                color=TEXT,
            )
    budget_axis.set_yticks(range(len(backend_order))[::-1])
    budget_axis.set_yticklabels(
        [SERIES[backend]["label"] for backend in backend_order], fontsize=9.5, color=TEXT
    )
    ceiling = max(20, int(max((percent for _, _, percent in entries), default=0) / 20 + 1) * 20)
    budget_axis.set_xlim(0, ceiling)
    budget_axis.set_xticks(range(0, ceiling + 1, ceiling // 4))
    budget_axis.set_xticklabels([f"{tick}%" for tick in range(0, ceiling + 1, ceiling // 4)])
    budget_axis.set_xlabel(
        f"of the {budget:.1f} ms budget"
        if len(profiles) == 1
        else f"of the {budget:.1f} ms budget · solid = 12 lines, faded = Ichimoku"
    )
    budget_axis.tick_params(axis="y", length=0, pad=6)

    fig.text(
        0.055,
        0.018,
        "Measured in headless Chrome; frame rate is capped by the display refresh, frame time is not.",
        fontsize=8,
        color="#64748b",
        ha="left",
    )

    # default 沿用历史文件名；其他档位在 -promo 后带上分辨率，避免互相覆盖。
    resolution_suffix = "" if resolution == DEFAULT_RESOLUTION else f"-{resolution}"
    profile_suffix = f"-{profiles[0]}" if len(profiles) == 1 else ""
    target = source.with_name(f"{source.stem}-promo{resolution_suffix}{profile_suffix}.png")
    fig.savefig(target, dpi=200, facecolor=BG)
    plt.close(fig)
    return target


def main() -> None:
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="渲染基准宣传图")
    parser.add_argument(
        "source",
        nargs="?",
        type=Path,
        default=root / "results" / "render-bench-local.csv",
    )
    parser.add_argument("--profile", choices=PROFILES, default=None)
    parser.add_argument(
        "--resolution",
        default=None,
        help="只画指定分辨率档位；默认 CSV 中每个档位各出一张",
    )
    args = parser.parse_args()
    source = args.source
    profiles = (args.profile,) if args.profile else PROFILES
    rows = read_rows(source)
    if not rows:
        raise SystemExit(f"no benchmark rows in {source}")

    geometry = {resolution_of(row): geometry_of(row) for row in rows}
    available = sorted(geometry, key=lambda name: (area_of(geometry[name]), name))
    if args.resolution:
        if args.resolution not in available:
            raise SystemExit(
                f"resolution {args.resolution} not in {source}; available: {', '.join(available)}"
            )
        targets = [args.resolution]
    else:
        targets = available

    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "text.color": TEXT,
            "axes.labelcolor": MUTED,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
        }
    )
    for resolution in targets:
        target = render(
            source,
            [row for row in rows if resolution_of(row) == resolution],
            profiles,
            resolution,
            geometry[resolution],
        )
        print(f"wrote {target}")


if __name__ == "__main__":
    main()
