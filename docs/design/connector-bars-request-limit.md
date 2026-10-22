# Connector K-line request capabilities

The number of bars requested by a chart caller and a connector's per-HTTP-request
bound are separate values. A connector can accept fewer bars than the caller's
target. Sending the target unchanged produces a deterministic rejection.

Add optional `BarCapability.maxBarsPerRequest` to the existing source and
instrument capability contract. Before transport invocation, the protocol
provider applies the tighter of the requested count, the current source bound
and the instrument bound. The runtime source declaration also covers instrument
snapshots restored before this field existed.

Providers that omit the field retain their current request behavior. The
frontend contains no connector-specific numeric limit. A connector derives its
declaration from the same constant used for request validation.

This changes one transport page, not the caller's history target. It leaves
timestamp cursors, cancellation, ordering and source-reported history exhaustion
unchanged. History orchestration remains responsible for requesting later pages;
this capability patch does not add a second loading state or a new batch loop.

Protocol regressions cover single-bar and boundary requests, tighter source and
instrument limits, refreshed source declarations, undeclared providers and
forwarded cursor/cancellation arguments. A canonical incremental-loading
regression exercises the real protocol provider with a two-bar source bound
and an older instrument snapshot. It verifies continued pages, exact exclusive
cursors, ordered data and source-reported exhaustion. The fork's separate
viewport-batching implementation is not imported by this capability change.
