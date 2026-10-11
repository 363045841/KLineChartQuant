# Anchored popover lifecycle and positioning

`useAnchoredPopover` is the public composition facade. Dropdown, DropMenu and
BasePopover keep the same bindings and show/hide API. Capabilities are selected once
per instance, and each concern owns its own lifetime:

- `usePopoverLifecycle` coordinates open/close notifications, disabled state, detached
  trigger/panel refs and scope disposal. A native driver synchronizes browser toggle
  events; a fallback driver joins a document-owned dismissal stack.
- `fallbackLayers` preserves parent chains even when child panels are teleported.
  Outside clicks dismiss layers above the clicked layer; Escape dismisses the top
  layer; closing a parent closes its descendants. The final layer removes the shared
  document listeners.
- `usePopoverPosition` chooses CSS anchor positioning when native popovers and CSS
  anchors are both available. Otherwise it selects Floating UI. Explicit top/bottom
  placement does not flip vertically; auto placement may flip.
- `floatingPosition` owns lazy loading, geometry observation and asynchronous
  measurements. Closing, changing refs/options or disposing the scope aborts the
  previous positioning session. Late imports cannot attach observers, and only the
  latest measurement from the active session may publish coordinates.

Open notifications wait for Vue to render panel content. Position measurement runs
after rendering without hiding focusable content during lazy loading. Native light
dismissal uses browser focus behavior; programmatic closure and fallback Escape can
explicitly return focus to the trigger. Components no longer duplicate disposal or
fallback Escape listeners.

Regression checks cover resource cancellation, measurement ordering and nested
dismissal. Native browser top-layer and CSS anchor layout remain browser behavior,
not claims made by a mocked DOM test.
