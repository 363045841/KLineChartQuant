# gotdx API Base URL Configuration

## Goal

Allow the frontend gotdx data fetcher to target a configurable backend URL. The
default remains `http://127.0.0.1:8080`, which preserves current development
behavior while avoiding a hard-coded port in deployments.

## Configuration

Use the Vite build-time environment variable:

```env
VITE_GOTDX_API_BASE_URL=http://127.0.0.1:8080
```

If the variable is absent, the fetcher uses `http://127.0.0.1:8080`. The value
is normalized by removing trailing slashes before endpoint paths are appended.

## Scope

- Update `packages/core/src/data/gotdx.ts` to read the environment variable.
- Keep all gotdx endpoints on the same configured base URL.
- Add tests for the default value and an overridden value.
- Keep BaoStock and TradingView configuration unchanged.
- Do not change the Go backend or Vite proxy targets.

## Error Handling

The fetcher keeps its existing HTTP status checks and JSON parsing behavior.
Changing the base URL must not hide non-JSON responses or convert backend
errors into successful empty results.

## Verification

- Run the focused gotdx tests.
- Run the core package type check or package test command required by the
  repository.
- Confirm that the default URL remains `http://127.0.0.1:8080` when no variable
  is configured.
