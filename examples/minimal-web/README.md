# Minimal web example

This is an intentionally unbranded integration example for `@bordercut/core`. It demonstrates browser-side image decoding, transferable RGBA processing in a Web Worker, smart Remove/Keep correction strokes, and PNG export without sharing the separate product UI.

From the repository root:

```bash
npm run dev
```

Correction guides disappear when a stroke is committed because strokes are input evidence, not output pixels.

Use **Load generated sample** for an immediate, privacy-safe smoke test that requires no image fixture or file upload.

`src/removal-worker.ts` is the recommended pattern for interactive applications: it keeps the synchronous, allocation-conscious core off the main thread and transfers pixel buffers instead of cloning the results.
