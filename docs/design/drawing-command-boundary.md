# Drawing Command Boundary

## Context

Committed drawing mutations previously had two paths. Controller methods requested a redraw after writing `DrawingDocument`, while Agent tools wrote `DrawingDocument` directly. The latter changed state without invalidating the renderer.

## Decision

`DrawingCommands` is the sole committed-drawing write primitive. It owns the ordered operation `DrawingDocument mutation -> requestDraw` for create, update, remove, clear, and replace.

Creating a drawing commits the new `DrawingObject` and its selection in one atomic snapshot: `drawingState.actions.addDrawingAndSelect()` writes `drawings` and `selectedDrawingIds` inside a single `batch()`. Selection is therefore produced by the create operation itself, not by a UI-layer side effect. UI interaction and Agent tools both reach the same `DrawingCommands` instance, so a line drawn by either caller is created and selected identically, and its selected-only axis labels appear without extra wiring.

The Controller owns one `DrawingCommands` instance. UI interaction reaches it through the Controller's drawing adapter; Agent tools receive the same instance. `DrawingDocument` remains the validation and state-commit domain service, and is read-only from Agent code for listing drawings.

## Consequences

Every successful committed mutation schedules exactly one redraw. Missing update/remove targets do not redraw. New write integrations must depend on `DrawingCommands`, not invoke `DrawingDocument` write methods directly.

Creating a drawing replaces the current selection. Callers that must preserve an existing multi-selection cannot do so through create; selection changes always flow through the kernel's `setSelectedDrawingIds` action.

Tool reset after drawing creation must happen before the create call: switching the tool back to `cursor` clears the session selection (`DrawingInteractionController.applyToolSession`), so the create must run last to keep the new drawing selected.
