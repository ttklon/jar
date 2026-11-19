---
id: "npm:ffprobe-static"
kind: "npm"
category: "media-production"
package: "ffprobe-static"
version: "3.1.0"
url: "https://www.npmjs.com/package/ffprobe-static"
homepage: "https://github.com/joshwnj/ffprobe-static#readme"
license: "MIT"
summary: "Static binaries for ffprobe."
fetched_at: "2026-11-08T11:47:22Z"
---

# npm: ffprobe-static@3.1.0

**Description:** Static binaries for ffprobe.

**Homepage:** https://github.com/joshwnj/ffprobe-static#readme

**License:** MIT

## Dependencies

- none

## Peer dependencies

- none

## README (from registry)

ffprobe-static
====

Static binaries for `ffprobe`.

Based on <https://github.com/eugeneware/ffmpeg-static>.

Binaries are from <http://ffmpeg.zeranoe.com/builds/>

Usage
----

```js
var ffprobe = require('ffprobe-static');
console.log(ffprobe.path);
```

Version Notes
----

Currently supports Mac OS X (64-bit), Linux (32 and 64-bit) and Windows
(32 and 64-bit).

Currently version `4.0.2` is installed for Mac, Windows and Linux.

I pulled the versions from the ffmpeg static build pages linked from the
official ffmpeg site. Namely:

* [64 bit Mac OSX](https://evermeet.cx/ffmpeg/)
* [64 bit Linux](http://johnvansickle.com/ffmpeg/)
* [32 bit Linux](http://johnvansickle.com/ffmpeg/)
* [64 bit Windows](http://ffmpeg.zeranoe.com/builds/win64/static/)
* [32 bit Windows](http://ffmpeg.zeranoe.com/builds/win32/static/)

Acknowledgements
----

Special thanks to [eugeneware](https://github.com/eugeneware) for <https://github.com/eugeneware/ffmpeg-static>, which this is based upon.

