# Release process

Publishing is intentionally a maintainer decision. During private iteration,
the release workflow skips package publication. Once the repository is public,
it also requires the `BORDERCUT_NPM_PUBLISH_ENABLED` repository variable to be
`true`, a published hosted release, and npm trusted publishing configured for
this repository.

## Before the first hosted release

- Confirm the canonical repository URL, currently `https://github.com/kong75/bordercut-core`, and the matching npm/Dart metadata.
- Replace any temporary hosting references in project settings.
- Enable private vulnerability reporting and branch protection on the repository host.
- Configure an npm trusted publisher for `.github/workflows/publish.yml` and its `npm` environment.
- Review the committed before/after examples and regenerate the README performance table on the intended release commit.
- Configure verified pub.dev publishers before enabling Dart or Flutter package publication.
- Make the core repository public and set `BORDERCUT_NPM_PUBLISH_ENABLED=true` only when package publication is approved.

## Local release validation

1. Start from a clean checkout of the intended release commit.
2. Use a supported Node version and run `npm ci`.
3. Run `npm run check`.
   This includes the standalone browser size budgets and package import checks.
4. Run `npm audit` and review every result.
5. Confirm that `CHANGELOG.md`, package versions, the algorithm version, and fixture version agree.
6. Run `npm pack --workspace @bordercut/core --dry-run --json` and inspect the file list.
7. Test the generated tarball in a separate consumer project.
8. Run `dart pub publish --dry-run` in `packages/dart`.
9. Run `flutter pub publish --dry-run` in `packages/flutter`.

Run `npm run check:release` to validate the committed repository metadata. This
checks local metadata, not repository visibility or publisher configuration.

The automated `test:pack` script performs the pack, runtime-import, and TypeScript-declaration smoke tests in an isolated temporary directory. It never publishes the tarball.

Creating and publishing a hosted release is the explicit approval step. Once approved, `.github/workflows/publish.yml` repeats validation and publishes through npm OIDC with provenance; it does not use a long-lived npm token. Pub.dev publication remains a separate manual step until a trusted release workflow is explicitly approved.
