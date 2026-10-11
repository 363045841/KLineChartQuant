# @363045841yyt/klinechart-mobile (spike)

Expo SDK 57 app that runs the KCQ chart inside an Expo DOM component (ADR 0010). The native shell shows metrics; the chart, its data and its gestures stay inside the WebView.

## Run

```bash
pnpm build:packages && pnpm --filter @363045841yyt/klinechart-react build
pnpm --filter @363045841yyt/klinechart-mobile start   # then press i / a, or open in Expo Go
```

| Variable | Effect |
|---|---|
| `EXPO_PUBLIC_KCQ_AUTOBENCH=1` | After the chart is ready: idle FPS, 10 bridge round trips, 6 s zoom stress, then one `[kcq-bench] {...}` log line |
| `EXPO_PUBLIC_KCQ_RENDERER=webgpu\|webgl\|canvas` | Overrides capability detection to compare backends on one device |

`pnpm --filter @363045841yyt/klinechart-mobile export:check` bundles iOS and Android, including the DOM component.

## Why the config files exist

- `metro.config.js` pins `react`, `react-dom`, `react-native`, `react-native-web` to this app's copies; workspace packages carry their own React.
- `babel.config.js` transforms object spread strictly: the preset's WebView config emits a bare `Object.assign` that `typebox`'s `Object` export shadows.
- `tsconfig.json` `paths` unify `@types/react`; `app.json` disables `experiments.tsconfigPaths` so those paths stay type-only.
- `@babel/core@^7` is declared so Expo's Babel 7 plugins do not resolve the workspace's Babel 8.
- `export:check` sets `EXPO_NO_BUNDLE_SPLITTING=1`: Expo CLI 57 cannot serialize DOM component HTML with split chunks.

Simulator numbers are not device numbers; see ADR 0010 for what is still open.
