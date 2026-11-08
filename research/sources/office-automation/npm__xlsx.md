---
id: "npm:xlsx"
kind: "npm"
category: "office-automation"
package: "xlsx"
version: "0.18.5"
url: "https://www.npmjs.com/package/xlsx"
homepage: "https://sheetjs.com/"
license: "Apache-2.0"
summary: "SheetJS Spreadsheet data parser and writer"
fetched_at: "2026-11-08T11:47:22Z"
---

# npm: xlsx@0.18.5

**Description:** SheetJS Spreadsheet data parser and writer

**Homepage:** https://sheetjs.com/

**License:** Apache-2.0

## Dependencies

- adler-32@~1.3.0
- cfb@~1.2.1
- codepage@~1.15.0
- crc-32@~1.2.1
- ssf@~0.11.2
- wmf@~1.0.1
- word@~0.3.0

## Peer dependencies

- none

## README (from registry)

# [SheetJS](https://sheetjs.com)

The SheetJS Community Edition offers battle-tested open-source solutions for
extracting useful data from almost any complex spreadsheet and generating new
spreadsheets that will work with legacy and modern software alike.

[SheetJS Pro](https://sheetjs.com/pro) offers solutions beyond data processing:
Edit complex templates with ease; let out your inner Picasso with styling; make
custom sheets with images/graphs/PivotTables; evaluate formula expressions and
port calculations to web apps; automate common spreadsheet tasks, and much more!

![License](https://img.shields.io/github/license/SheetJS/sheetjs)
[![Build Status](https://img.shields.io/github/workflow/status/sheetjs/sheetjs/Tests:%20node.js)](https://github.com/SheetJS/sheetjs/actions)
[![Snyk Vulnerabilities](https://img.shields.io/snyk/vulnerabilities/github/SheetJS/sheetjs)](https://snyk.io/test/github/SheetJS/sheetjs)
[![npm Downloads](https://img.shields.io/npm/dm/xlsx.svg)](https://npmjs.org/package/xlsx)
[![Analytics](https://ga-beacon.appspot.com/UA-36810333-1/SheetJS/sheetjs?pixel)](https://github.com/SheetJS/sheetjs)

[**Browser Test and Support Matrix**](https://oss.sheetjs.com/sheetjs/tests/)

[![Build Status](https://saucelabs.com/browser-matrix/sheetjs.svg)](https://saucelabs.com/u/sheetjs)

**Supported File Formats**

![circo graph of format support](formats.png)

![graph legend](legend.png)

## Table of Contents

<details>
  <summary><b>Expand to show Table of Contents</b></summary>

<!-- toc -->

- [Getting Started](#getting-started)
  * [Installation](#installation)
  * [Usage](#usage)
  * [The Zen of SheetJS](#the-zen-of-sheetjs)
  * [JS Ecosystem Demos](#js-ecosystem-demos)
- [Acquiring and Extracting Data](#acquiring-and-extracting-data)
  * [Parsing Workbooks](#parsing-workbooks)
  * [Processing JSON and JS Data](#processing-json-and-js-data)
  * [Processing HTML Tables](#processing-html-tables)
- [Processing Data](#processing-data)
  * [Modifying Workbook Structure](#modifying-workbook-structure)
  * [Modifying Cell Values](#modifying-cell-values)
  * [Modifying Other Worksheet / Workbook / Cell Properties](#modifying-other-worksheet--workbook--cell-properties)
- [Packaging and Releasing Data](#packaging-and-releasing-data)
  * [Writing Workbooks](#writing-workbooks)
  * [Writing Examples](#writing-examples)
  * [Streaming Write](#streaming-write)
  * [Generating JSON and JS Data](#generating-json-and-js-data)
  * [Generating HTML Tables](#generating-html-tables)
  * [Generating Single-Worksheet Snapshots](#generating-single-worksheet-snapshots)
- [Interface](#interface)
  * [Parsing functions](#parsing-functions)
  * [Writing functions](#writing-functions)
  * [Utilities](#utilities)
- [Common Spreadsheet Format](#common-spreadsheet-format)
  * [General Structures](#general-structures)
  * [Cell Object](#cell-object)
    + [Data Types](#data-types)
    + [Dates](#dates)
  * [Sheet Objects](#sheet-objects)
    + [Worksheet Object](#worksheet-object)
    + [Chartsheet Object](#chartsheet-object)
    + [Macrosheet Object](#macrosheet-object)
    + [Dialogsheet Object](#dialogsheet-object)
  * [Workbook Object](#workbook-object)
    + [Workbook File Properties](#workbook-file-properties)
  * [Workbook-Level Attributes](#workbook-level-attributes)
    + [Defined Names](#defined-names)
    + [Workbook Views](#workbook-views)
    + [Miscellaneous Workbook Properties](#miscellaneous-workbook-properties)
  * [Document Features](#document-features)
    + [Formulae](#formulae)
    + [Row and Column Properties](#row-and-column-properties)
    + [Number Formats](#number-formats)
    + [Hyperlinks](#hyperlinks)
    + [Cell Comments](#cell-comments)
    + [Sheet Visibility](#sheet-visibility)
    + [VBA and Macros](#vba-and-macros)
- [Parsing Options](#parsing-options)
  * [Input Type](#input-type)
  * [Guessing File Type](#guessing-file-type)
- [Writing Options](#writing-options)
  * [Supported Output Formats](#supported-output-formats)
  * [Output Type](#output-type)
- [Utility Functions](#utility-functions)
  * [Array of Arrays Input](#array-of-arrays-input)
  * [Array of Objects Input](#array-of-objects-input)
  * [HTML Table Input](#html-table-input)
  * [Formulae Output](#formulae-output)
  * [Delimiter-Separated Output](#delimiter-separated-output)
    + [UTF-16 Unicode Text](#utf-16-unicode-text)
  * [HTML Output](#html-output)
  * [JSON](#json)
- [File Formats](#file-formats)
- [Testing](#testing)
  * [Node](#node)
  * [Browser](#browser)
  * [Tested Environments](#tested-environments)
  * [Test Files](#test-files)
- [Contributing](#contributing)
  * [OSX/Linux](#osxlinux)
  * [Windows](#windows)
  * [Tests](#tests)
- [License](#license)
- [References](#references)

<!-- tocstop -->

</details>

## Getting Started

### Installation

**Standalone Browser Scripts**

The complete browser standalone build is saved to `dist/xlsx.full.min.js` and
can be directly added to a page with a `script` tag:

```html
<script lang="javascript" src="dist/xlsx.full.min.js"></script>
```

<details>
  <summary><b>CDN Availability</b> (click to show)</summary>

|    CDN     | URL                                        |
|-----------:|:-------------------------------------------|
|    `unpkg` | <https://unpkg.com/xlsx/>                  |
| `jsDelivr` | <https://jsdelivr.com/package/npm/xlsx>    |
|    `CDNjs` | <https://cdnjs.com/libraries/xlsx>         |

For example, `unpkg` makes the latest version available at:

```html
<script src="https://unpkg.com/xlsx/dist/xlsx.full.min.js"></script>
```

</details>

<details>
  <summary><b>Browser builds</b> (click to show)</summary>

The complete single-file version is generated at `dist/xlsx.full.min.js`

`dist/xlsx.core.min.js` omits codepage library (no support for XLS encodings)

A slimmer build is generated at `dist/xlsx.mini.min.js`. Compared to full build:
- codepage library skipped (no support for XLS encodings)
- no support for XLSB / XLS / Lotus 1-2-3 / SpreadsheetML 2003 / Numbers
- node stream utils removed

</details>


With [bower](https://bower.io/search/?q=js-xlsx):

```bash
$ bower install js-xlsx
```

**ECMAScript Modules**

The ECMAScript Module build is saved to `xlsx.mjs` and can be directly added to
a page with a `script` tag using `type=module`:

```html
<script type="module">
import { read, writeFileXLSX } from "./xlsx.mjs";

/* load the codepage support library for extended support with older formats  */
import { set_cptable } from "./xlsx.mjs";
import * as cptable from './dist/cpexcel.full.mjs';
set_cptable(cptable);
</script>
```

The [npm package](https://www.npmjs.org/package/xlsx) also exposes the module
with the `module` parameter, supported in Angular and other projects:

```ts
import { read, writeFileXLSX } from "xlsx";

/* load the codepage support library for extended support with older formats  */
import { set_cptable } from "xlsx";
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';
set_cptable(cptable);
```

**Deno**

`xlsx.mjs` can be imported in Deno.  It is available from `unpkg`:

```ts
// @deno-types="https://unpkg.com/xlsx/types/index.d.ts"
import * as XLSX from 'https://unpkg.com/xlsx/xlsx.mjs';

/* load the codepage support library for extended support with older formats  */
import * as cptable from 'https://unpkg.com/xlsx/dist/cpexcel.full.mjs';
XLSX.set_cptable(cptable);
```

**NodeJS**

With [npm](https://www.npmjs.org/package/xlsx):

```bash
$ npm install xlsx
```

By default, the module supports `require`:

```js
var XLSX = require("xlsx");
```

The module also ships with `xlsx.mjs` for use with `import`:

```js
import * as XLSX from 'xlsx/xlsx.mjs';

/* load 'fs' for readFile and writeFile support */
import * as fs from 'fs';
XLSX.set_fs(fs);

/* load 'stream' for stream support */
import { Readable } from 'stream';
XLSX.stream.set_readable(Readable);

/* load the codepage support library for extended support with older formats  */
import * as cpexcel from 'xlsx/dist/cpexcel.full.mjs';
XLSX.set_cptable(cpexcel);
```

**Photoshop and InDesign**

`dist/xlsx.extendscript.js` is an ExtendScript build for Photoshop and InDesign
that is included in the `npm` package.  It can be directly referenced with a
`#include` directive:

```extendscript
#include "xlsx.extendscript.js"
```


<details>
  <summary><b>Internet Explorer and ECMAScript 3 Compatibility</b> (click to show)</summary>

For broad compatibility with JavaScript engines, the library is written using
ECMAScript 3 language dialect as well as some ES5 features like `Array#forEach`.
Older browsers require shims to provide missing functions.

To use the shim, add the shim before the script tag that loads `xlsx.js`:

```html
<!-- add the shim first -->
<script type="text/javascript" src="shim.min.js"></script>
<!-- after the shim is referenced, add the library -->
<script type="text/javascript" src="xlsx.full.min.js"></script>
```

The script also includes `IE_LoadFile` and `IE_SaveFile` for loading and saving
files in Internet Explorer versions 6-9.  The `xlsx.extendscript.js` script
bundles the shim in a format suitable for Photoshop and other Adobe products.

</details>

### Usage

Most scenarios involving spreadsheets and data can be broken into 5 parts:

1) **Acquire Data**:  Data may be stored anywhere: local or remote files,
   databases, HTML TABLE, or even generated programmatically in the web browser.

2) **Extract Data**:  For spreadsheet files, this involves parsing raw bytes to
   read the cell data. For general JS data, this involves reshaping the data.

3) **Process Data**:  From generating summary statistics to cleaning data
   records, this step is the heart of the problem.

4) **Package Data**:  This can involve making a new spreadsheet or serializing
   with `JSON.stringify` or writing XML or simply flattening data for UI tools.

5) **Release Data**:  Spreadsheet files can be uploaded to a server or written
   locally.  Data can be presented to users in an HTML TABLE or data grid.

A common problem involves generating a valid spreadsheet export from data stored
in an HTML table.  In this example, an HTML TABLE on the page will be scraped,
a row will be added to the bottom with the date of the report, and a new file
will be generated and downloaded locally. `XLSX.writeFile` takes care of
packaging the data and attempting a local download:

```js
// Acquire Data (reference to the HTML table)
var table_elt = document.getElementById("my-table-id");

// Extract Data (create a workbook object from the table)
var workbook = XLSX.utils.table_to_book(table_elt);

// Process Data (add a new row)
var ws = workbook.Sheets["Sheet1"];
XLSX.utils.sheet_add_aoa(ws, [["Created "+new Date().toISOString()]], {origin:-1});

// Package and Release Data (`writeFile` tries to write and save an XLSB file)
XLSX.writeFile(workbook, "Report.xlsb");
```

This library tries to simplify steps 2 and 4 with functions to extract useful
data from spreadsheet files (`read` / `readFile`) and generate new spreadsheet
files from data (`write` / `writeFile`).  Additional utility functions like
`table_to_book` work with other common data sources like HTML tables.

This documentation and various demo projects cover a number of common scenarios
and approaches for steps 1 and 5.

Utility functions help with step 3.

["Acquiring and Extracting Data"](#acquiring-and-extracting-data) describes
solutions for common data import scenarios.

["Packaging and Releasing Data"](#packaging-and-releasing-data) describes
solutions for common data export scenarios.

["Processing Data"](#packaging-and-releasing-data) describes solutions for
common workbook processing and manipulation scenarios.

["Utility Functions"](#utility-functions) details utility functions for
translating JSON Arrays and other common JS structures into worksheet objects.

### The Zen of SheetJS

_Data processing should fit in any workflow_

The library does not impose a separate lifecycle.  It fits nicely in websites
and apps built using any framework.  The plain JS data objects play nice with
Web Workers and future APIs.

_JavaScript is a powerful language for data processing_

The ["Common Spreadsheet Format"](#common-spreadsheet-format) is a simple object
representation of the core concepts of a workbook.  The various functions in the
library provide low-level tools for working with the object.

For friendly JS processing, there are utility functions for converting parts of
a worksheet to/from an Array of Arrays.  The following example combines powerful
JS Array methods with a network request library to download data, select the
information we want and create a workbook file:

<details>
  <summary><b>Get Data from a JSON Endpoint and Generate a Workbook</b> (click to show)</summary>

The goal is to generate a XLSB workbook of US President names and birthdays.

**Acquire Data**

_Raw Data_

<https://theunitedstates.io/congress-legislators/executive.json> has the desired
data.  For example, John Adams:

```js
{
  "id": { /* (data omitted) */ },
  "name": {
    "first": "John",          // <-- first name
    "last": "Adams"           // <-- last name
  },
  "bio": {
    "birthday": "1735-10-19", // <-- birthday
    "gender": "M"
  },
  "terms": [
    { "type": "viceprez", /* (other fields omitted) */ },
    { "type": "viceprez", /* (other fields omitted) */ },
    { "type": "prez", /* (other fields omitted) */ } // <-- look for "prez"
  ]
}
```

_Filtering for Presidents_

The dataset includes Aaron Burr, a Vice President who was never President!

`Array#filter` creates a new array with the desired rows.  A President served
at least one term with `type` set to `"prez"`.  To test if a particular row has
at least one `"prez"` term, `Array#some` is another native JS function.  The
complete filter would be:

```js
const prez = raw_data.filter(row => row.terms.some(term => term.type === "prez"));
```

_Lining up the data_

For this example, the name will be the first name combined with the last name
(`row.name.first + " " + row.name.last`) and the birthday will be the subfield
`row.bio.birthday`.  Using `Array#map`, the dataset can be massaged in one call:

```js
const rows = prez.map(row => ({
  name: row.name.first + " " + row.name.last,
  birthday: row.bio.birthday
}));
```

The result is an array of "simple" objects with no nesting:

```js
[
  { name: "George Washington", birthday: "1732-02-22" },
  { name: "John Adams", birthday: "1735-10-19" },
  // ... one row per President
]
```

**Extract Data**

With the cleaned dataset, `XLSX.utils.json_to_sheet` generates a worksheet:

```js
const worksheet = XLSX.utils.json_to_sheet(rows);
```

`XLSX.utils.book_new` creates a new workbook and `XLSX.utils.book_append_sheet`
appends a worksheet to the workbook. The new worksheet will be called "Dates":

```js
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Dates");
```

**Process Data**

_Fixing headers_

By default, `json_to_sheet` creates a worksheet with a header row. In this case,
the headers come from the JS object keys: "name" and "birthday".

The headers are in cells A1 and B1.  `XLSX.utils.sheet_add_aoa` can write text
values to the existing worksheet starting at cell A1:

```js
XLSX.utils.sheet_add_aoa(worksheet, [["Name", "Birthday"]], { origin: "A1" });
```

_Fixing Column Widths_

Some of the names are longer than the default column width.  Column widths are
set by [setting the `"!cols"` worksheet property](#row-and-column-properties).

The following line sets the width of column A to approximately 10 characters:

```js
worksheet["!cols"] = [ { wch: 10 } ]; // set column A width to 10 characters
```

One `Array#reduce` call over `rows` can calculate the maximum width:

```js
const max_width = rows.reduce((w, r) => Math.max(w, r.name.length), 10);
worksheet["!cols"] = [ { wch: max_width } ];
```

Note: If the starting point was a file or HTML table, `XLSX.utils.sheet_to_json`
will generate an array of JS objects.

**Package and Release Data**

`XLSX.writeFile` creates a spreadsheet file and tries to write it to the system.
In the browser, it will try to prompt the user to download the file.  In NodeJS,
it will write to the local directory.

```js
XLSX.writeFile(workbook, "Presidents.xlsx");
```

**Complete Example**

```js
// Uncomment the next line for use in NodeJS:
// const XLSX = require("xlsx"), axios = require("axios");

(async() => {
  /* fetch JSON data and parse */
  const url = "https://theunitedstates.io/congress-legislators/executive.json";
  const raw_data = (await axios(url, {responseType: "json"})).data;

  /* filter for the Presidents */
  const prez = raw_data.filter(row => row.terms.some(term => term.type === "prez"));

  /* flatten objects */
  const rows = prez.map(row => ({
    name: row.name.first + " " + row.name.last,
    birthday: row.bio.birthday
  }));

  /* generate worksheet and workbook */
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Dates");

  /* fix headers */
  XLSX.utils.sheet_add_aoa(worksheet, [["Name", "Birthday"]], { origin: "A1" });

  /* calculate column width */
  const max_width = rows.reduce((w, r) => Math.max(w, r.name.length), 10);
  worksheet["!cols"] = [ { wch: max_width } ];

  /* create an XLSX file and try to save to Presidents.xlsx */
  XLSX.writeFile(workbook, "Presidents.xlsx");
})();
```

For use in the web browser, assuming the snippet is saved to `snippet.js`,
script tags should be used to include the `axios` and `xlsx` standalone builds:

```html
<script src="https://unpkg.com/xlsx/dist/xlsx.full.min.js"></script>
<script src="https://unpkg.com/axios/dist/axios.min.js"></script>
<script src="snippet.js"></script>
```


</details>

_File formats are implementation details_

The parser covers a wide gamut of common spreadsheet file formats to ensure that
"HTML-saved-as-XLS" files work as well as actual XLS or XLSX files.

The writer supports a number of common output formats for broad compatibility
with the data ecosystem.

To the greatest extent possible, data processing code should not have to worry
about the specific file formats involved.


### JS Ecosystem Demos

The [`demos` directory](demos/) includes sample projects for:

**Frameworks and APIs**
- [`angularjs`](demos/angular/)
- [`angular and ionic`](demos/angular2/)
- [`knockout`](demos/knockout/)
- [`meteor`](demos/meteor/)
- [`react and react-native`](demos/react/)
- [`vue 2.x and weex`](demos/vue/)
- [`XMLHttpRequest and fetch`](demos/xhr/)
- [`nodejs server`](demos/server/)
- [`databases and key/value stores`](demos/database/)
- [`typed arrays and math`](demos/array/)

**Bundlers and Tooling**
- [`browserify`](demos/browserify/)
- [`fusebox`](demos/fusebox/)
- [`parcel`](demos/parcel/)
- [`requirejs`](demos/requirejs/)
- [`rollup`](demos/rollup/)
- [`systemjs`](demos/systemjs/)
- [`typescript`](demos/typescript/)
- [`webpack 2.x`](demos/webpack/)

**Platforms and Integrations**
- [`deno`](demos/deno/)
- [`electron application`](demos/electron/)
- [`nw.js application`](demos/nwjs/)
- [`Chrome / Chromium extensions`](demos/chrome/)
- [`Download a Google Sheet locally`](demos/google-sheet/)
- [`Adobe ExtendScript`](demos/extendscript/)
- [`Headless Browsers`](demos/headless/)
- [`canvas-datagrid`](demos/datagrid/)
- [`x-spreadsheet`](demos/xspreadsheet/)
- [`react-data-grid`](demos/react/modify/)
- [`vue3-table-light`](demos/vue/modify/)
- [`Swift JSC and other engines`](demos/altjs/)
- [`"serverless" functions`](demos/function/)
- [`internet explorer`](demos/oldie/)

Other examples are included in the [showcase](demos/showcase/).

<https://sheetjs.com/demos/modify.html> shows a complete example of reading,
modifying, and writing files.

<https://github.com/SheetJS/sheetjs/blob/HEAD/bin/xlsx.njs> is the command-line
tool included with node installations, reading spreadsheet files and exporting
the contents in various formats.
## Acquiring and Extracting Data

### Parsing Workbooks

**API**

_Extract data from spreadsheet bytes_

```js
var workbook = XLSX.read(data, opts);
```

The `read` method can extract data from spreadsheet bytes stored in a JS string,
"binary string", NodeJS buffer or typed array (`Uint8Array` or `ArrayBuffer`).


_Read spreadsheet bytes from a local file and extract data_

```js
var workbook = XLSX.readFile(filename, opts);
```

The `readFile` method attempts to read a spreadsheet file at the supplied path.
Browsers generally do not allow reading files in this way (it is deemed a
security risk), and attempts to read files in this way will throw an error.

The second `opts` argument is optional. ["Parsing Options"](#parsing-options)
covers the supported properties and behaviors.

**Examples**

Here are a few common scenarios (click on each subtitle to see the code):

<details>
  <summary><b>Local file in a NodeJS server</b> (click to show)</summary>

`readFile` uses `fs.readFileSync` under the hood:

```js
var XLSX = require("xlsx");

var workbook = XLSX.readFile("test.xlsx");
```

For Node ESM, the `readFile` helper is not enabled. Instead, `fs.readFileSync`
should be used to read the file data as a `Buffer` for use with `XLSX.read`:

```js
import { readFileSync } from "fs";
import { read } from "xlsx/xlsx.mjs";

const buf = readFileSync("test.xlsx");
/* buf is a Buffer */
const workbook = read(buf);
```

</details>

<details>
  <summary><b>Local file in a Deno application</b> (click to show)</summary>

`readFile` uses `Deno.readFileSync` under the hood:

```js
// @deno-types="https://deno.land/x/sheetjs/types/index.d.ts"
import * as XLSX from 'https://deno.land/x/sheetjs/xlsx.mjs'

const workbook = XLSX.readFile("test.xlsx");
```

Applications reading files must be invoked with the `--allow-read` flag.  The
[`deno` demo](demos/deno/) has more examples

</details>

<details>
  <summary><b>User-submitted file in a web page ("Drag-and-Drop")</b> (click to show)</summary>

For modern websites targeting Chrome 76+, `File#arrayBuffer` is recommended:

```js
// XLSX is a global from the standalone script

async function handleDropAsync(e) {
  e.stopPropagation(); e.preventDefault();
  const f = e.dataTransfer.files[0];
  /* f is a File */
  const data = await f.arrayBuffer();
  /* data is an ArrayBuffer */
  const workbook = XLSX.read(data);

  /* DO SOMETHING WITH workbook HERE */
}
drop_dom_element.addEventListener("drop", handleDropAsync, false);
```

For maximal compatibility, the `FileReader` API should be used:

```js
function handleDrop(e) {
  e.stopPropagation(); e.preventDefault();
  var f = e.dataTransfer.files[0];
  /* f is a File */
  var reader = new FileReader();
  reader.onload = function(e) {
    var data = e.target.result;
    /* reader.readAsArrayBuffer(file) -> data will be an ArrayBuffer */
    var workbook = XLSX.read(data);

    /* DO SOMETHING WITH workbook HERE */
  };
  reader.readAsArrayBuffer(f);
}
drop_dom_element.addEventListener("drop", handleDrop, false);
```

<https://oss.sheetjs.com/sheetjs/> demonstrates the FileReader technique.

</details>

<details>
  <summary><b>User-submitted file with an HTML INPUT element</b> (click to show)</summary>

Starting with an HTML INPUT element with `type="file"`:

```html
<input type="file" id="input_dom_element">
```

For modern websites targeting Chrome 76+, `Blob#arrayBuffer` is recommended:

```js
// XLSX is a global from the standalone script

async function handleFileAsync(e) {
  const file = e.target.files[0];
  const data = await file.arrayBuffer();
  /* data is an ArrayBuffer */
  const workbook = XLSX.read(data);

  /* DO SOMETHING WITH workbook HERE */
}
input_dom_element.addEventListener("change", handleFileAsync, false);
```

For broader support (including IE10+), the `FileReader` approach is recommended:

```js
function handleFile(e) {
  var file = e.target.files[0];
  var reader = new FileReader();
  reader.onload = function(e) {
    var data = e.target.result;
    /* reader.readAsArrayBuffer(file) -> data will be an ArrayBuffer */
    var workbook = XLSX.read(e.target.result);

    /* DO SOMETHING WITH workbook HERE */
  };
  reader.readAsArrayBuffer(file);
}
input_dom_element.addEventListener("change", handleFile, false);
```

The [`oldie` demo](demos/oldie/) shows an IE-compatible fallback scenario.

</details>

<details>
  <summary><b>Fetching a file in the web browser ("Ajax")</b> (click to show)</summary>

For modern websites targeting Chrome 42+, `fetch` is recommended:

```js
// XLSX is a global from the standalone script

(async() => {
  const url = "http://oss.sheetjs.com/test_files/formula_stress_test.xlsx";
  const data = await (await fetch(url)).arrayBuffer();
  /* data is an ArrayBuffer */
  const workbook = XLSX.read(data);

  /* DO SOMETHING WITH workbook HERE */
})();
```

For broader support, the `XMLHttpRequest` approach is recommended:

```js
var url = "http://oss.sheetjs.com/test_files/formula_stress_test.xlsx";

/* set up async GET request */
var req = new XMLHttpRequest();
req.open("GET", url, true);
req.responseType = "arraybuffer";

req.onload = function(e) {
  var workbook = XLSX.read(req.response);

  /* DO SOMETHING WITH workbook HERE */
};

req.send();
```

The [`xhr` demo](demos/xhr/) includes a longer discussion and more examples.

<http://oss.sheetjs.com/sheetjs/ajax.html> shows fallback approaches for IE6+.

</details>

<details>
  <summary><b>Local file in a PhotoShop or InDesign plugin</b> (click to show)</summary>

`readFile` wraps the `File` logic in Photoshop and other ExtendScript targets.
The specified path should be an absolute path:

```js
#include "xlsx.extendscript.js"

/* Read test.xlsx from the Documents folder */
var workbook = XLSX.readFile(Folder.myDocuments + "/test.xlsx");
```

The [`extendscript` demo](demos/extendscript/) includes a more complex example.

</details>

<details>
  <summary><b>Local file in an Electron app</b> (click to show)</summary>

`readFile` can be used in the renderer process:

```js
/* From the renderer process */
var XLSX = require("xlsx");

var workbook = XLSX.readFile(path);
```

Electron APIs have changed over time.  The [`electron` demo](demos/electron/)
shows a complete example and details the required version-specific settings.

</details>

<details>
  <summary><b>Local file in a mobile app with React Native</b> (click to show)</summary>

The [`react` demo](demos/react) includes a sample React Native app.

Since React Native does not provide a way to read files from the filesystem, a
third-party library must be used.  The following libraries have been tested:

- [`react-native-file-access`](https://npm.im/react-native-file-access)

The `base64` encoding returns strings compatible with the `base64` type:

```js
import XLSX from "xlsx";
import { FileSystem } from "react-native-file-access";

const b64 = await FileSystem.readFile(path, "base64");
/* b64 is a base64 string */
const workbook = XLSX.read(b64, {type: "base64"});
```

- [`react-native-fs`](https://npm.im/react-native-fs)

The `ascii` encoding returns binary strings compatible with the `binary` type:

```js
import XLSX from "xlsx";
import { readFile } from "react-native-fs";

const bstr = await readFile(path, "ascii");
/* bstr is a binary string */
const workbook = XLSX.read(bstr, {type: "binary"});
```

</details>

<details>
  <summary><b>NodeJS Server File Uploads</b> (click to show)</summary>

`read` can accept a NodeJS buffer.  `readFile` can read files generated by a
HTTP POST request body parser like [`formidable`](https://npm.im/formidable):

```js
const XLSX = require("xlsx");
const http = require("http");
const formidable = require("formidable");

const server = http.createServer((req, res) => {
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    /* grab the first file */
    const f = Object.entries(files)[0][1];
    const path = f.filepath;
    const workbook = XLSX.readFile(path);

    /* DO SOMETHING WITH workbook HERE */
  });
}).listen(process.env.PORT || 7262);
```

The [`server` demo](demos/server) has more advanced examples.

</details>

<details>
  <summary><b>Download files in a NodeJS process</b> (click to show)</summary>

Node 17.5 and 18.0 have native support for fetch:

```js
const XLSX = require("xlsx");

const data = await (await fetch(url)).arrayBuffer();
/* data is an ArrayBuffer */
const workbook = XLSX.read(data);
```

For broader compatibility, third-party modules are recommended.

[`request`](https://npm.im/request) requires a `null` encoding to yield Buffers:

```js
var XLSX = require("xlsx");
var request = require("request");

request({url: url, encoding: null}, function(err, resp, body) {
  var workbook = XLSX.read(body);

  /* DO SOMETHING WITH workbook HERE */
});
```

[`axios`](https://npm.im/axios) works the same way in browser and in NodeJS:

```js
const XLSX = require("xlsx");
const axios = require("axios");

(async() => {
  const res = await axios.get(url, {responseType: "arraybuffer"});
  /* res.data is a Buffer */
  const workbook = XLSX.read(res.data);

  /* DO SOMETHING WITH workbook HERE */
})();
```

</details>

<details>
  <summary><b>Download files in an Electron app</b> (click to show)</summary>

The `net` module in the main process can make HTTP/HTTPS requests to external
resources.  Responses should be manually concatenated using `Buffer.concat`:

```js
const XLSX = require("xlsx");
const { net } = require("electron");

const req = net.request(url);
req.on("response", (res) => {
  const bufs = []; // this array will collect all of the buffers
  res.on("data", (chunk) => { bufs.push(chunk); });
  res.on("end", () => {
    const workbook = XLSX.read(Buffer.concat(bufs));

    /* DO SOMETHING WITH workbook HERE */
  });
});
req.end();
```

</details>

<details>
  <summary><b>Readable Streams in NodeJS</b> (click to show)</summary>

When dealing with Readable Streams, the easiest approach is to buffer the stream
and process the whole thing at the end:

```js
var fs = require("fs");
var XLSX = require("xlsx");

function process_RS(stream, cb) {
  var buffers = [];
  stream.on("data", function(data) { buffers.push(data); });
  stream.on("end", function() {
    var buffer = Buffer.concat(buffers);
    var workbook = XLSX.read(buffer, {type:"buffer"});

    /* DO SOMETHING WITH workbook IN THE CALLBACK */
    cb(workbook);
  });
}
```

</details>

<details>
  <summary><b>ReadableStream in the browser</b> (click to show)</summary>

When dealing with `ReadableStream`, the easiest approach is to buffer the stream
and process the whole thing at the end:

```js
// XLSX is a global from the standalone script

async function process_RS(stream) {
  /* collect data */
  const buffers = [];
  const reader = stream.getReader();
  for(;;) {
    const res = await reader.read();
    if(res.value) buffers.push(res.value);
    if(res.done) break;
  }

  /* concat */
  const out = new Uint8Array(buffers.reduce((acc, v) => acc + v.length, 0));

  let off = 0;
  for(const u8 of arr) {
    out.set(u8, off);
    off += u8.length;
  }

  return out;
}

const data = await process_RS(stream);
/* data is Uint8Array */
const workbook = XLSX.read(data);
```

</details>

More detailed examples are covered in the [included demos](demos/)

### Processing JSON and JS Data

JSON and JS data tend to represent single worksheets.  This section will use a
few utility functions to generate workbooks.

_Create a new Workbook_

```js
var workbook = XLSX.utils.book_new();
```

The `book_new` utility function creates an empty workbook with no worksheets.

Spreadsheet software generally require at least one worksheet and enforce the
requirement in the user interface.  This library enforces the requirement at
write time, throwing errors if an empty workbook is passed to write functions.


**API**

_Create a worksheet from an array of arrays of JS values_

```js
var worksheet = XLSX.utils.aoa_to_sheet(aoa, opts);
```

The `aoa_to_sheet` utility function walks an "array of arrays" in row-major
order, generating a worksheet object.  The following snippet generates a sheet
with cell `A1` set to the string `A1`, cell `B1` set to `B1`, etc:

```js
var worksheet = XLSX.utils.aoa_to_sheet([
  ["A1", "B1", "C1"],
  ["A2", "B2", "C2"],
  ["A3", "B3", "C3"]
]);
```

["Array of Arrays Input"](#array-of-arrays-input) describes the function and the
optional `opts` argument in more detail.


_Create a worksheet from an array of JS objects_

```js
var worksheet = XLSX.utils.json_to_sheet(jsa, opts);
```

The `json_to_sheet` utility function walks an array of JS objects in order,
generating a worksheet object.  By default, it will generate a header row and
one row per object in the array.  The optional `opts` argument has settings to
control the column order and header output.

["Array of Objects Input"](#array-of-arrays-input) describes the function and
the optional `opts` argument in more detail.

**Examples**

["Zen of SheetJS"](#the-zen-of-sheetjs) contains a detailed example "Get Data
from a JSON Endpoint and Generate a Workbook"


[`x-spreadsheet`](https://github.com/myliang/x-spreadsheet) is an interactive
data grid for previewing and modifying structured data in the web browser.  The
[`xspreadsheet` demo](/demos/xspreadsheet) includes a sample script with the
`xtos` function for converting from x-spreadsheet data object to a workbook.
<https://oss.sheetjs.com/sheetjs/x-spreadsheet> is a live demo.

<details>
  <summary><b>Records from a database query (SQL or no-SQL)</b> (click to show)</summary>

The [`database` demo](/demos/database/) includes examples of working with
databases and query results.

</details>


<details>
  <summary><b>Numerical Computations with TensorFlow.js</b> (click to show)</summary>

[`@tensorflow/tfjs`](@tensorflow/tfjs) and other libraries expect data in simple
arrays, well-suited for worksheets where each column is a data vector.  That is
the transpose of how most people use spreadsheets, where each row is a vector.

When recovering data from `tfjs`, the returned data points are stored in a typed
array.  An array of arrays can be constructed with loops. `Array#unshift` can
prepend a title row before the conversion:

```js
const XLSX = require("xlsx");
const tf = require('@tensorflow/tfjs');

/* suppose xs and ys are vectors (1D tensors) -> tfarr will be a typed array */
const tfdata = tf.stack([xs, ys]).transpose();
const shape = tfdata.shape;
const tfarr = tfdata.dataSync();

/* construct the array of arrays */
const aoa = [];
for(let j = 0; j < shape[0]; ++j) {
  aoa[j] = [];
  for(let i = 0; i < shape[1]; ++i) aoa[j][i] = tfarr[j * shape[1] + i];
}
/* add headers to the top */
aoa.unshift(["x", "y"]);

/* generate worksheet */
const worksheet = XLSX.utils.aoa_to_sheet(aoa);
```

The [`array` demo](demos/array/) shows a complete example.

</details>


### Processing HTML Tables

**API**

_Create a worksheet by scraping an HTML TABLE in the page_

```js
var worksheet = XLSX.utils.table_to_sheet(dom_element, opts);
```

The `table_to_sheet` utility function takes a DOM TABLE element and iterates
through the rows to generate a worksheet.  The `opts` argument is optional.
["HTML Table Input"](#html-table-input) describes the function in more detail.



_Create a workbook by scraping an HTML TABLE in the page_

```js
var workbook = XLSX.utils.table_to_book(dom_element, opts);
```

The `table_to_book` utility function follows the same logic as `table_to_sheet`.
After generating a worksheet, it creates a blank workbook and appends the
spreadsheet.

The options argument supports the same options as `table_to_sheet`, with the
addition of a `sheet` property to control the worksheet name.  If the property
is missing or no options are specified, the default name `Sheet1` is used.

**Examples**

Here are a few common scenarios (click on each subtitle to see the code):

<details>
  <summary><b>HTML TABLE element in a webpage</b> (click to show)</summary>

```html
<!-- include the standalone script and shim.  this uses the UNPKG CDN -->
<script src="https://unpkg.com/xlsx/dist/shim.min.js"></script>
<script src="https://unpkg.com/xlsx/dist/xlsx.full.min.js"></script>

<!-- example table with id attribute -->
<table id="tableau">
  <tr><td>Sheet</td><td>JS</td></tr>
  <tr><td>12345</td><td>67</td></tr>
</table>

<!-- this block should appear after the table HTML and the standalone script -->
<script type="text/javascript">
  var workbook = XLSX.utils.table_to_book(document.getElementById("tableau"));

  /* DO SOMETHING WITH workbook HERE */
</script>
```

Multiple tables on a web page can be converted to individual worksheets:

```js
/* create new workbook */
var workbook = XLSX.utils.book_new();

/* convert table "table1" to worksheet named "Sheet1" */
var sheet1 = XLSX.utils.table_to_sheet(document.getElementById("table1"));
XLSX.utils.book_append_sheet(workbook, sheet1, "Sheet1");

/* convert table "table2" to worksheet named "Sheet2" */
var sheet2 = XLSX.utils.table_to_sheet(document.getElementById("table2"));
XLSX.utils.book_append_sheet(workbook, sheet2, "Sheet2");

/* workbook now has 2 worksheets */
```

Alternatively, the HTML code can be extracted and parsed:

```js
var htmlstr = document.getElementById("tableau").outerHTML;
var workbook = XLSX.read(htmlstr, {type:"string"});
```

</details>

<details>
  <summary><b>Chrome/Chromium Extension</b> (click to show)</summary>

The [`chrome` demo](demos/chrome/) shows a complete example and details the
required permissions and other settings.

In an extension, it is recommended to generate the workbook in a content script
and pass the object back to the extension:

```js
/* in the worker script */
chrome.runtime.onMessage.addListener(function(msg, sender, cb) {
  /* pass a message like { sheetjs: true } from the extension to scrape */
  if(!msg || !msg.sheetjs) return;
  /* create a new workbook */
  var workbook = XLSX.utils.book_new();
  /* loop through each table element */
  var tables = document.getElementsByTagName("table")
  for(var i = 0; i < tables.length; ++i) {
    var worksheet = XLSX.utils.table_to_sheet(tables[i]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Table" + i);
  }
  /* pass back to the extension */
  return cb(workbook);
});
```

</details>

<details>
  <summary><b>Server-Side HTML Tables with Headless Chrome</b> (click to show)</summary>

The [`headless` demo](demos/headless/) includes a complete demo to convert HTML
files to XLSB workbooks.  The core idea is to add the script to the page, parse
the table in the page context, generate a `base64` workbook and send it back
for further processing:

```js
const XLSX = require("xlsx");
const { readFileSync } = require("fs"), puppeteer = require("puppeteer");

const url = `https://sheetjs.com/demos/table`;

/* get the standalone build source (node_modules/xlsx/dist/xlsx.full.min.js) */
const lib = readFileSync(require.resolve("xlsx/dist/xlsx.full.min.js"), "utf8");

(async() => {
  /* start browser and go to web page */
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, {waitUntil: "networkidle2"});

  /* inject library */
  await page.addScriptTag({content: lib});

  /* this function `s5s` will be called by the script below, receiving the Base64-encoded file */
  await page.exposeFunction("s5s", async(b64) => {
    const workbook = XLSX.read(b64, {type: "base64" });

    /* DO SOMETHING WITH workbook HERE */
  });

  /* generate XLSB file in webpage context and send back result */
  await page.addScriptTag({content: `
    /* call table_to_book on first table */
    var workbook = XLSX.utils.table_to_book(document.querySelector("TABLE"));

    /* generate XLSX file */
    var b64 = XLSX.write(workbook, {type: "base64", bookType: "xlsb"});

    /* call "s5s" hook exposed from the node process */
    window.s5s(b64);
  `});

  /* cleanup */
  await browser.close();
})();
```

</details>

<details>
  <summary><b>Server-Side HTML Tables with Headless WebKit</b> (click to show)</summary>

The [`headless` demo](demos/headless/) includes a complete demo to convert HTML
files to XLSB workbooks using [PhantomJS](https://phantomjs.org/). The core idea
is to add the script to the page, parse the table in the page context, generate
a `binary` workbook and send it back for further processing:

```js
var XLSX = require('xlsx');
var page = require('webpage').create();

/* this code will be run in the page */
var code = [ "function(){",
  /* call table_to_book on first table */
  "var wb = XLSX.utils.table_to_book(document.body.getElementsByTagName('table')[0]);",

  /* generate XLSB file and return binary string */
  "return XLSX.write(wb, {type: 'binary', bookType: 'xlsb'});",
"}" ].join("");

page.open('https://sheetjs.com/demos/table', function() {
  /* Load the browser script from the UNPKG CDN */
  page.includeJs("https://unpkg.com/xlsx/dist/xlsx.full.min.js", function() {
    /* The code will return an XLSB file encoded as binary string */
    var bin = page.evaluateJavaScript(code);

    var workbook = XLSX.read(bin, {type: "binary"});
    /* DO SOMETHING WITH workbook HERE */

    phantom.exit();
  });
});
```

</details>

<details>
  <summary><b>NodeJS HTML Tables without a browser</b> (click to show)</summary>

NodeJS does not include a DOM implementation and Puppeteer requires a hefty
Chromium build.  [`jsdom`](https://npm.im/jsdom) is a lightweight alternative:

```js
const XLSX = require("xlsx");
const { readFileSync } = require("fs");
const { JSDOM } = require("jsdom");

/* obtain HTML string.  This example reads from test.html */
const html_str = fs.readFileSync("test.html", "utf8");
/* get first TABLE element */
const doc = new JSDOM(html_str).window.document.querySelector("table");
/* generate workbook */
const workbook = XLSX.utils.table_to_book(doc);
```

</details>

## Processing Data

The ["Common Spreadsheet Format"](#common-spreadsheet-format) is a simple object
representation of the core concepts of a workbook.  The utility functions work
with the object representation and are intended to handle common use cases.

### Modifying Workbook Structure

**API**

_Append a Worksheet to a Workbook_

```js
XLSX.utils.book_append_sheet(workbook, worksheet, sheet_name);
```

The `book_append_sheet` utility function appends a worksheet to the workbook.
The third argument specifies the desired worksheet name. Multiple worksheets can
be added to a workbook by calling the function multiple times.  If the worksheet
name is already used in the workbook, it will throw an error.

_Append a Worksheet to a Workbook and find a unique name_

```js
var new_name = XLSX.utils.book_append_sheet(workbook, worksheet, name, true);
```

If the fourth argument is `true`, the function will start with the specified
worksheet name.  If the sheet name exists in the workbook, a new worksheet name
will be chosen by finding the name stem and incrementing the counter:

```js
XLSX.utils.book_append_sheet(workbook, sheetA, "Sheet2", true); // Sheet2
XLSX.utils.book_append_sheet(workbook, sheetB, "Sheet2", true); // Sheet3
XLSX.utils.book_append_sheet(workbook, sheetC, "Sheet2", true); // Sheet4
XLSX.utils.book_append_sheet(workbook, sheetD, "Sheet2", true); // Sheet5
```

_List the Worksheet names in tab order_

```js
var wsnames = workbook.SheetNames;
```

The `SheetNames` property of the workbook object is a list of the worksheet
names in "tab order".  API functions will look at this array.

_Replace a Worksheet in place_

```js
workbook.Sheets[sheet_name] = new_worksheet;
```

The `Sheets` property of the workbook object is an object whose keys are names
and whose values are worksheet objects.  By reassigning to a property of the
`Sheets` object, the worksheet object can be changed without disrupting the
rest of the worksheet structure.

**Examples**

<details>
  <summary><b>Add a new worksheet to a workbook</b> (click to show)</summary>

This example uses [`XLSX.utils.aoa_to_sheet`](#array-of-arrays-input).

```js
var ws_name = "SheetJS";

/* Create worksheet */
var ws_data = [
  [ "S", "h", "e", "e", "t", "J", "S" ],
  [  1 ,  2 ,  3 ,  4 ,  5 ]
];
var ws = XLSX.utils.aoa_to_sheet(ws_data);

/* Add the worksheet to the workbook */
XLSX.utils.book_append_sheet(wb, ws, ws_name);
```

</details>

### Modifying Cell Values

**API**

_Modify a single cell value in a worksheet_

```js
XLSX.utils.sheet_add_aoa(worksheet, [[new_value]], { origin: address });
```

_Modify multiple cell values in a worksheet_

```js
XLSX.utils.sheet_add_aoa(worksheet, aoa, opts);
```

The `sheet_add_aoa` utility function modifies cell values in a worksheet.  The
first argument is the worksheet object.  The second argument is an array of
arrays of values.  The `origin` key of the third argument controls where cells
will be written.  The following snippet sets `B3=1` and `E5="abc"`:

```js
XLSX.utils.sheet_add_aoa(worksheet, [
  [1],                             // <-- Write 1 to cell B3
  ,                                // <-- Do nothing in row 4
  [/*B5*/, /*C5*/, /*D5*/, "abc"]  // <-- Write "abc" to cell E5
], { origin: "B3" });
```

["Array of Arrays Input"](#array-of-arrays-input) describes the function and the
optional `opts` argument in more detail.

**Examples**

<details>
  <summary><b>Appending rows to a worksheet</b> (click to show)</summary>

The special origin value `-1` instructs `sheet_add_aoa` to start in column A of
the row after the last row in the range, appending the data:

```js
XLSX.utils.sheet_add_aoa(worksheet, [
  ["first row after data", 1],
  ["second row after data", 2]
], { origin: -1 });
```

</details>


### Modifying Other Worksheet / Workbook / Cell Properties

The ["Common Spreadsheet Format"](#common-spreadsheet-format) section describes
the object structures in greater detail.

## Packaging and Releasing Data

### Writing Workbooks

**API**

_Generate spreadsheet bytes (file) from data_

```js
var data = XLSX.write(workbook, opts);
```

The `write` method attempts to package data from the workbook into a file in
memory.  By default, XLSX files are generated, but that can be controlled with
the `bookType` property of the `opts` argument.  Based on the `type` option,
the data can be stored as a "binary string", JS string, `Uint8Array` or Buffer.

The second `opts` argument is required.  ["Writing Options"](#writing-options)
covers the supported properties and behaviors.

_Generate and attempt to save file_

```js
XLSX.writeFile(workbook, filename, opts);
```

The `writeFile` method packages the data and attempts to save the new file.  The
export file format is determined by the extension of `filename` (`SheetJS.xlsx`
signals XLSX export, `SheetJS.xlsb` signals XLSB export, etc).

The `writeFile` method uses platform-specific APIs to initiate the file save. In
NodeJS, `fs.readFileSync` can create a file.  In the web browser, a download is
attempted using the HTML5 `download` attribute, with fallbacks for IE.

_Generate and attempt to save an XLSX file_

```js
XLSX.writeFileXLSX(workbook, filename, opts);
```

The `writeFile` method embeds a number of different export functions.  This is
great for developer experience but not amenable to tree shaking using the
current developer tools.  When only XLSX exports are needed, this method avoids
referencing the other export functions.

The second `opts` argument is optional.  ["Writing Options"](#writing-options)
covers the supported properties and behaviors.

**Examples**

<details>
  <summary><b>Local file in a NodeJS server</b> (click to show)</summary>

`writeFile` uses `fs.writeFileSync` in server environments:

```js
var XLSX = require("xlsx");

/* output format determined by filename */
XLSX.writeFile(workbook, "out.xlsb");
```

For Node ESM, the `writeFile` helper is not enabled. Instead, `fs.writeFileSync`
should be used to write the file data to a `Buffer` for use with `XLSX.write`:

```js
import { writeFileSync } from "fs";
import { write } from "xlsx/xlsx.mjs";

const buf = write(workbook, {type: "buffer", bookType: "xlsb"});
/* buf is a Buffer */
const workbook = writeFileSync("out.xlsb", buf);
```

</details>

<details>
  <summary><b>Local file in a Deno application</b> (click to show)</summary>

`writeFile` uses `Deno.writeFileSync` under the hood:

```js
// @deno-types="https://deno.land/x/sheetjs/types/index.d.ts"
import * as XLSX from 'https://deno.land/x/sheetjs/xlsx.mjs'

XLSX.writeFile(workbook, "test.xlsx");
```

Applications writing files must be invoked with the `--allow-write` flag.  The
[`deno` demo](demos/deno/) has more examples

</details>

<details>
  <summary><b>Local file in a PhotoShop or InDesign plugin</b> (click to show)</summary>

`writeFile` wraps the `File` logic in Photoshop and other ExtendScript targets.
The specified path should be an absolute path:

```js
#include "xlsx.extendscript.js"

/* output format determined by filename */
XLSX.writeFile(workbook, "out.xlsx");
/* at this point, out.xlsx is a file that you can distribute */
```

The [`extendscript` demo](demos/extendscript/) includes a more complex example.

</details>

<details>
  <summary><b>Download a file in the browser to the user machine</b> (click to show)</summary>

`XLSX.writeFile` wraps a few techniques for triggering a file save:

- `URL` browser API creates an object URL for the file, which the library uses
  by creating a link and forcing a click. It is supported in modern browsers.
- `msSaveBlob` is an IE10+ API for triggering a file save.
- `IE_FileSave` uses VBScript and ActiveX to write a file in IE6+ for Windows
  XP and Windows 7.  The shim must be included in the containing HTML page.

There is no standard way to determine if the actual file has been downloaded.

```js
/* output format determined by filename */
XLSX.writeFile(workbook, "out.xlsb");
/* at this point, out.xlsb will have been downloaded */
```

</details>

<details>
  <summary><b>Download a file in legacy browsers</b> (click to show)</summary>

`XLSX.writeFile` techniques work for most modern browsers as well as older IE.
For much older browsers, there are workarounds implemented by wrapper libraries.

[`FileSaver.js`](https://github.com/eligrey/FileSaver.js/) implements `saveAs`.
Note: `XLSX.writeFile` will automatically call `saveAs` if available.

```js
/* bookType can be any supported output type */
var wopts = { bookType:"xlsx", bookSST:false, type:"array" };

var wbout = XLSX.write(workbook,wopts);

/* the saveAs call downloads a file on the local machine */
saveAs(new Blob([wbout],{type:"application/octet-stream"}), "test.xlsx");
```

[`Downloadify`](https://github.com/dcneiner/downloadify) uses a Flash SWF button
to generate local files, suitable for environments where ActiveX is unavailable:

```js
Downloadify.create(id,{
  /* other options are required! read the downloadify docs for more info */
  filename: "test.xlsx",
  data: function() { return XLSX.write(wb, {bookType:"xlsx", type:"base64"}); },
  append: false,
  dataType: "base64"
});
```

The [`oldie` demo](demos/oldie/) shows an IE-compatible fallback scenario.

</details>

<details>
  <summary><b>Browser upload file (ajax)</b> (click to show)</summary>

A complete example using XHR is [included in the XHR demo](demos/xhr/), along
with examples for fetch and wrapper libraries.  This example assumes the server
can handle Base64-encoded files (see the demo for a basic nodejs server):

```js
/* in this example, send a base64 string to the server */
var wopts = { bookType:"xlsx", bookSST:false, type:"base64" };

var wbout = XLSX.write(workbook,wopts);

var req = new XMLHttpRequest();
req.open("POST", "/upload", true);
var formdata = new FormData();
formdata.append("file", "test.xlsx"); // <-- server expects `file` to hold name
formdata.append("data", wbout); // <-- `data` holds the base64-encoded data
req.send(formdata);
```

</details>

<details>
  <summary><b>PhantomJS (Headless Webkit) File Generation</b> (click to show)</summary>

The [`headless` demo](demos/headless/) includes a complete demo to convert HTML
files to XLSB workbooks using [PhantomJS](https://phantomjs.org/). PhantomJS
`fs.write` supports writing files from the main process but has a different
interface from the NodeJS `fs` module:

```js
var XLSX = require('xlsx');
var fs = require('fs');

/* generate a binary string */
var bin = XLSX.write(workbook, { type:"binary", bookType: "xlsx" });
/* write to file */
fs.write("test.xlsx", bin, "wb");
```

Note: The section ["Processing HTML Tables"](#processing-html-tables) shows how
to generate a workbook from HTML tables in a page in "Headless WebKit".

</details>



The [included demos](demos/) cover mobile apps and other special deployments.

### Writing Examples

- <http://sheetjs.com/demos/table.html> exporting an HTML table
- <http://sheetjs.com/demos/writexlsx.html> generates a simple file

### Streaming Write

The streaming write functions are available in the `XLSX.stream` object.  They
take the same arguments as the normal write functions but return a NodeJS
Readable Stream.

- `XLSX.stream.to_csv` is the streaming version of `XLSX.utils.sheet_to_csv`.
- `XLSX.stream.to_html` is the streaming version of `XLSX.utils.sheet_to_html`.
- `XLSX.stream.to_json` is the streaming version of `XLSX.utils.sheet_to_json`.

<details>
  <summary><b>nodejs convert to CSV and write file</b> (click to show)</summary>

```js
var output_file_name = "out.csv";
var stream = XLSX.stream.to_csv(worksheet);
stream.pipe(fs.createWriteStream(output_file_name));
```

</details>

<details>
  <summary><b>nodejs write JSON stream to screen</b> (click to show)</summary>

```js
/* to_json returns an object-mode stream */
var stream = XLSX.stream.to_json(worksheet, {raw:true});

/* the following stream converts JS objects to text via JSON.stringify */
var conv = new Transform({writableObjectMode:true});
conv._transform = function(obj, e, cb){ cb(null, JSON.stringify(obj) + "\n"); };

stream.pipe(conv); conv.pipe(process.stdout);
```

</details>

<details>
  <summary><b>Exporting NUMBERS files</b> (click to show)</summary>

The NUMBERS writer requires a fairly large base.  The supplementary `xlsx.zahl`
scripts provide support.  `xlsx.zahl.js` is designed for standalone and NodeJS
use, while `xlsx.zahl.mjs` is suitable for ESM.

_Browser_

```html
<meta charset="utf8">
<script src="xlsx.full.min.js"></script>
<script src="xlsx.zahl.js"></script>
<script>
var wb = XLSX.utils.book_new(); var ws = XLSX.utils.aoa_to_sheet([
  ["SheetJS", "<3","விரிதாள்"],
  [72,,"Arbeitsblätter"],
  [,62,"数据"],
  [true,false,],
]); XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
XLSX.writeFile(wb, "textport.numbers", {numbers: XLSX_ZAHL, compression: true});
</script>
```

_Node_

```js
var XLSX = require("./xlsx.flow");
var XLSX_ZAHL = require("./dist/xlsx.zahl");
var wb = XLSX.utils.book_new(); var ws = XLSX.utils.aoa_to_sheet([
  ["SheetJS", "<3","விரிதாள்"],
  [72,,"Arbeitsblätter"],
  [,62,"数据"],
  [true,false,],
]); XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
XLSX.writeFile(wb, "textport.numbers", {numbers: XLSX_ZAHL, compression: true});
```

_Deno_

```ts
import * as XLSX from './xlsx.mjs';
import XLSX_ZAHL from './dist/xlsx.zahl.mjs';

var wb = XLSX.utils.book_new(); var ws = XLSX.utils.aoa_to_sheet([
  ["SheetJS", "<3","விரிதாள்"],
  [72,,"Arbeitsblätter"],
  [,62,"数据"],
  [true,false,],
]); XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
XLSX.writeFile(wb, "textports.numbers", {numbers: XLSX_ZAHL, compression: true});
```

</details>

<https://github.com/sheetjs/sheetaki> pipes write streams to nodejs response.

### Generating JSON and JS Data

JSON and JS data tend to represent single worksheets. The utility functions in
this section work with single worksheets.

The ["Common Spreadsheet Format"](#common-spreadsheet-format) section describes
the object structure in more detail.  `workbook.SheetNames` is an ordered list
of the worksheet names.  `workbook.Sheets` is an object whose keys are sheet
names and whose values are worksheet objects.

The "first worksheet" is stored at `workbook.Sheets[workbook.SheetNames[0]]`.

**API**

_Create an array of JS objects from a worksheet_

```js
var jsa = XLSX.utils.sheet_to_json(worksheet, opts);
```

_Create an array of arrays of JS values from a worksheet_

```js
var aoa = XLSX.utils.sheet_to_json(worksheet, {...opts, header: 1});
```

The `sheet_to_json` utility function walks a workbook in row-major order,
generating an array of objects.  The second `opts` argument controls a number of
export decisions including the type of values (JS values or formatted text). The
["JSON"](#json) section describes the argument in more detail.

By default, `sheet_to_json` scans the first row and uses the values as headers.
With the `header: 1` option, the function exports an array of arrays of values.

**Examples**

[`x-spreadsheet`](https://github.com/myliang/x-spreadsheet) is an interactive
data grid for previewing and modifying structured data in the web browser.  The
[`xspreadsheet` demo](/demos/xspreadsheet) includes a sample script with the
`stox` function for converting from a workbook to x-spreadsheet data object.
<https://oss.sheetjs.com/sheetjs/x-spreadsheet> is a live demo.

<details>
  <summary><b>Previewing data in a React data grid</b> (click to show)</summary>

[`react-data-grid`](https://npm.im/react-data-grid) is a data grid tailored for
react.  It expects two properties: `rows` of data objects and `columns` which
describe the columns.  For the purposes of massaging the data to fit the react
data grid API it is easiest to start from an array of arrays.

This demo starts by fetching a remote file and using `XLSX.read` to extract:

```js
import { useEffect, useState } from "react";
import DataGrid from "react-data-grid";
import { read, utils } from "xlsx";

const url = "https://oss.sheetjs.com/test_files/RkNumber.xls";

export default function App() {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  useEffect(() => {(async () => {
    const wb = read(await (await fetch(url)).arrayBuffer(), { WTF: 1 });

    /* use sheet_to_json with header: 1 to generate an array of arrays */
    const data = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

    /* see react-data-grid docs to understand the shape of the expected data */
    setColumns(data[0].map((r) => ({ key: r, name: r })));
    setRows(data.slice(1).map((r) => r.reduce((acc, x, i) => {
      acc[data[0][i]] = x;
      return acc;
    }, {})));
  })(); });

  return <DataGrid columns={columns} rows={rows} />;
}
```

</details>

<details>
  <summary><b>Previewing data in a VueJS data grid</b> (click to show)</summary>

[`vue3-table-lite`](https://github.com/linmasahiro/vue3-table-lite) is a simple
VueJS 3 data table.  It is featured [in the VueJS demo](/demos/vue/modify/).

</details>

<details>
  <summary><b>Populating a database (SQL or no-SQL)</b> (click to show)</summary>

The [`database` demo](/demos/database/) includes examples of working with
databases and query results.

</details>

<details>
  <summary><b>Numerical Computations with TensorFlow.js</b> (click to show)</summary>

[`@tensorflow/tfjs`](@tensorflow/tfjs) and other libraries expect data in simple
arrays, well-suited for worksheets where each column is a data vector.  That is
the transpose of how most people use spreadsheets, where each row is a vector.

A single `Array#map` can pull individual named rows from `sheet_to_json` export:

```js
const XLSX = require("xlsx");
const tf = require('@tensorflow/tfjs');

const key = "age"; // this is the field we want to pull
const ages = XLSX.utils.sheet_to_json(worksheet).map(r => r[key]);
const tf_data = tf.tensor1d(ages);
```

All fields can be processed at once using a transpose of the 2D tensor generated
with the `sheet_to_json` e
