# Chess analysis

Vite + React + TypeScript + Tailwind v4. Stockfish (WASM) runs in a Web Worker, fully client-side.

    npm install
    npm run dev   # exports and self-hosts engine JS + wasm

Production builds upload the WASM files to Cloudflare R2 before Vite bundles the
application. Set these variables in the production build environment:

```sh
R2_BUCKET_NAME=your-r2-bucket
VITE_ENGINE_CDN=https://your-public-r2-domain
```

The build uses the Wrangler CLI's existing authentication. `VITE_ENGINE_CDN` is
only used by production bundles; local development always loads WASM from
`/engines`.
