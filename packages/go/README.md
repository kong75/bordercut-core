# BorderCut for Go

Status: planned.

This directory is reserved for the Go port of algorithm v1. The package should accept an RGBA byte slice and dimensions without requiring a particular image codec.

Target API shape:

```go
func RemoveBackground(
    image PixelImage,
    options Options,
    samples []SamplePoint,
) (Result, error)
```

Implementation requirements:

- follow `spec/algorithm-v1.md`;
- use the defaults in `spec/options.schema.json`;
- run the shared cases in `fixtures/v1/cases.json`;
- keep file and HTTP handling outside the core package.
