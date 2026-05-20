# Three.js vendor lock

| Field | Value |
|-------|-------|
| Package | `three` |
| Version | `0.170.0` |
| Source files | `vendor/three/three.module.js`, `vendor/three/three.module.min.js` |
| Import path (ESM) | `../vendor/three/three.module.min.js` |
| Updated | 2026-05-20 |

## Refresh

```bash
npm pack three@0.170.0
tar -xf three-*.tgz
cp package/build/three.module.js vendor/three/three.module.js
npx esbuild vendor/three/three.module.js --minify --outfile=vendor/three/three.module.min.js
```

CI must reject zips containing `cdn.jsdelivr` / `unpkg` for Three.js assets.
