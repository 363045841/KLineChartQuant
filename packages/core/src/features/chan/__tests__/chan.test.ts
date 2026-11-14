/**
 * 缠论结构用例：包含处理、分型、笔与中枢。
 */

import { describe, expect, it } from "vitest";
import { buildChanSnapshot } from "../index.js";
import { findFractals } from "../impl/fractal.js";
import { buildHubs } from "../impl/hub.js";
import { mergeBars } from "../impl/merge.js";
import { buildStrokes } from "../impl/stroke.js";

/** 造一根 K 线。 */
function bar(time: number, high: number, low: number) {
  return { time, high, low };
}

describe("mergeBars", () => {
  it("把被包住的 K 线并入前一根", () => {
    const merged = mergeBars([bar(1, 10, 5), bar(2, 9, 6)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ high: 10, low: 5, startIndex: 0, endIndex: 1 });
  });

  it("向上时取较大高点与较大低点", () => {
    const merged = mergeBars([bar(1, 10, 5), bar(2, 12, 7), bar(3, 12, 8)]);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ high: 12, low: 8, direction: 1, endIndex: 2 });
  });

  it("向下时取较小高点与较小低点", () => {
    const merged = mergeBars([bar(1, 12, 8), bar(2, 10, 6), bar(3, 9, 7)]);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ high: 9, low: 6, direction: -1, endIndex: 2 });
  });
});

describe("findFractals", () => {
  it("识别一个顶分型与一个底分型", () => {
    const bars = [
      bar(1, 10, 5),
      bar(2, 12, 7),
      bar(3, 13, 9),
      bar(4, 11, 6),
      bar(5, 12, 8),
    ];
    const merged = mergeBars(bars);
    const fractals = findFractals(merged);
    expect(fractals.map((f) => f.kind)).toEqual(["top", "bottom"]);
  });
});

describe("buildStrokes", () => {
  it("顶底交替且间隔足够时成笔", () => {
    const fractals = [
      { index: 1, time: 1, price: 10, kind: "bottom" as const },
      { index: 6, time: 2, price: 20, kind: "top" as const },
      { index: 11, time: 3, price: 12, kind: "bottom" as const },
    ];
    const strokes = buildStrokes(fractals);
    expect(strokes).toHaveLength(2);
    expect(strokes[0]?.direction).toBe(1);
    expect(strokes[1]?.direction).toBe(-1);
  });

  it("间隔不足时不成笔", () => {
    const fractals = [
      { index: 1, time: 1, price: 10, kind: "bottom" as const },
      { index: 2, time: 2, price: 20, kind: "top" as const },
    ];
    expect(buildStrokes(fractals)).toHaveLength(0);
  });

  it("同类型分型只保留更极端的一个", () => {
    const fractals = [
      { index: 1, time: 1, price: 10, kind: "bottom" as const },
      { index: 6, time: 2, price: 14, kind: "bottom" as const },
      { index: 11, time: 3, price: 25, kind: "top" as const },
    ];
    const strokes = buildStrokes(fractals);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]?.fromPrice).toBe(10);
  });
});

describe("buildHubs", () => {
  it("三笔重叠时形成中枢", () => {
    const hubs = buildHubs([
      { fromIndex: 0, toIndex: 1, fromTime: 1, toTime: 2, fromPrice: 10, toPrice: 20, direction: 1 },
      { fromIndex: 1, toIndex: 2, fromTime: 2, toTime: 3, fromPrice: 20, toPrice: 14, direction: -1 },
      { fromIndex: 2, toIndex: 3, fromTime: 3, toTime: 4, fromPrice: 14, toPrice: 18, direction: 1 },
    ]);
    expect(hubs).toHaveLength(1);
    expect(hubs[0]).toMatchObject({ low: 14, high: 18 });
  });

  it("三笔无重叠时不形成中枢", () => {
    const hubs = buildHubs([
      { fromIndex: 0, toIndex: 1, fromTime: 1, toTime: 2, fromPrice: 10, toPrice: 20, direction: 1 },
      { fromIndex: 1, toIndex: 2, fromTime: 2, toTime: 3, fromPrice: 20, toPrice: 12, direction: -1 },
      { fromIndex: 2, toIndex: 3, fromTime: 3, toTime: 4, fromPrice: 12, toPrice: 9, direction: -1 },
    ]);
    expect(hubs).toHaveLength(0);
  });
});

describe("buildChanSnapshot", () => {
  it("空输入返回空结构", () => {
    const snapshot = buildChanSnapshot([]);
    expect(snapshot).toEqual({ merged: [], fractals: [], strokes: [], hubs: [] });
  });

  it("递增序列能产出上笔", () => {
    const bars = Array.from({ length: 9 }, (_, index) => bar(index, 10 + index, 5 + index));
    const snapshot = buildChanSnapshot(bars);
    expect(snapshot.merged.length).toBeGreaterThan(0);
    expect(snapshot.strokes.length).toBeLessThanOrEqual(1);
  });
});
