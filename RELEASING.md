# Release process

Publishing is intentionally a maintainer decision. The release workflow runs only after a maintainer publishes a hosted release and npm trusted publishing has been configured for this repository.

## Before the first hosted release

- Choose the canonical repository URL.
- Add `repository`, `homepage`, and `bugs` fields to the root and `@bordercut/core` package metadata.
- Replace any temporary hosting references in project settings.
- Enable private vulnerability reporting and branch protection on the repository host.
- Configure an npm trusted publisher for `.github/workflows/publish.yml` and its `npm` environment.
- Add `repository` and `issue_tracker` fields to both Dart package manifests.
- Configure verified pub.dev publishers before enabling Dart or Flutter package publication.

## Local release validation

1. Start from a clean checkout of the intended release commit.
2. Use a supported Node version and run `npm ci`.
3. Run `npm run check`.
4. Run `npm audit` and review every result.
5. Confirm that `CHANGELOG.md`, package versions, the algorithm version, and fixture version agree.
6. Run `npm pack --workspace @bordercut/core --dry-run --json` and inspect the file list.
7. Test the generated tarball in a separate consumer project.
8. Run `dart pub publish --dry-run` in `packages/dart`.
9. Run `flutter pub publish --dry-run` in `packages/flutter`.

Run `npm run check:release` after the canonical repository metadata has been added. This guard intentionally fails while that hosting-dependent metadata is absent.

The automated `test:pack` script performs the pack, runtime-import, and TypeScript-declaration smoke tests in an isolated temporary directory. It never publishes the tarball.

Creating and publishing a hosted release is the explicit approval step. Once approved, `.github/workflows/publish.yml` repeats validation and publishes through npm OIDC with provenance; it does not use a long-lived npm token. Pub.dev publication remains a separate manual step until a trusted release workflow is explicitly approved.
