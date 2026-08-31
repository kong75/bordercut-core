# Node + sharp example

The core package deliberately owns no codecs or filesystem APIs. This runnable example shows the complete Node pipeline using `sharp` only in the consuming application:

```bash
npm run build
npm start --workspace @bordercut/node-sharp-example -- input.jpg output.png
```

If the output path is omitted, the command writes `<input-name>-transparent.png` beside the source image.

The integration decodes the input to straight RGBA, calls `removeBackground`, and encodes the returned pixels as PNG. `sharp` is an example dependency and is not included in `@bordercut/core` or its browser bundle.
