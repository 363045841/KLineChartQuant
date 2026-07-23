# Symbol Selection Identity Design

## Goal

Allow search results with the same symbol code to be selected independently when their source, exchange, or request parameters differ.

## Identity Contract

The UI identity for a symbol is the existing `symbolIdentityKey` value:

```ts
[source, exchange, symbol, sorted(params)]
```

The key is used for Vue list keys, comparison selection, removal, color lookup, and display-item matching. `symbol` remains the display value and the value sent to data fetchers.

## Scope

- Replace comparison selector code-based deduplication, selection, and removal with identity-key operations.
- Pass identity keys through toolbar comparison props and events.
- Resolve the main selector's selected item using the selected symbol's complete identity where available.
- Cover same-code, different-identity comparison behavior with focused tests.

## Non-Goals

- Add a backend-generated identifier.
- Change search result APIs or data-fetch request parameters.
- Migrate persisted comparison state beyond the existing in-memory contract.
