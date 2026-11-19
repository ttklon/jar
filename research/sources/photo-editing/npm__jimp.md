---
id: "npm:jimp"
kind: "npm"
category: "photo-editing"
package: "jimp"
version: "1.6.1"
url: "https://www.npmjs.com/package/jimp"
homepage: "https://github.com/jimp-dev/jimp#readme"
license: "MIT"
summary: "An image processing library written entirely in JavaScript."
fetched_at: "2026-11-08T13:04:20Z"
---

# npm: jimp@1.6.1

**Description:** An image processing library written entirely in JavaScript.

**Homepage:** https://github.com/jimp-dev/jimp#readme

**License:** MIT

## Dependencies

- @jimp/core@1.6.1
- @jimp/diff@1.6.1
- @jimp/js-bmp@1.6.1
- @jimp/js-gif@1.6.1
- @jimp/js-jpeg@1.6.1
- @jimp/js-png@1.6.1
- @jimp/js-tiff@1.6.1
- @jimp/plugin-blit@1.6.1
- @jimp/plugin-blur@1.6.1
- @jimp/plugin-circle@1.6.1
- @jimp/plugin-color@1.6.1
- @jimp/plugin-contain@1.6.1
- @jimp/plugin-cover@1.6.1
- @jimp/plugin-crop@1.6.1
- @jimp/plugin-displace@1.6.1
- @jimp/plugin-dither@1.6.1
- @jimp/plugin-fisheye@1.6.1
- @jimp/plugin-flip@1.6.1
- @jimp/plugin-hash@1.6.1
- @jimp/plugin-mask@1.6.1
- @jimp/plugin-print@1.6.1
- @jimp/plugin-quantize@1.6.1
- @jimp/plugin-resize@1.6.1
- @jimp/plugin-rotate@1.6.1
- @jimp/plugin-threshold@1.6.1
- @jimp/types@1.6.1
- @jimp/utils@1.6.1

## Peer dependencies

- none

## README (from registry)

<div align="center">
  <img width="200" height="200"
    src="https://s3.amazonaws.com/pix.iemoji.com/images/emoji/apple/ios-11/256/crayon.png">
  <h1>Jimp</h1>
  <p>JavaScript Image Manipulation Program</p>
</div>

The "JavaScript Image Manipulation Program" :-)

An image processing library for Node written entirely in JavaScript, with zero native dependencies.

The default jimp configuration.

Supported types:

- `@jimp/jpeg`
- `@jimp/png`
- `@jimp/bmp`
- `@jimp/tiff`
- `@jimp/gif`

[Read the full docs.](http://jimp-dev.github.io/jimp/)

## Installation

```bash
npm install --save jimp
```

## Usage

```js
const { Jimp } = require("jimp");

// open a file called "lenna.png"
const image = await Jimp.read("test.png");

image.resize(256, 256); // resize

await image.write("test-small.jpg"); // save
```

