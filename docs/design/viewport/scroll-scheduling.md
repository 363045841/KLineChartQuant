# 视口 DOM 滚动调度

## Decision

`viewportState` keeps `requestedScrollLeft` and all derived viewport state synchronous. `ChartRenderer` commits `container.scrollLeft` as the first side effect in its existing frame transaction, then draws from that same viewport state.

## Rationale

Pointer pan events can arrive more frequently than display refresh. Writing `scrollLeft` for every state update repeatedly asks the browser to process a native scroll position that will be overwritten before the next frame. A separate DOM rAF is also incorrect: it can commit before or after the canvas rAF, producing one-frame visual mismatch. Deferring business state instead would make interaction calculations observe stale positions.

## Boundaries

- State actions update the requested scroll position immediately and remain the source of truth.
- The content-width effect owns only `scrollContent.style.width`.
- `InteractionController` requests the existing render frame after programmatic pan; repeated pointer events are coalesced by `ChartRenderer`.
- `ChartRenderer` delegates its frame-start scroll commit to `ViewportScrollBridge`, then paints canvas in the same frame transaction.
- `ViewportScrollBridge` records the browser-accepted programmatic value. The sole native listener consumes a matching event; a different value is user input and flows through state before requesting the next render frame.
- `viewportState` has no independent scroll scheduler, so it cannot mutate the DOM after renderer disposal or race canvas painting.

## Related Frame Rules

`ChartRenderer` is also the only frame owner for indicator visible-range projection. Indicator results commit through `ChartIndicatorManager`（`engine/indicators/instances/`）；结果在活动渲染帧内同步更新投影状态时不会另起 rAF 做视觉工作。Frame snapshot derivation remains pure: cache replacement and incremental-load checks run only after a successful frame render.
