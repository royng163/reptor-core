# @royng163/reptor-core

Platform-agnostic TypeScript for pose pipelines: types, preprocessing, metrics, and (later) features and rep/phase logic.

Install (from GitHub during development)

```bash
# Option A: direct GitHub dep (commit/branch/tag)
npm i github:royng163/reptor-core#main

# Option B: local tarball for quick iteration
npm pack  # in the fitness-core repo -> produces .tgz
# In your app repo:
npm i ../path/to/reptor-core-0.1.0.tgz
```

Usage

```ts
import { computeLetterbox, mapFromLetterbox } from "@royng163/reptor-core";

const p = computeLetterbox(srcW, srcH, 256);
const pt = mapFromLetterbox(xNorm, yNorm, srcW, srcH, p, true);
```

Notes

- No DOM or native deps; safe for Web and React Native Metro.
- ESM-first with CJS fallback; "react-native" field points to ESM.
- Lock preprocessing constants from Python into JSON and import here to keep parity across platforms.
