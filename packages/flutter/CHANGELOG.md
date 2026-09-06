# Changelog

## Unreleased

- Correct straight/premultiplied alpha conversion when decoding and encoding translucent pixels.
- Validate RGBA dimensions and length before encoding, and release native buffers and descriptors when codec creation fails.

## 0.2.0

- Add image decode and transparent PNG encode helpers.
- Add isolate-backed native BorderCut processing.
