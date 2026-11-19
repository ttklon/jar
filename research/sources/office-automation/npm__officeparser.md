---
id: "npm:officeparser"
kind: "npm"
category: "office-automation"
package: "officeparser"
version: "8.6.0"
url: "https://www.npmjs.com/package/officeparser"
homepage: "https://officeparser.harshankur.com"
license: "MIT"
summary: "A robust, strictly-typed Node.js and Browser library for parsing office files (.docx, .pptx, .xlsx, .odt, .odp, .ods, .odg, .pdf, .rtf, .csv, .md, .html, .epub, .tex) and generating high-fidelity outputs in DOCX, ODT, XLSX, ODS, PPTX, ODP, LaTeX, Markdown"
fetched_at: "2026-11-08T11:47:22Z"
---

# npm: officeparser@8.6.0

**Description:** A robust, strictly-typed Node.js and Browser library for parsing office files (.docx, .pptx, .xlsx, .odt, .odp, .ods, .odg, .pdf, .rtf, .csv, .md, .html, .epub, .tex) and generating high-fidelity outputs in DOCX, ODT, XLSX, ODS, PPTX, ODP, LaTeX, Markdown

**Homepage:** https://officeparser.harshankur.com

**License:** MIT

## Dependencies

- @xmldom/xmldom@^0.9.12
- fflate@^0.8.3
- file-type@^22.1.0
- pdfjs-dist@6.2.108
- tesseract.js@^7.0.0

## Peer dependencies

- @pdf-lib/fontkit@^1.1.1 || ^2.0.0
- pdf-lib@^1.17.1 || ^2.0.0
- puppeteer@>=22

## README (from registry)

# officeParser: Universal Office Document Parser & Generator

A robust, strictly-typed **Node.js and Browser** library for parsing office files into a rich **Abstract Syntax Tree (AST)** and generating high-fidelity output in multiple formats.

**Parses:** [`docx`](https://en.wikipedia.org/wiki/Office_Open_XML) · [`pptx`](https://en.wikipedia.org/wiki/Office_Open_XML) · [`xlsx`](https://en.wikipedia.org/wiki/Office_Open_XML) · [`odt`](https://en.wikipedia.org/wiki/OpenDocument) · [`odp`](https://en.wikipedia.org/wiki/OpenDocument) · [`ods`](https://en.wikipedia.org/wiki/OpenDocument) · [`odg`](https://en.wikipedia.org/wiki/OpenDocument) · [`pdf`](https://en.wikipedia.org/wiki/PDF) · [`rtf`](https://en.wikipedia.org/wiki/Rich_Text_Format) · [`csv`](https://en.wikipedia.org/wiki/Comma-separated_values) · [`md`](https://en.wikipedia.org/wiki/Markdown) · [`html`](https://en.wikipedia.org/wiki/HTML) · [`epub`](https://en.wikipedia.org/wiki/EPUB) · [`tex`](https://en.wikipedia.org/wiki/LaTeX) (LaTeX, including Overleaf project zips)

**Generates:** `DOCX` · `ODT` · `XLSX` · `ODS` · `PPTX` · `ODP` · `LaTeX` · `Markdown` · `HTML` · `CSV` · `RTF` · `PDF` · `EPUB` · `Plain Text` · `RAG Chunks`

[![npm version](https://badge.fury.io/js/officeparser.svg)](https://badge.fury.io/js/officeparser)
[![Total Downloads](https://img.shields.io/npm/dt/officeparser.svg)](https://www.npmjs.com/package/officeparser)
[![Weekly Downloads](https://img.shields.io/npm/dw/officeparser.svg)](https://www.npmjs.com/package/officeparser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

### 🌟 [Live Interactive AST Visualizer & Documentation](https://harshankur.github.io/officeParser/) 🌟
*Upload any office file in your browser: inspect the AST, tweak config, and preview generated output in real-time.*

- **AST Visualizer**: Inspect the hierarchical node tree, metadata, and raw content
- **Config Configurator**: Tweak options (`ignoreNotes`, `ocr`, `newlineDelimiter`) and see results instantly
- **Debugging**: Identify exactly how nodes are interpreted
- **Format Specs**: Read detailed specs for the AST structure and all config options

---

### 📝 [Changelog](CHANGELOG.md)

---

## What's New in v8

- **Rebuilt PDF text extraction.** PDF is no longer treated as a page of flat lines. Tagged PDFs now yield real `heading` (with correct levels), `table`/`row`/`cell`, `list` and footnote/endnote `note` nodes, and one `paragraph` per paragraph. Untagged PDFs recover the same structure geometrically. Multi-column and float-beside-text pages are read in the correct order (recursive XY-cut), broken and glued words are fixed from inter-fragment spacing, super/subscripts and hyphenated line-breaks are rejoined, rotated text is recovered, and internal links resolve to the target section. `.to('text')` is **layout-faithful by default**, rendering each page as a spatial grid so columns and tables line up like the source. Per-run color/highlight extraction (on by default; set `pdfParserConfig.extractTextColor: false` to skip it) and merged-cell (`colSpan`/`rowSpan`) recovery round it out, and every node carries page geometry (`bounds`).
- **Password-protected documents.** Encrypted PDF, OOXML (`docx`/`xlsx`/`pptx`) and ODF (`odt`/`ods`/`odp`/`odg`) open through one unified `password` / `onPassword` option, across parsing, conversion and templating.
- **Native DOCX & ODT generation**, plus a **native PDF engine** (`pdfConfig.engine: 'native'`, built on `pdf-lib`) that produces real PDF bytes with no headless browser, in Node and the browser alike.
- **Templates / mail-merge** via `OfficeTemplate.render` (fill a DOCX template's `{{placeholders}}`, `{{ if }}` conditions and `{{ for }}` loops, down to one table row per item, values formatted with Word-style pictures, single or batch), and **ODG parsing** (LibreOffice Draw).
- **LaTeX in both directions** (8.1): `.tex` files and Overleaf project zips parse into the same AST as every other format (sections, lists, tables with merged cells, figures, math, footnotes, citations, cross-references, user macros, `beamer` slides), so LaTeX converts to DOCX, ODT, HTML, Markdown and the rest. And `to('tex')` turns any parsed document into LaTeX source that compiles unmodified with pdfLaTeX, XeLaTeX, LuaLaTeX, upLaTeX, pLaTeX and `latex` (the last three through dvipdfmx), presentations included (as `beamer` frames), carrying its images inside the one `.tex` file (or, in bundle mode, as files in a zip). See [LaTeX Support](#latex-support).
- **XLSX, ODS, PPTX and ODP output** (8.3): `to('xlsx')` and `to('ods')` write a workbook (a spreadsheet sheet for sheet, its values typed and shown in their number formats; any other document as its tables, each a sheet, and its text on a sheet of its own), and `to('pptx')` and `to('odp')` write a deck (a presentation slide for slide; a PDF's pages as slides with each paragraph where the page set it; any other document flowed onto slides, a slide for each heading). See [XlsxGeneratorConfig](#xlsxgeneratorconfig) and [PptxGeneratorConfig](#pptxgeneratorconfig).

See the [full changelog](CHANGELOG.md) for the complete list, including breaking changes.

---

## Table of Contents
- [What's New in v8](#whats-new-in-v8)
- [Install](#install-via-npm)
- [Command Line Usage](#command-line-usage)
- [Quick Decision Guide](#quick-decision-guide)
- [Library Usage: Parsing](#library-usage-parsing)
  - [Async/Await](#asyncawait)
  - [Callback (Backward Compat)](#callback-backward-compat)
  - [File Buffers, ArrayBuffers & Blobs](#file-buffers-arraybuffers--blobs)
  - [`ast.to()`: Generate from AST](#astto-generate-from-ast)
  - [`.to('text')`: Plain Text Extraction](#totext-plain-text-extraction)
- [OfficeGenerator](#officegenerator)
- [OfficeConverter: One-Step API](#officeconverter-one-step-api)
- [OfficeTemplate: Mail-Merge / Document Generation](#officetemplate-mail-merge--document-generation)
- [Native RAG Chunking](#native-rag-chunking)
- [The AST Structure](#the-ast-structure)
- [Deep Dive: Document Components](#deep-dive-document-components)
- [Markdown Dialect Support](#markdown-dialect-support)
- [EPUB Support](#epub-support)
- [LaTeX Support](#latex-support)
- [Performance Highlights](#performance-highlights)
- [Advanced AST Usage](#advanced-ast-usage)
- [Configuration Reference](#configuration-reference)
  - [OfficeParserConfig](#officeparserconfig)
  - [GeneratorConfig (Common)](#generatorconfig-common)
  - [onNode Callback](#onnode-callback-advanced-node-manipulation)
  - [styleMap: Semantic Style Mapping](#stylemap-semantic-style-mapping)
  - [HtmlGeneratorConfig](#htmlgeneratorconfig)
  - [MdGeneratorConfig](#mdgeneratorconfig)
  - [PdfGeneratorConfig](#pdfgeneratorconfig)
  - [DocxGeneratorConfig](#docxgeneratorconfig)
  - [OdtGeneratorConfig](#odtgeneratorconfig)
  - [XlsxGeneratorConfig](#xlsxgeneratorconfig)
  - [OdsGeneratorConfig](#odsgeneratorconfig)
  - [PptxGeneratorConfig](#pptxgeneratorconfig)
  - [OdpGeneratorConfig](#odpgeneratorconfig)
  - [TexGeneratorConfig](#texgeneratorconfig)
  - [CsvGeneratorConfig](#csvgeneratorconfig)
  - [TextGeneratorConfig](#textgeneratorconfig)
  - [metadataOverrides](#metadataoverrides)
  - [OfficeConverterConfig](#officeconverterconfig)
  - [ChunkingConfig](#chunkingconfig)
- [OCR Scheduler & Resource Management](#ocr-scheduler--resource-management)
- [Browser Usage](#browser-usage)
- [Troubleshooting & Common Issues](#troubleshooting--common-issues)
- [Known Limitations](#known-limitations)
- [Security & Trust Boundary](#security--trust-boundary)
- [Contributing](#contributing)

---

## Install via npm

```bash
npm i officeparser
```

> [!NOTE]
> Requires Node.js 22.23.4, 24.22.1, 26.12.1 or later in its line. Earlier releases have a flaw in their Brotli decoder (CVE-2026-111497); officeParser avoids that decoder on them and raises `BROTLI_DECODER_AVOIDED` when it does, but only upgrading protects the rest of your application.

---

## Command Line Usage

```bash
# Full AST as JSON (default)
npx officeparser /path/to/file.docx

# Plain text output
npx officeparser /path/to/file.docx --to=text

# Convert DOCX to Markdown and save
npx officeparser report.docx --to=md --output=report.md

# Convert PPTX to HTML with OCR (OCR runs over extracted images, so --extractAttachments is required)
npx officeparser presentation.pptx --to=html --output=preview.html --ocr --extractAttachments

# Convert XLSX to CSV with a custom delimiter
npx officeparser data.xlsx --to=csv --csvDelimiter=";"

# Generate RAG chunks
npx officeparser document.pdf --to=chunks

# Convert DOCX to EPUB (--extractAttachments is required to embed images)
npx officeparser book.docx --extractAttachments --to=epub --output=book.epub

# Convert Markdown (or any source) to a Word document
npx officeparser notes.md --extractAttachments --to=docx --output=notes.docx

# Convert a Word document (or any source) to OpenDocument Text
npx officeparser report.docx --extractAttachments --to=odt --output=report.odt

# Convert a document's tables to a workbook (each table a sheet, its text on a sheet named Text)
npx officeparser report.docx --to=xlsx --output=report.xlsx
npx officeparser report.pdf --to=ods --odsConfig.sheetPerTable=false --output=report.ods

# Convert a PDF or any other source to a presentation (--extractAttachments is required for pictures and charts)
npx officeparser slides.pdf --extractAttachments --to=pptx --output=slides.pptx
npx officeparser slides.pdf --extractAttachments --to=pptx --pptxConfig.backgrounds=page1.png,page2.png --output=slides.pptx

# Convert any source to LaTeX: a .tex file, or a zip of main.tex plus its images
npx officeparser paper.docx --extractAttachments --to=tex --output=paper.tex
npx officeparser paper.docx --extractAttachments --to=tex --texConfig.bundle --output=paper.zip

# Convert LaTeX to Word: a single .tex, or an Overleaf project zip (which brings its \input files and images)
npx officeparser paper.tex --to=docx --output=paper.docx
npx officeparser overleaf-project.zip --extractAttachments --to=docx --output=paper.docx

# Overriding file extension mapping
npx officeparser my_document --fileType=docx --to=json
```

### CLI Syntax
- **Values:** Flags can be passed as `--flag=value` or `--flag value`.
- **Booleans:** Bare flags imply `true` (e.g. `--ocr` is equivalent to `--ocr=true`). Negation flags start with `no-` (e.g. `--no-ocr` is equivalent to `--ocr=false`).
- **Nested Objects:** You can pass nested properties directly using JSON dot-notation (e.g. `--ocrConfig.language=fra` or `--htmlConfig.containerWidth=900px`).
- **Images:** the CLI parses directly, so add `--extractAttachments` for images to reach *any* output (HTML/EPUB embed them, DOCX/ODT/PPTX/ODP/Markdown/native-PDF include them, and LaTeX carries PNG and JPEG images inside the `.tex`, or with `--texConfig.bundle` packages them beside it). Without it, an image node has no bytes and HTML/Markdown emit a name-only `<img src="image1.png">` reference. (The `OfficeConverter`/`convert()` API auto-enables this; the CLI does not.)

### CLI Options

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--to` | `json\|text\|md\|html\|csv\|rtf\|pdf\|docx\|odt\|xlsx\|ods\|pptx\|odp\|tex\|epub\|chunks` | `json` | Output format (`latex` is accepted as an alias of `tex`) |
| `--output` | path | (none) | Write output to a file |
| `--fileType` | `docx\|xlsx\|pptx\|odt\|odp\|ods\|odg\|pdf\|rtf\|csv\|md\|html\|epub\|tex` | (none) | Explicitly override input file type detection. Also accepts `latex`/`ltx`, the ODF template names `ott`/`ots`/`otp`/`otg`, and `zip` (parsed as whatever the archive holds) |
| `--ocr` | boolean | `false` | Enable OCR for images (also requires `--extractAttachments`; OCR runs over extracted images) |
| `--ocrConfig.language` | string | `eng` | Tesseract language(s), e.g. `deu` or `eng+fra` |
| `--ocrConfig.preserveLayout` | boolean | `true` | Keep the line layout of recognized text |
| `--password` | string | (none) | Password for an encrypted document (PDF, OOXML, or ODF) |
| `--allowRemoteAssets` | boolean | `true` | `false` fails with `REMOTE_ASSET_BLOCKED` where the pdf.js worker or Tesseract's files would come from the library's default CDN address, and fetches no pdf.js CMap or image decoder from it (`PDF_ASSET_UNAVAILABLE`) |
| `--pdfCMapUrl` | string | pdfjs-dist's `cmaps/` | Folder of pdf.js's CMaps, for the text of fonts a PDF does not embed (CJK) |
| `--pdfDecoderUrl` | string | pdfjs-dist's `wasm/` | Folder of pdf.js's image decoders (JBIG2, CCITT fax, JPEG 2000) |
| `--ocrConfig.cacheMethod` | `write\|readOnly\|refresh\|none` | `write` | Where OCR keeps the language data it loads (`none` stores nothing) |
| `--extractAttachments` | boolean | `false` | Extract images/charts as Base64 |
| `--ignoreNotes` | boolean | `false` | Ignore footnotes/endnotes/speaker notes |
| `--ignoreComments` | boolean | `false` | Ignore inline comments |
| `--ignoreHeadersAndFooters` | boolean | `false` | Ignore headers and footers |
| `--ignoreSlideMasters` | boolean | `false` | Ignore slide masters |
| `--ignoreInternalLinks` | boolean | `false` | Ignore internal links |
| `--newlineDelimiter` | string | `\n` | Delimiter between lines/blocks in plaintext outputs |
| `--csvDelimiter` | string | `auto` | Delimiter of CSV files; `auto` reads it from the file (comma, semicolon, tab or bar) |
| `--includeRawContent` | boolean | `false` | Include raw XML/RTF in nodes |
| `--serializeRawContent` | boolean | `true` | Include stringified XML in metadata |
| `--preserveXmlWhitespace` | boolean | `false` | Keep raw formatting space |
| `--includeBreakNodes` | boolean | `false` | Include layout break nodes (DOCX, ODF and LaTeX page and column breaks; a typed line break is always kept) |
| `--ignorePageGeometry` | boolean | `false` | Omit per-node bounding boxes and page dimensions |
| `--pdfParserConfig.useTags` | boolean | `true` | Use the PDF tag tree; `false` forces geometry-only structure |
| `--pdfParserConfig.detectColumns` | boolean | `true` | Multi-column reading-order detection |
| `--pdfParserConfig.pageRange` | string | all | Parse only the given pages, e.g. `1-3,7` |
| `--htmlParserConfig.preserveComments` | boolean | `false` | Keep HTML/EPUB `<!-- -->` comments as `comment` nodes |
| `--texParserConfig.today` | string | the date of the parse | What `\today` prints in LaTeX input, e.g. `--texParserConfig.today="May 1, 2024"` |
| `--pdfParserConfig.headingDetection` | `auto\|font-size\|tags\|off` | `auto` | How PDF headings are decided: from tags and a font-size heuristic, the heuristic alone, tags alone, or never |
| `--pdfParserConfig.mergeHyphenatedWords` | boolean | `true` | Rejoin words hyphenated across line breaks |
| `--pdfParserConfig.normalizeText` | boolean | `true` | Unicode/ligature normalization of extracted text |
| `--pdfParserConfig.extractTextColor` | boolean | `true` | Record each run's fill colour in `formatting.color`, and the coloured rectangle it sits on in `formatting.backgroundColor` (set `false` to skip for speed) |
| `--pdfParserConfig.keepHeadersAndFootersInPages` | boolean | `false` | Keep a PDF's running headers and footers (a tagged PDF's artifacts, or the lines an untagged one repeats at the top and bottom of its pages) in each page's content, in place, instead of `auxiliary` |
| `--pdfParserConfig.maxTextItems` | number | `20000` | Base of the text items a PDF may yield (plus one per byte of the file) |
| `--pdfParserConfig.maxOperators` | number | `250000` | Base of the drawing operators kept from a PDF (plus four per byte of the file) |
| `--pdfParserConfig.maxAnnotations` | number | `10000` | Base of the annotations read from a PDF (plus one per 32 bytes of the file) |
| `--pdfParserConfig.maxTimeMs` | number | `5000` | Base of the CPU time the separate pdf.js process may spend on a PDF (plus 20 ms per KB of the file) |
| `--pdfParserConfig.maxImagePixels` | number | `40000000` | Most pixels a PDF picture may have to be extracted |
| `--pdfParserConfig.separateProcess` | boolean | `true` | Run pdf.js in a separate process under a memory limit (Node) |
| `--pdfParserConfig.processMemoryMb` | number | `1024` | Heap the separate pdf.js process may use |
| `--verbose` | boolean | `false` | Show full error stack traces and warning logs |
| `--includeFormatting` | boolean | `true` | Include formatting style map matching |
| `--renderMetadata` | boolean | `false` | Render metadata as visible content in the generated output |
| `--includeImages` | `image-only\|image+ocr-text\|ocr-text-only\|none` | `image-only` | How image nodes render. Works as `--includeImages=<mode>` or `--includeImages <mode>`; a bare `--includeImages` means `image-only` |
| `--maxInlineImageBytes` | number | `1500000` | Largest image HTML/Markdown inlines as a `data:` URI (`0` never inlines) |
| `--htmlConfig.containerWidth` | string \| number | `auto` | HTML output container width (e.g. `900px`, `100%`) |
| `--textConfig.pageSeparator` | string | `\n` | Separator written between pages in text output |
| `--pdfConfig.engine` | `html\|native` | `html` | PDF engine: Puppeteer (`html`) or pdf-lib (`native`, no browser) |
| `--pdfConfig.fonts.regular` | file path | (none) | Font file (`.ttf`/`.otf`/`.woff`/`.woff2`) the native engine draws in; also `.bold`, `.italic`, `.boldItalic`, `.mono` |
| `--pdfConfig.fallbackFonts` | file paths, comma-separated | (none) | Font files tried in order for the characters the fonts before them lack (native engine) |
| `--pdfConfig.subsetFonts` | boolean | `true` | `false` embeds whole font files, not only the glyphs used |
| `--pdfConfig.outline` | boolean | `false` | Write a bookmark outline from the headings |
| `--pdfConfig.format` | `auto\|A4\|Letter\|...` | `auto` | Paper format; `auto` is the document's own pages (each section's, each sheet's, a slide's size), else A4 |
| `--pdfConfig.printHidden` | boolean | `false` | Print hidden sheets, rows and columns |
| `--pdfConfig.printSpeakerNotes` | boolean | `false` | Print each slide's speaker notes after it |
| `--xlsxConfig.sheetPerTable` | boolean | `true` | XLSX: each of a document's tables on a sheet of its own; `false` puts them all on one sheet. `--odsConfig.sheetPerTable` for ODS |
| `--xlsxConfig.includeText` | boolean | `true` | XLSX: a document's text outside its tables on a sheet named `Text`; `false` leaves it out. `--odsConfig.includeText` for ODS |
| `--pptxConfig.backgrounds` | picture file paths, comma-separated | (none) | PPTX: a PNG or JPEG file for each page of a PDF (or slide of a presentation), in order, drawn as its slide's background under its text; an empty entry for a page without one (`a.png,,c.png`). A file that cannot be read ends the run. `--odpConfig.backgrounds` for ODP |
| `--texConfig.bundle` | boolean | `false` | LaTeX: write a zip of `main.tex` plus its `images/` instead of the `.tex` alone |
| `--texConfig.embedImages` | boolean | `true` | LaTeX: `false` refers to `images/` files instead of carrying PNG and JPEG images inside the `.tex` |
| `--texConfig.documentClass` | `auto\|article\|report\|book\|beamer` | `auto` | LaTeX document class (`auto` = `beamer` for presentations, `article` otherwise) |
| `--texConfig.standalone` | boolean | `true` | LaTeX: `false` writes the body only, for pasting into an existing document |
| ~~`--format`~~ | `json\|text\|md\|html\|csv\|rtf\|pdf\|docx\|odt\|xlsx\|ods\|pptx\|odp\|tex\|epub\|chunks` | `json` | **Deprecated.** Use `--to` |
| ~~`--toText`~~ | | | **Removed in v8.** Use `--to=text`. |
| ~~`--ocrLanguage`~~ | | | **Removed in v8.** Use `--ocrConfig.language`. |
| ~~`--putNotesAtLast`~~ | | | **Removed in v8.** Notes are attached structurally via `node.notes`. |
| ~~`--outputErrorToConsole`~~ | | | **Removed in v8.** Use `--verbose`. |

Every removed flag above exits with status 1 and prints its replacement, rather than being accepted
and ignored. An unrecognized or renamed **config** key (say `--ocrConfig.autoTerminateTimeout`) is not fatal, but the
CLI always prints the warning naming its replacement, with or without `--verbose`.

---

## Quick Decision Guide

| Goal | API to use |
|------|-----------|
| Extract text / AST from a file | `OfficeParser.parseOffice(file)` |
| Convert directly to another format | `OfficeConverter.convert(file, 'md')` |
| Parse first, then generate | `parseOffice()` → `OfficeGenerator.generate(ast, 'html')` |
| Convert on the AST itself (shorthand) | `ast.to('md')` |
| RAG pipeline chunking | `OfficeConverter.convert(file, 'chunks', {...})` |

---

## Library Usage: Parsing

### Async/Await

```js
const officeParser = require('officeparser');

const ast = await officeParser.parseOffice('/path/to/file.docx');

console.log(ast.type);       // 'docx'
console.log(ast.metadata);   // { author, title, created, ... }
console.log(ast.content);    // Array of hierarchical nodes
console.log(ast.attachments);// Images/charts (if extractAttachments: true)
console.log(ast.warnings);   // Non-fatal issues from parsing phase
```

**TypeScript (named import):**
```ts
import { OfficeParser } from 'officeparser';

const ast = await OfficeParser.parseOffice('report.docx', {
    extractAttachments: true,
    ocr: true,
});
```

### Callback (Backward Compat)

```js
officeParser.parseOffice('/path/to/file.docx', async function(ast, err) {
    if (err) { console.error(err); return; }
    console.log((await ast.to('text')).value);
});
```

### File Buffers, ArrayBuffers & Blobs

Pass a `Buffer`, `ArrayBuffer`, `Uint8Array`, or a web `Blob`/`File` instead of a file path:

```js
const fs = require('fs');
const buffer = fs.readFileSync('/path/to/file.pdf');
const ast = await officeParser.parseOffice(buffer);
```

In the browser you can hand a `File`/`Blob` straight from an `<input type="file">`, with no need to
read it into a buffer first. A `File`'s name drives type detection, so no `fileType` hint is
needed when the name has a recognizable extension:

```js
// input.files[0] is a File (e.g. "report.docx")
const ast = await officeParser.parseOffice(input.files[0]);
```

> [!IMPORTANT]
> **Text-based formats from buffers need a `fileType` hint.**
> Formats like `md`, `html`, `csv` and `tex` have no magic bytes, so the parser cannot
> auto-detect them from a buffer. You **must** provide `fileType` in that case:
> ```js
> const ast = await officeParser.parseOffice(markdownBuffer, { fileType: 'md' });
> ```

> [!NOTE]
> **ZIP-backed formats are identified from inside the archive.** DOCX, XLSX, PPTX, ODT, ODS, ODP
> and EPUB are all ZIP files, and telling them apart from the first bytes alone is unreliable for
> archives written by streaming producers or holding very many parts. When the byte signature is
> inconclusive, the archive is opened and the format is read from its own declaration
> (`[Content_Types].xml`, or the `mimetype` entry), so these parse from a buffer without a hint.
> A LaTeX project zip is recognized the same way, by a `.tex` file with a `\documentclass` near the
> archive root, and so is a file named `.zip`: that extension names no format, so the archive's
> contents decide which parser runs.
> Supplying `fileType` remains the fastest and most certain route: it decides which parser runs,
> and for these formats no archive inspection is done at all.

### Cancellation with AbortSignal

You can pass a standard `AbortSignal` (e.g. from an `AbortController`) to cancel an active parse operation. This is especially useful for setting request-level timeouts or canceling long-running parses (like large PDFs with OCR).

```js
const controller = new AbortController();

// Cancel parsing if it takes longer than 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
    const ast = await officeParser.parseOffice('large_scanned_file.pdf', {
        abortSignal: controller.signal,
        ocr: true,
        extractAttachments: true // page-image OCR needs this; ocr alone does nothing
    });
} catch (err) {
    if (err.name === 'AbortError') {
        console.log('Parsing was cancelled.');
    } else {
        console.error('Parsing failed:', err);
    }
}
```

The signal is checked between steps, and it stops work that waits: OCR, PDF pages, reading an
archive. Reading a document's own markup (its XML, HTML, Markdown or LaTeX) is synchronous work, and
a timer cannot fire while it runs, so an abort requested during it takes effect only once it ends.
To bound the time an untrusted document can take, parse it in a worker thread or child process and
end that when your time limit passes; the signal alone cannot. PDFs are the exception in Node: pdf.js
runs in a separate process (`pdfParserConfig.separateProcess`), which the signal ends mid-stream, and
pdf.js in the host stops at its next time slice.

> [!IMPORTANT]
> **AbortError Propagation**
> When parsing is cancelled via `AbortSignal`, the parser rejects with a standard `AbortError` (a `DOMException` or an Error with `name: 'AbortError'`).
> This error is *not* wrapped in standard OfficeParser error types so that you can reliably detect cancellation using `error.name === 'AbortError'`.

> [!NOTE]
> **Cancellation is cooperative**
> The signal is checked between steps: an already-aborted signal rejects before any work, and an abort
> is seen at the next check (between archive reads, pages, OCR jobs, or batches of parsed tokens). A
> step that runs synchronously, such as parsing a `.tex` file or one large XML part, finishes before a
> timer's abort can run; those steps are bounded in size instead.

> [!NOTE]
> **Worker Cleanup on Abort**
> If an OCR job is actively running in the background when the signal is aborted, `officeParser` automatically terminates the Tesseract worker process immediately and removes it from the pool to prevent thread/memory leaks.

### Custom OCR Timeouts

To prevent the parser from hanging indefinitely due to slow network connections (when downloading Tesseract language datasets) or complex image processing, you can configure granular timeouts under `ocrConfig.timeout`.

```js
const ast = await officeParser.parseOffice('scanned_document.pdf', {
    ocr: true,
    extractAttachments: true, // required: OCR of a PDF's page images runs through the attachment path
    ocrConfig: {
        timeout: {
            workerLoad: 30000,    // 30s max to load worker & download language training files
            recognition: 15000,   // 15s max per image text recognition
            autoTerminate: 10000  // 10s of inactivity before terminating idle workers
        }
    }
});
```

> [!TIP]
> **Non-Fatal Timeout Recovery**
> If `workerLoad` or `recognition` timeouts are exceeded, the parser will log a warning in `ast.warnings` and **continue parsing the rest of the document**. The overall promise resolves successfully with the text extracted from the document layers (rather than failing the entire parse).

### OCR Layout Reconstruction

By default (`ocrConfig.preserveLayout: true`) the recognized text keeps its two-dimensional page layout, rebuilt from Tesseract's per-word bounding boxes: a scanned table, form or multi-column page keeps its columns (right-hand text stays on the right, labels and values line up) instead of collapsing to a flat reading-order string. It is the OCR analogue of `textConfig.preserveLayout` for born-digital PDFs. Set it `false` for the plain, linearized text.

```js
const ast = await officeParser.parseOffice('scanned_invoice.pdf', {
    ocr: true,
    extractAttachments: true, // required: OCR of a PDF's page images runs through the attachment path
    ocrConfig: { preserveLayout: true } // default; false = flat reading-order text
});
```

### `ast.to()`: Generate from AST

The preferred way to convert a parsed AST to another format. Returns a `ConversionResult`.

```ts
// ConversionResult shape:
// { value: string | Uint8Array | OfficeChunk[], messages: OfficeIssue[] }

const { value: markdown, messages } = await ast.to('md');
const { value: html }               = await ast.to('html', { includeFormatting: false });
const { value: chunks }             = await ast.to('chunks', { chunksConfig: { strategy: 'fixed-size', chunkSize: 800 } });
const { value: pdfBytes }           = await ast.to('pdf'); // Uint8Array
const { value: deck }               = await ast.to('pptx'); // Uint8Array (also docx, odt, xlsx, ods, odp, epub)
```

### `.to('text')`: Plain Text Extraction

Plain text comes from `.to('text')`, which is asynchronous and configurable. Its defaults render
tables as aligned grids, lists with markers and indentation, and include notes and image
placeholders:

```js
// Default: aligned tables, list markers, notes, image placeholders, layout-faithful PDF pages
const { value } = await ast.to('text');

// Flat stream of text, no grid alignment or markers
const { value } = await ast.to('text', {
    includeImages: false,
    textConfig: { preserveLayout: false, renderNotes: false },
});
```

| Feature | default | flat (`preserveLayout: false`) | governed by |
|---|---|---|---|
| Tables | aligned grid | one cell per line, tab-separated | `textConfig.preserveLayout` (default `true`) |
| Lists | markers + indentation | plain text | `textConfig.preserveLayout` (default `true`) |
| PDF pages | spatial monospace grid (columns/tables aligned like the page) | flowing text | `textConfig.preserveLayout` + geometry |
| Footnotes/endnotes | emitted | emitted | `textConfig.renderNotes` (default `true`) |
| Image placeholders | emitted | emitted | `includeImages` (default `true`) |

For PDFs with page geometry (the default, unless `ignorePageGeometry` is set), `preserveLayout` renders
each page as a spatial monospace grid so multi-column text and tables line up much like the original
page, similar to `pdftotext -layout`. Use `textConfig.pageSeparator` (default `'\n'`, or `'\f'` for a
form feed) to control what goes between pages.

Spreadsheets (CSV/ODS/XLSX) are unaffected by `preserveLayout`: it governs `table`/`list` nodes,
while spreadsheet content is `sheet`/`row`/`cell`. There the default aligned grid is the most
faithful rendering.

> [!NOTE]
> The synchronous `ast.toText()` method was **removed in v8**. Use `(await ast.to('text')).value`,
> which produces the same content at its defaults and adds the configuration above.

---

## OfficeGenerator

Use `OfficeGenerator.generate(ast, format, config?)` when you need to produce output from an already-parsed AST:

```ts
import { OfficeParser, OfficeGenerator } from 'officeparser';

const ast = await OfficeParser.parseOffice('report.docx');

// Convert to Markdown
const { value: md } = await OfficeGenerator.generate(ast, 'md');

// Convert to HTML with style mapping
const { value: html } = await OfficeGenerator.generate(ast, 'html', {
    includeFormatting: true,
    styleMap: [
        {
            selector: { nodeType: 'paragraph', attributes: { style: 'Heading 1' } },
            output: { tag: 'h1', classes: ['main-title'] }
        }
    ]
});

// Convert to CSV (spreadsheets)
const { value: csv } = await OfficeGenerator.generate(ast, 'csv');
```

**Supported destinations:** `'text'` · `'md'` · `'html'` · `'csv'` · `'rtf'` · `'pdf'` · `'docx'` · `'odt'` · `'xlsx'` · `'ods'` · `'pptx'` · `'odp'` · `'tex'` (alias `'latex'`) · `'epub'` · `'chunks'`

> [!NOTE]
> **PDF generation** uses a headless browser by default (`pdfConfig.engine: 'html'`), which needs the
> optional `puppeteer` peer dependency:
> ```bash
> npm install puppeteer
> ```
> Or choose `pdfConfig.engine: 'native'` to lay the document out directly with `pdf-lib`
> (`npm install pdf-lib`): no browser, and the only engine that produces a real PDF in the browser
> (import from `officeparser/browser-native-pdf` for the client-side path). To draw text the
> Standard-14 fonts cannot (Greek, Cyrillic, Hindi, Arabic, Chinese, ...), give it fonts and
> `npm install @pdf-lib/fontkit`.
> See [PdfGeneratorConfig](#pdfgeneratorconfig).
>
> **EPUB generation with images** requires `extractAttachments: true` on the parse step that
> produced the AST. See [EPUB Support](#epub-support). So do pictures and charts in **PPTX and ODP**
> output: a chart is written as a table of its data, which is in its attachment.

---

## OfficeConverter: One-Step API

`OfficeConverter.convert()` combines parsing and generation in a single call. It automatically syncs parser options from the generator config: unless you set `parseConfig.extractAttachments` explicitly, it is enabled when the output will render images or charts, or when you enable `parseConfig.ocr`. An explicit `parseConfig.extractAttachments` (including `false`) always wins, and `parseConfig.ocr` is honored (so `{ parseConfig: { ocr: true } }` produces OCR text through the converter, given an image-or-OCR output mode).

```ts
import { OfficeConverter } from 'officeparser';

// Minimal usage
const { value: markdown } = await OfficeConverter.convert('report.docx', 'md');

// With config
const { value: html, messages } = await OfficeConverter.convert('data.xlsx', 'html', {
    parseConfig: {
        ignoreNotes: true,
        newlineDelimiter: '\n\n',
    },
    generatorConfig: {
        includeFormatting: true,
        styleMap: [
            {
                selector: { attributes: { style: { value: 'Header', operator: '~=' } } },
                output: { tag: 'h2', classes: ['data-header'] }
            }
        ]
    },
    onWarning: (issue) => console.warn(`[${issue.code}] ${issue.message}`)
});
```

> [!IMPORTANT]
> The `OfficeConverterConfig` shape uses **nested** `parseConfig` and `generatorConfig` sub-objects.
> Do **not** put parser or generator options at the top level; only `onWarning` lives there. An option
> placed there has no effect, and is reported as `UNRECOGNIZED_CONFIG_OPTION` naming where it belongs
> (`texConfig` under `generatorConfig`, `ocr` under `parseConfig`).

---

## OfficeTemplate: Mail-Merge / Document Generation

`OfficeTemplate.render()` (alias `renderTemplate`) fills a **DOCX template**'s tags from your data and returns a new `.docx`: `{{placeholder}}` fields, `{{ if }}` conditions that keep or drop content, and `{{ for }}` loops that repeat it, down to one table row per item. It is not parsing or conversion: the template is copied and only its tags change, so **all of the template's formatting, layout and structure are preserved**. Give it one data object for one document, or an array for a batch (one document per entry, a classic mail-merge). Think of it as a zero-dependency take on Adobe's Document Generation API.

```ts
import { OfficeTemplate } from 'officeparser';
import { writeFileSync } from 'fs';

// One document.
const bytes = await OfficeTemplate.render('invoice-template.docx', {
    data: {
        name: 'Acme Corp', amount: '$1,250.00', due: '2026-10-01', paid: false,
        lines: [
            { description: 'Widgets', qty: 2, price: '$1,000.00' },
            { description: 'Support', qty: 1, price: '$250.00' },
        ],
    },
});
writeFileSync('invoice-acme.docx', bytes); // Uint8Array

// A batch: one .docx per row.
const docs = await OfficeTemplate.render('invoice-template.docx', {
    data: [
        { name: 'Acme Corp', amount: '$1,250.00' },
        { name: 'Globex',    amount: '$980.00'   },
    ],
});
docs.forEach((d, i) => writeFileSync(`invoice-${i}.docx`, d));
```

### Conditions and loops

Type the tags in Word, as ordinary text:

```text
{{ if paid }}
Paid in full. Thank you!
{{ else if total > 1000 }}
Please pay {{ amount }} by {{ due }}. Large invoices may be paid in instalments.
{{ else }}
Please pay {{ amount }} by {{ due }}.
{{ endif }}

{{ for line in lines }}
{{ line.description }} x {{ line.qty }}: {{ line.price }}
{{ endfor }}
```

- **Where the tags sit decides what they cover.** Both tags in one paragraph: the text between them. Tags in separate paragraphs: the paragraphs between them; when every tag of the block has a paragraph of its own, those paragraphs are removed with the tags, so no blank line is left (a tag beside text cuts its paragraph where it stands, and the block's other tag paragraphs then stay, empty). Tags in different cells of one table: whole rows. Put `{{ for line in lines }}` in a row's first cell and `{{ endfor }}` in its last, and the row repeats once per item; close it in a later row and that group of rows repeats. `{{ if }}` keeps or drops rows the same way, each branch starting a row of its own.
- **Conditions** take a field (`{{ if paid }}`) or a comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`, joined with `and`, `or`, `not` and parentheses, against numbers, quoted strings, `true`, `false` and `null`. `false`, `null`, `""`, `0` and an empty list count as false. A comparison takes two values of the same kind (two numbers, two strings, two dates) or an empty one: comparing the text `"150"` with the number `100` rejects with `TEMPLATE_DATA_INVALID` rather than silently picking a branch. Keywords are case-insensitive, and quotes may be straight or curly, as Word's AutoCorrect writes them.
- **Loops** name their item: `{{ line.price }}` in a list of objects, `{{ t }}` in a list of plain values. Inside a loop, `loop.index` (from 0), `loop.number` (from 1), `loop.first`, `loop.last` and `loop.length` describe the current pass, so `{{ for t in tags }}{{ t }}{{ if not loop.last }}, {{ endif }}{{ endfor }}` writes `red, blue`. Loops and conditions nest.
- **Data can be nested.** `{{ customer.address.city }}` follows a path and `{{ items.0.name }}` reads an item of a list. A top-level key that itself holds a dot (`"invoice.total"`) is read as typed before it is read as a path. Only the data's own keys are read, never `__proto__` or `constructor`.
- **Mistakes are typed errors.** A block that is never closed, a closing tag with no block, or tags that cannot enclose content together (one in a table and the other outside it, one inside a tracked change, one in a Word field and the other outside it) reject with `TEMPLATE_SYNTAX`, naming the tag and the part. Text that starts like a block tag but is not one (`{{ If you have questions, call us }}`) stays text, as prose between the delimiters always has; when the blocks around it then fail to pair, the error names it and why it could not be read (`{{ if a = 1 }}`: use `==` to compare). A value that does not fit its tag (a loop over text, a list placed as a field) rejects with `TEMPLATE_DATA_INVALID`.
- **Output Word opens.** Copies of pictures, bookmarks (their names too), paragraphs and content controls get fresh ids, a footnote, endnote or comment in a copy gets a copy of its own, filled in for that pass (its fields read the pass's item), a table left with no row is removed, and a cell a branch emptied keeps an empty paragraph.

### Formatting values

A field can be written through filters, after `|`. `format` takes a picture, as Word's own mail merge does (its `\#` and `\@` switches; Excel's number formats read number pictures the same way, apart from its thousands scaling, a comma after the last digit, which a picture rejects):

```text
{{ total | format "$#,##0.00" }}              $1,250.50
{{ total | format "#,##0.00 '€'" }}           1,250.50 €
{{ loss | format "$#,##0.00;($#,##0.00)" }}   ($320.00)
{{ rate | format "0.0%" }}                    12.5%
{{ due | format "MMMM d, yyyy" }}             November 1, 2026
{{ due | format "dd/MM/yyyy HH:mm" }}         01/11/2026 09:05
{{ name | upper }}                            ADA LOVELACE
```

- **Number pictures** use `0` (a digit, always written), `#` (a digit, written when there is one), `,` (groups of three), `.` (the decimal point) and `%` (a percentage); up to three sections, `positive;negative;zero`; text in `'quotes'` or after `\` is written as is. Values are rounded half away from zero, as Word and Excel round, and text that is a number (`"1250.5"`, as form data carries it) is taken too.
- **Date pictures** use `d` `dd` `ddd` `dddd` (day), `M` `MM` `MMM` `MMMM` (month), `yy` `yyyy`, `h` `hh` (12-hour), `H` `HH` (24-hour), `m` `mm` (minutes), `s` `ss`, and `AM/PM` (`am/pm`, `A/P`). As in Word, `M` is the month and `m` the minute: Excel's `dd/mm/yyyy` is `dd/MM/yyyy` here. A value is a `Date` or ISO 8601 text (`"2026-11-01"`, `"2026-11-01T09:05:00Z"`; without an offset it is UTC).
- **The same on every machine.** The formatting is officeParser's own, not the runtime's `Intl`, so a template renders the same in every Node version and browser. What it writes is yours to set: `numberSeparators` (`{ decimal: ',', group: '.' }` writes `1.250,50`), `dateNames` (month and day names, AM/PM), and `utcOffsetMinutes` (dates are written in UTC unless you move them).
- **`upper` and `lower`** change case; filters chain left to right (`{{ code | lower | upper }}`).
- **Your own filters:** `formatters: { initials: (v) => ..., round: (v, places) => ... }`, used as `{{ name | initials }}` or `{{ x | round 2 }}`. Each gets the value as the data holds it (a list or an object too) and the strings and numbers written after its name.
- A picture given the wrong kind of value (a date picture on a number, a number picture on text that is no number) rejects with `TEMPLATE_DATA_INVALID`; a picture that cannot be read rejects with `TEMPLATE_SYNTAX`. A word after `|` that is no filter leaves the whole tag as text, like other prose between the delimiters. An empty value stays empty, and a missing one follows `onMissing`.

### Fields

- **Run-aware.** Word often splits a typed `{{name}}` across several runs (`{{`, `na`, `me}}`); it is filled anyway, and a value takes the **formatting of the run its placeholder sat in** (a bold `{{amount}}` renders bold). Block tags are found the same way.
- **Everywhere text lives.** Tags in the body, headers, footers, footnotes/endnotes and comments are all filled. Values may contain `\n` (rendered as line breaks).
- **Field names** are Unicode letters and digits plus `_`, `.`, `-` (e.g. `{{invoice.total}}`, `{{customer-name}}`). `if`, `else`, `endif`, `for` and `endfor` are the block tags' own words. Other text between the delimiters, such as prose with spaces, is left as literal text, so it is never mistaken for a field.
- **Deterministic** output (pinned zip timestamps): the same template + data always renders byte-identical bytes.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `data` | `TemplateData \| TemplateData[]` | (required) | Field values, which may be nested objects and lists. One object is one document; an array is one document per entry |
| `delimiters` | `{ start: string; end: string }` | `{{ }}` | Tag delimiters, for fields and block tags alike |
| `numberSeparators` | `{ decimal?, group? }` | `{ decimal: '.', group: ',' }` | What a number picture writes for its point and groups |
| `dateNames` | `TemplateDateNames` | English | Month and day names (full and short) and AM/PM markers a date picture writes |
| `utcOffsetMinutes` | `number` | `0` | Minutes added to UTC before a date picture writes a date (330 for India); a fixed offset, the same on every machine |
| `formatters` | `Record<string, TemplateFormatter>` | (none) | Filters of your own, used after `\|` in a tag |
| `onMissing` | `'keep' \| 'empty' \| 'error'` | `'keep'` | A field the data does not have: leave it as typed (a block whose condition or list uses it is left as typed, tags included), treat it as empty (blank text, a false condition, a loop of nothing), or reject with `TEMPLATE_FIELD_MISSING`. A field present but `null`/`undefined` always renders empty |
| `password` | `string` | (none) | Decrypt the template first, if it is itself password-protected |
| `onPassword` | `(reason) => string \| undefined \| Promise<...>` | (none) | Supplies a password when `password` did not decrypt the template, as the parser's `onPassword` does |
| `maxPasswordAttempts` | `number` | `3` | How many times `onPassword` is asked before the render rejects |
| `decompressionLimits` | `DecompressionLimits` | parser's | Bounds unzipping an untrusted template; `maxXmlElements` (2,000,000) bounds its elements, its tags and the tokens they hold together (`XML_ELEMENT_LIMIT_EXCEEDED`), and `maxRepeatedContent` (16 MiB) what loops and repeated values add, past which the render rejects with `OUTPUT_TOO_LARGE` |

### Listing tags and checking data

`OfficeTemplate.tags()` lists a template's tags without any data, to build a form or a data source from it. `OfficeTemplate.check()` reads your data against the template without writing a document, and returns every problem a render with `onMissing: 'error'` would reject for, all at once instead of the first.

```ts
// What the template reads: each field, and each tag opening a block or branch, in the order of each part.
const tags = await OfficeTemplate.tags('invoice-template.docx');
// [{ kind: 'field', tag: '{{name}}', part: 'word/document.xml', fields: ['name'], loops: [] },
//  { kind: 'for', tag: '{{ for line in lines }}', part: 'word/document.xml', fields: ['lines'], item: 'line', loops: [] },
//  { kind: 'field', tag: '{{ line.qty }}', part: 'word/document.xml', fields: ['line.qty'], loops: [{ item: 'line', list: 'lines' }] }, ...]

// Check before rendering.
const data = { name: 'Acme Corp', lines: [{ description: 'Widgets', qty: 2 }, { description: 'Support' }] };
const problems = await OfficeTemplate.check('invoice-template.docx', { data });
// [{ code: 'TEMPLATE_FIELD_MISSING', field: 'line.qty', part: 'word/document.xml',
//    loops: [{ list: 'lines', index: 1 }], message: "Template field 'line.qty' has no matching value in the data, ..." }, ...]
if (problems.length === 0) await OfficeTemplate.render('invoice-template.docx', { data });
```

- **A tag** (`TemplateTagInfo`) has its `kind` (`field`, `if`, `elseif`, `else` or `for`; `endif` and `endfor` are not listed), the tag as typed, the `part` holding it (a header's tags are in `word/header1.xml`), the paths it reads (`fields`), a field's `filters`, a loop's `item`, and the loops it is inside, outermost first.
- **A problem** (`TemplateProblem`) is `TEMPLATE_FIELD_MISSING` (with the `field`) or `TEMPLATE_DATA_INVALID` (with `details`: why, the tag and the kinds of value), with the render's `message`, the `part`, and the loops it was read in, each with its pass from 0.
- **A check follows the data** as a render does: the branch each condition picks (a field only another branch uses is not needed), every pass of every loop, and nothing inside a list that is missing or does not fit, whose fields are checked once it is given. A key present but `undefined` or `null` counts as given, as a render writes it empty.
- **A batch** (`data` as an array) returns one list per entry. A check lists at most 1,000 problems for one entry and 10,000 for a batch, and says it stopped with a `TEMPLATE_CHECK_LIMITED` warning. A template's own errors (`TEMPLATE_SYNTAX`) and the limits a render is held to reject as a render's do.

Only DOCX is supported today (other OOXML/ODF formats will follow); a non-DOCX template rejects with `TEMPLATE_UNSUPPORTED_FORMAT`.

---

## Native RAG Chunking

`officeParser` provides native document chunking for Retrieval-Augmented Generation (RAG) pipelines with three strategies:

### Strategy 1: Document Structure (Default)
Splits at natural AST boundaries (paragraphs, headings, pages, slides, sheets). Preserves logical flow.

```ts
const { value: chunks } = await OfficeConverter.convert('report.docx', 'chunks', {
    generatorConfig: {
        chunksConfig: {
            strategy: 'document-structure',
            splitBy: 'heading',    // 'paragraph' | 'heading' | 'page' | 'slide' | 'sheet'
            maxChunkSize: 1500,
            tableSplitStrategy: 'row', // repeats header row in every chunk, ideal for RAG
        }
    }
});
```

### Strategy 2: Fixed-Size (Recursive)
Splits by character count with overlap. Equivalent to LangChain's `RecursiveCharacterTextSplitter`. UTF-16 surrogate pairs stay whole: overlap may expand to include a complete code point, and a hard-cut chunk may exceed the size limit if one code point alone does not fit.

```ts
const { value: chunks } = await OfficeConverter.convert('report.docx', 'chunks', {
    generatorConfig: {
        chunksConfig: {
            strategy: 'fixed-size',
            chunkSize: 1000,
            chunkOverlap: 200,
        }
    }
});
console.log(`Generated ${chunks.length} chunks`);
```

### Strategy 3: Semantic
Uses cosine similarity between sentence embeddings to find topic boundaries. Requires you to provide an `embeddingFunction`.

```ts
import OpenAI from 'openai';
const openai = new OpenAI();

const { value: chunks } = await OfficeConverter.convert('report.docx', 'chunks', {
    generatorConfig: {
        chunksConfig: {
            strategy: 'semantic',
            embeddingFunction: async (text) => {
                const res = await openai.embeddings.create({
                    input: text, model: 'text-embedding-3-small'
                });
                return res.data[0].embedding;
            },
            similarityThreshold: 0.8,
            maxChunkSize: 2000,
        }
    }
});
```

### The `OfficeChunk` Object

`generate(ast, 'chunks')` (and `ast.to('chunks')`) resolves to a real `OfficeChunk[]` **array**, not a JSON string - serialize it to JSON/JSONL yourself if your pipeline needs that.

Every chunk contains text and rich metadata for citations and filtered retrieval:

```ts
interface OfficeChunk {
    text: string;
    /** Rich metadata for filtered retrieval */
    metadata: {
        sourceType: string;       // e.g., 'docx', 'pdf'
        pageNumber?: number;      // (PDF only)
        slideNumber?: number;     // (PPTX only)
        sheetName?: string;       // (XLSX only)
        closestHeading?: string;  // Nearest heading above this chunk
        isTableChunk?: boolean;   // True if part of a split table
    };
    startIndex?: number;          // Character offset (if addStartIndex: true)
    endIndex?: number;            // End character offset (if addStartIndex: true)
}
```

---

## The AST Structure

`OfficeParserAST` is a format-agnostic document representation:

```text
OfficeParserAST
├── type: 'docx' | 'pdf' | 'xlsx' | 'csv' | 'md' | 'epub' | 'tex' | ...  (14 formats)
├── metadata: { author, title, created, modified, keywords, customProperties, nativeProperties, styleMap, pageSetup, ... }
├── content: [ OfficeContentNode ]
│   ├── type: 'paragraph' | 'heading' | 'table' | 'list' | 'image' | 'chart' | 'drawing' | 'comment' | 'admonition' | 'embed' | 'definitionList' | ...
│   ├── text: string  (concatenated text of node + all descendants)
│   ├── children: [ OfficeContentNode ]  (recursive structural children)
│   ├── notes: [ OfficeContentNode ]     (footnotes/endnotes/slide notes attached to this node; see below)
│   ├── comments: [ OfficeContentNode ] (inline comments attached to this node)
│   ├── formatting: { bold, italic, underline, color, size, font, alignment, ... }
│   ├── bounds?: { x, y, width, height, baseline? }  (place on its page or slide: PDF, PPTX, ODP; baseline: a PDF text run's)
│   └── metadata: { level, listId, marker, row, col, rowSpan, colSpan, backgroundColor, spacing, style, ... }
├── auxiliary?: OfficeAuxiliaryContent   (out-of-band layout elements)
│   ├── headers?: OfficeContentNode[]   ('header' nodes: DOCX parts, PDF top band (tagged artifacts, or lines repeated across an untagged PDF's pages), ODT master pages, LaTeX fancyhdr; metadata { type, section, hidden })
│   ├── footers?: OfficeContentNode[]   ('footer' nodes, likewise)
│   ├── slideMasters?: OfficeContentNode[] (PPTX slide masters)
│   └── outline?: OfficeContentNode[]   (PDF bookmark outline)
├── attachments: [ OfficeAttachment ]  (populated when extractAttachments: true)
│   ├── type: 'image' | 'chart'
│   ├── name: string
│   ├── mimeType: string
│   ├── data: string  (Base64)
│   ├── ocrText?: string  (if ocr: true AND extractAttachments: true)
│   └── chartData?: { title, dataSets, labels }
├── warnings: OfficeIssue[]  (non-fatal issues from the parsing phase)
├── config: OfficeParserConfig  (the resolved parse config; `.to()` inherits newlineDelimiter/onWarning from it)
└── to(format, config?)  (format: 'html'|'md'|'text'|'csv'|'rtf'|'pdf'|'docx'|'odt'|'xlsx'|'ods'|'pptx'|'odp'|'tex'|'epub'|'chunks', returns { value, messages })
```

A note or comment referred to from several places is one node that each reference's `notes` (or `comments`) array holds. Test for a note you have already seen by identity before handling it again, and do not mutate it expecting only one reference to change. (`JSON.stringify` writes it at every reference.)

### `OfficeIssue`: Warning / Error Object

All warnings and errors (from both parsing and generation) use this shape:

```ts
interface OfficeIssue {
    type: 'warning' | 'info' | 'error';
    code: OfficeWarningType | OfficeErrorType;  // typed enum, e.g. 'OCR_FAILED'
    message: string;
    node?: OfficeContentNode;  // the node that triggered the issue, if any
    details?: any;             // original error or extra context
    page?: number;             // the PDF page it is on (1-based), where the reader knows it
}
```

Thrown errors carry the same object on `error.officeIssue`, so a failed parse is identified by
the same stable `code` you would branch on for a warning, rather than by matching message text:

```js
try {
    const ast = await officeParser.parseOffice(buffer, { fileType: 'docx' });
} catch (err) {
    switch (err.officeIssue?.code) {
        case 'ZIP_NO_ENTRIES_FOUND':  // not a ZIP archive at all
        case 'ZIP_TRUNCATED':         // cut off in transfer, entries incomplete
        case 'REQUIRED_PART_MISSING': // readable ZIP, but not the format it claims
            console.error('Unusable file:', err.officeIssue.message);
            break;
        default:
            throw err;
    }
}
```

> [!IMPORTANT]
> **A corrupt file throws; it does not parse as an empty document.** If an archive is not
> readable, is truncated, or is missing the part its format requires (`word/document.xml`,
> `xl/workbook.xml`, `ppt/presentation.xml`, ODF `content.xml`, the EPUB OPF), parsing rejects
> with one of the codes above. An empty result therefore means the document really is empty.
> Files that are legitimately empty still parse, and say so through `onWarning` /
> `ast.warnings` (`NO_WORKSHEETS_FOUND` for a chartsheet-only workbook, `NO_SLIDES_FOUND` for a
> presentation with no slides).

#### Warning codes (`type: 'warning' | 'info'`, delivered to `onWarning` and collected in `ast.warnings`)

These never throw; they report a degraded-but-successful outcome you may branch on by `code`.

| Code | Phase | Meaning / what to do |
|---|---|---|
| `OCR_REQUIRES_ATTACHMENTS` | parse | `ocr: true` without `extractAttachments: true`; no OCR ran. Set both. |
| `PDF_NO_TEXT_EXTRACTED` | parse | A PDF yielded little or no text (likely scanned). Set `ocr: true` + `extractAttachments: true`. The message says how many characters were read, if any. Where a CMap its fonts need could not be loaded (`PDF_ASSET_UNAVAILABLE`), or the text is in fonts with no character map, it also says so and names them: `details` is then `{ pages, cMaps?, fonts? }`, otherwise the page count. |
| `PDF_ASSET_UNAVAILABLE` | parse | A file pdf.js needed could not be had: a CMap (text in the fonts using it is missing) or an image decoder (pictures needing it are not decoded). Once per file per document, with the first page that needed it (`page`); the message names the file, why (missing, failed, or blocked by `allowRemoteAssets: false`) and the option to set (`pdfCMapUrl` or `pdfDecoderUrl`). |
| `PDF_STRUCT_TREE_UNRELIABLE` | parse | PDF tag tree absent/incomplete; structure recovered geometrically. |
| `PDF_TEXT_ENCODING_SUSPECT` | parse | A fifth or more of a PDF's characters (of at least 50) are unmappable glyphs (broken ToUnicode); text may be garbage. Consider OCR. |
| `PDF_FONT_UNMAPPED` | parse | A font's text is likely its glyph ids read as characters (no `/ToUnicode` on an Identity encoding, control characters among its text). Once per font name, with the first page (`page`), `details.font` and every page in `details.pages`. Consider OCR. |
| `PDF_OUTLINE_TRUNCATED` | parse | Bookmark outline hit the depth/size cap; `ast.auxiliary.outline` is partial. |
| `PDF_WORKER_MISSING` / `PDF_WORKER_FALLBACK` | parse | The pdf.js worker could not be loaded / a fallback was used (set `pdfWorkerSrc`). |
| `REMOTE_ASSET_BLOCKED` | parse (error) | `allowRemoteAssets` is `false` and the parse would have fetched the pdf.js worker or Tesseract's files from the library's default CDN address. The message names the options to set (`pdfWorkerSrc`, `ocrConfig.workerPath`/`corePath`/`langPath`). |
| `NO_WORKSHEETS_FOUND` / `NO_SLIDES_FOUND` | parse | A legitimately empty workbook/presentation. |
| `TABLE_CELL_LIMIT_EXCEEDED` | parse | The cells an ODF or XLSX document yields passed `decompressionLimits.maxTableCells` plus one per byte of the document; the rest were not read. |
| `REPEATED_CONTENT_LIMIT_EXCEEDED` | parse | The document repeated `decompressionLimits.maxRepeatedContent` (plus 16 characters per byte of the document) of content by reference (ODF repeated cells and chart values, XLSX shared strings, style values, link targets, chart text per frame, a form control's text at each `draw:control` naming it, LaTeX titles per reference); later repeats were not made, shortened or went without the value. |
| `BROTLI_DECODER_AVOIDED` | parse / generate | The runtime's Brotli decoder has a known flaw (CVE-2026-111497), so a PDF's Brotli streams or a WOFF2 font in `pdfConfig.fonts` were decoded by a slower decoder written in JavaScript. Raised only when such a stream or font is met. Upgrade the runtime. |
| `PDF_SEPARATE_PROCESS_UNAVAILABLE` | parse | pdf.js could not start in a separate process (Node), so it runs in the host; a hostile PDF can then exhaust its memory, and pdf.js's time is not bounded (bound it with `abortSignal`). |
| `PDF_CONTENT_LIMIT_EXCEEDED` | parse | A PDF passed one of its content limits (plus an allowance per byte), which the message names: past `pdfParserConfig.maxTextItems` or `maxTimeMs` the rest of it was not read; past `maxOperators` its images, text colours and font styles from that page on were not (its text was). |
| `ALT_CHUNK_NOT_READ` | parse | A DOCX alternative-format chunk (`w:altChunk`) was not read: its part is missing, is of a format other than HTML, MHT, RTF, plain text or DOCX, is a DOCX inside a DOCX chunk, or could not be read (not a ZIP, no document part, nested too deep). The rest of the document is read; a chunk past the document's limits (`maxXmlElements`, `maxUncompressedBytes`) still fails the parse. Saving the document again in Word merges chunks into it. |
| `CONTENT_PART_NOT_READ` | parse | A part of the document was not read. A chapter an EPUB's spine lists: its file is missing from the archive (or has an extension other than `.xhtml`, `.html`, `.htm`, `.xht` or `.xml`), or it is encrypted (DRM, listed in `META-INF/encryption.xml`); a book whose chapters are all encrypted throws `DOCUMENT_DECRYPTION_FAILED` instead. In a PPTX, a part that is not XML and holds none of the slides' text: the presentation's slide list or relationships (the slides are then read in the order of their file numbers), or the relationships of a notes page or a slide master (its links and pictures are then not resolved). In a PDF, an XObject whose text pdf.js could not read (with its `page`). |
| `RAW_CONTENT_LIMIT_EXCEEDED` | parse | With `includeRawContent`, the document's nodes reached `decompressionLimits.maxRawContentLength` of raw content; the remaining nodes carry none. |
| `IMAGE_EXTRACTION_FAILED` / `IMAGE_PROCESSING_FAILED` / `ATTACHMENT_EXTRACTION_FAILED` | parse | An image/attachment could not
