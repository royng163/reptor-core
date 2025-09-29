# @royng163/fitness-coach-core

Platform-agnostic TypeScript for pose pipelines: types, preprocessing, metrics, and (later) features and rep/phase logic.

Install (from GitHub during development)

```bash
# Option A: direct GitHub dep (commit/branch/tag)
npm i github:royng163/fitness-coach-core#main

# Option B: local tarball for quick iteration
npm pack  # in the fitness-core repo -> produces .tgz
# In your app repo:
npm i ../path/to/fitness-coach-core-0.1.0.tgz
```

Dev workflow with yalc (recommended for multi-repo local dev)

```bash
# In fitness-core
npx yalc publish --watch

# In fitness-coach-expo (and web sandbox)
npx yalc add @royng163/fitness-coach-core
npm run start
# Edits in fitness-core/src will auto-sync; rebuild is handled by tsup --watch if using `npm run dev`
```

Usage

```ts
import { computeLetterbox, mapFromLetterbox } from "@royng163/fitness-coach-core";

const p = computeLetterbox(srcW, srcH, 256);
const pt = mapFromLetterbox(xNorm, yNorm, srcW, srcH, p, true);
```

Notes

- No DOM or native deps; safe for Web and React Native Metro.
- ESM-first with CJS fallback; "react-native" field points to ESM.
- Lock preprocessing constants from Python into JSON and import here to keep parity across platforms.
