---
id: "npm:archiver"
kind: "npm"
category: "backup-archive"
package: "archiver"
version: "8.0.0"
url: "https://www.npmjs.com/package/archiver"
homepage: "https://github.com/archiverjs/node-archiver"
license: "MIT"
summary: "a streaming interface for archive generation"
fetched_at: "2026-11-08T12:43:21Z"
---

# npm: archiver@8.0.0

**Description:** a streaming interface for archive generation

**Homepage:** https://github.com/archiverjs/node-archiver

**License:** MIT

## Dependencies

- async@^3.2.4
- buffer-crc32@^1.0.0
- is-stream@^4.0.0
- lazystream@^1.0.0
- normalize-path@^3.0.0
- readable-stream@^4.0.0
- readdir-glob@^3.0.0
- tar-stream@^3.0.0
- zip-stream@^7.0.2

## Peer dependencies

- none

## README (from registry)

# Archiver

A streaming interface for archive generation

Visit the [API documentation](https://www.archiverjs.com/) for a list of all methods available.

## Install

```bash
npm install archiver --save
```

## Quick Start

```js
import fs from "fs";
import { ZipArchive } from "archiver";

// create a file to stream archive data to.
const output = fs.createWriteStream(__dirname + "/example.zip");
const archive = new ZipArchive({
  zlib: { level: 9 }, // Sets the compression level.
});

// listen for all archive data to be written
// 'close' event is fired only when a file descriptor is involved
output.on("close", function () {
  console.log(archive.pointer() + " total bytes");
  console.log(
    "archiver has been finalized and the output file descriptor has closed.",
  );
});

// This event is fired when the data source is drained no matter what was the data source.
// It is not part of this library but rather from the NodeJS Stream API.
// @see: https://nodejs.org/api/stream.html#stream_event_end
output.on("end", function () {
  console.log("Data has been drained");
});

// good practice to catch warnings (ie stat failures and other non-blocking errors)
archive.on("warning", function (err) {
  if (err.code === "ENOENT") {
    // log warning
  } else {
    // throw error
    throw err;
  }
});

// good practice to catch this error explicitly
archive.on("error", function (err) {
  throw err;
});

// pipe archive data to the file
archive.pipe(output);

// append a file from stream
const file1 = __dirname + "/file1.txt";
archive.append(fs.createReadStream(file1), { name: "file1.txt" });

// append a file from string
archive.append("string cheese!", { name: "file2.txt" });

// append a file from buffer
const buffer3 = Buffer.from("buff it!");
archive.append(buffer3, { name: "file3.txt" });

// append a file
archive.file("file1.txt", { name: "file4.txt" });

// append files from a sub-directory and naming it `new-subdir` within the archive
archive.directory("subdir/", "new-subdir");

// append files from a sub-directory, putting its contents at the root of archive
archive.directory("subdir/", false);

// append files from a glob pattern
archive.glob("file*.txt", { cwd: __dirname });

// finalize the archive (ie we are done appending files but streams have to finish yet)
// 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
archive.finalize();
```

## Formats

Archiver ships with out of the box support for TAR and ZIP archives.

