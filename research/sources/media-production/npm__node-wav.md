---
id: "npm:node-wav"
kind: "npm"
category: "media-production"
package: "node-wav"
version: "0.0.2"
url: "https://www.npmjs.com/package/node-wav"
homepage: "https://github.com/andreasgal/node-wav"
license: "MIT"
summary: "High performance WAV file decoder and encoder"
fetched_at: "2026-11-08T12:19:23Z"
---

# npm: node-wav@0.0.2

**Description:** High performance WAV file decoder and encoder

**Homepage:** https://github.com/andreasgal/node-wav

**License:** MIT

## Dependencies

- none

## Peer dependencies

- none

## README (from registry)

node-wav
========

High performance WAV decoder and encoder. The decoder is up to 750x faster than
the 'wav-decoder' npm module.

In addition, in contrast to 'wav-decoder' the result is returned directly instead
of with a promise.

This module combines the functionality of 'wav-decoder' and 'wav-encoder'.

Usage
-----

    let fs = require('fs');
    let wav = require('node-wav');

    let buffer = fs.readFileSync('file.wav');
    let result = wav.decode(buffer);
    console.log(result.sampleRate);
    console.log(result.channelData); // array of Float32Arrays

    wav.encode(result.channelData, { sampleRate: result.sampleRate, float: true, bitDepth: 32 });

Data format
-----------

Data is always returned as Float32Arrays. While reading and writing 64-bit float
WAV files is supported, data is truncated to 32-bit floats.

Endianness
----------

This module assumes a little endian CPU, which is true for pretty much every processor
these days (in particular Intel and ARM).
