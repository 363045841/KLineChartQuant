# Vue Signal bridge

Core owns chart business state. Vue reads signals through `useSignalSource`, which
uses `customRef` to connect `peek()` to Vue dependency tracking and `subscribe()` to
Vue invalidation. The bridge does not assign business values into Vue refs or clone
Core collections. Its public result remains a read-only `ComputedRef`, so existing
consumers retain their API and Core object identity. Vue computed values still cache
their results; that cache is not an independently writable business state.

Call the bridge inside component setup or an `effectScope`. The scope owns the
subscription watcher. Controller changes and optional source gates are watched
synchronously: old subscriptions are released before a new source is connected.
Missing sources expose a lazy computed fallback. Scope disposal cancels the active
subscription.

`useControllerSignalValue` retains only the previous projection for `Object.is`
comparison. This prevents unrelated high-frequency changes, such as scrolling a
viewport without changing its zoom level, from invalidating Vue consumers.

Chart symbols, comparisons, drawing selections, alerts, external tooltips and legend
contexts consume this bridge. UI command feedback, unread counts, editing drafts and
local interaction preferences remain Vue-owned. Direct subscriptions remain where
they perform DOM work or publish events: tooltip positioning, stage classes, pane
geometry, viewport geometry invalidation and theme notifications.
