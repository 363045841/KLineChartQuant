# Drawing Command Boundary

## Context

Committed drawing mutations previously had two paths. Controller methods requested a redraw after writing `DrawingDocument`, while Agent tools wrote `DrawingDocument` directly. The latter changed state without invalidating the renderer.

## Decision

`DrawingCommands` is the sole committed-drawing write primitive. It owns the ordered operation `DrawingDocument mutation -> requestDraw` for create, update, remove, clear, and replace.

The Controller owns one `DrawingCommands` instance. UI interaction reaches it through the Controller's drawing adapter; Agent tools receive the same instance. `DrawingDocument` remains the validation and state-commit domain service, and is read-only from Agent code for listing drawings.

## Consequences

Every successful committed mutation schedules exactly one redraw. Missing update/remove targets do not redraw. New write integrations must depend on `DrawingCommands`, not invoke `DrawingDocument` write methods directly.
