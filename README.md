# @royng163/reptor-core

Platform-agnostic TypeScript for pose pipelines: types, preprocessing, and features logic.

Install (from GitHub during development)

```bash
npm i github:royng163/reptor-core#main
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
