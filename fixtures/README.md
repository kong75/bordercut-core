# Shared conformance fixtures

Fixtures are language-neutral JSON recipes rather than encoded image files. Each case defines a solid or linear-gradient RGBA background, ordered rectangular or elliptical paint regions, optional correction samples and strokes, processing options, alpha assertions, and selected diagnostic bounds.

This keeps the corpus small and readable while allowing TypeScript, Dart, and Go to generate exactly the same input bytes. Version 1 covers flat and gradient backgrounds, enclosed holes, foreground and background markers, bounded local and directional remove/keep stroke guidance, lower-edge subjects, enclosed background panels, pale-subject recovery, and genuine exterior openings.

Every fixture file is validated against `spec/fixture.schema.json` during the TypeScript test run. Future fixture versions may add licensed binary RGBA inputs and full golden alpha files without changing version 1.

Each current case also records `referenceAlphaSha256`, an exact fingerprint of the TypeScript reference alpha buffer. The TypeScript tests enforce these fingerprints to catch numerical drift. Other language ports may use the tolerant alpha and diagnostic assertions for fixture compatibility; matching the SHA-256 fingerprint is required only when claiming reference compatibility.
