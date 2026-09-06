# BorderCut portable specification

This directory defines the language-neutral contract shared by every BorderCut implementation.

- `algorithm-v1.md` describes the processing stages and compatibility rules.
- `options.schema.json` defines public option names, ranges, and defaults.
- `fixture.schema.json` defines the portable conformance-fixture format, including synthetic gradients, ordered geometric regions, correction samples, correction strokes, and diagnostic assertions.

The TypeScript package is the reference implementation for algorithm version 1. The native Dart implementation passes the shared fixtures with byte-exact alpha output. Additional implementations must match the API contract and pass every fixture in `fixtures/v1/` before claiming conformance.

Algorithm revisions are additive and versioned. A behavior-changing revision becomes `algorithm-v2.md`; existing implementations can continue reporting version 1 until updated.

Schema changes that cannot be consumed by existing fixture renderers require a new fixture version. New cases using already-defined v1 shapes and fields do not change the algorithm version.
