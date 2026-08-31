# Contributing to BorderCut

Thanks for contributing. BorderCut welcomes focused fixes, test cases, documentation, portability work, and carefully scoped algorithm improvements.

Participation is governed by `CODE_OF_CONDUCT.md`. Security vulnerabilities must follow `SECURITY.md` and should never be reported publicly.

## Setup

Use Node.js 20.19 or newer and npm:

```bash
npm ci
npm run check
```

Run the minimal browser example during interactive work:

```bash
npm run dev
```

`npm run check` runs unit and conformance tests, builds the core and examples, exercises the Node file pipeline, creates the core tarball in an isolated temporary directory, installs it as a consumer, imports both package entry points at runtime, and compiles against their declarations.

## Repository rules

- Keep image decoding, encoding, files, UI, and networking outside core algorithm packages.
- Update `spec/` when changing public behavior or option semantics.
- Add or revise shared fixtures for cross-language behavior changes.
- Keep language-specific optimizations behind the same public contract.
- Preserve deterministic alpha output for identical bytes, dimensions, options, and correction guidance.
- Do not claim fixture compatibility for a port until it passes every case for that algorithm version.
- Never commit secrets, personal data, confidential images, generated `dist/` output, or package tarballs.

## TypeScript development

The TypeScript package is the numerical reference implementation. Changes to it should include focused unit tests and, when portable behavior changes, shared conformance fixtures.

Useful commands:

```bash
npm test
npm run typecheck
npm run test:watch
npm run build
npm run test:pack
npm run dev
```

## Portable fixtures

Fixtures are ordered paint recipes in `fixtures/v1/cases.json`. They support solid or linear-gradient backgrounds, rectangular and elliptical regions, correction samples and strokes, alpha assertions, and selected diagnostic assertions. Keep cases small, deterministic, readable, and independent of image codecs.

Before changing the fixture format:

1. update `spec/fixture.schema.json`;
2. update `fixtures/README.md` and the TypeScript fixture renderer;
3. decide whether the change is additive within v1 or requires a new fixture version; and
4. verify every conforming language implementation can represent the recipe deterministically.

## Pull requests

Keep each pull request focused. Explain the user-visible behavior, compatibility impact, and verification performed. Complete the pull request checklist and update `CHANGELOG.md` for meaningful user-facing changes.

By submitting a contribution, you agree that it may be distributed under the repository's MIT License.
