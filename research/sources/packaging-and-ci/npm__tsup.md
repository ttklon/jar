---
id: "npm:tsup"
kind: "npm"
category: "packaging-and-ci"
package: "tsup"
version: "9.0.0"
url: "https://www.npmjs.com/package/tsup"
homepage: "https://tsup.egoist.dev/"
license: "MIT"
summary: "Bundle your TypeScript library with no config, powered by esbuild"
fetched_at: "2026-11-08T11:20:04Z"
---

# npm: tsup@9.0.0

**Description:** Bundle your TypeScript library with no config, powered by esbuild

**Homepage:** https://tsup.egoist.dev/

**License:** MIT

## Dependencies

- bundle-require@^5.1.0
- cac@^7.1.0
- chokidar@^5.0.0
- consola@^3.4.2
- esbuild@^0.28.2
- fix-dts-default-cjs-exports@^1.0.1
- joycon@^3.1.1
- obug@^3.0.0
- picocolors@^1.1.1
- postcss-load-config@^6.0.1
- resolve-from@^5.0.0
- rollup@^4.64.6
- source-map-js@^1.2.2
- sucrase@^3.35.1
- tinyexec@^1.3.1
- tinyglobby@^0.2.17
- tree-kill@^1.2.2

## Peer dependencies

- @microsoft/api-extractor@^7.36.0
- @swc/core@^1
- postcss@^8.4.12
- typescript@>=4.5.0

## README (from registry)

> [!WARNING]
> This project is not actively maintained anymore. Please consider using [tsdown](https://github.com/rolldown/tsdown/) instead. Read more in [the migration guide](https://tsdown.dev/guide/migrate-from-tsup).

# tsup

[![npm version](https://badgen.net/npm/v/tsup)](https://npm.im/tsup) [![npm downloads](https://badgen.net/npm/dm/tsup)](https://npm.im/tsup)

Bundle your TypeScript library with no config, powered by [esbuild](https://github.com/evanw/esbuild).

## 👀 What can it bundle?

Anything that's supported by Node.js natively, namely `.js`, `.json`, `.mjs`. And TypeScript `.ts`, `.tsx`. [CSS support is experimental](https://tsup.egoist.dev/#css-support).

## ⚙️ Install

Install it locally in your project folder:

```bash
npm i tsup -D
# Or Yarn
yarn add tsup --dev
# Or pnpm
pnpm add tsup -D
```

You can also install it globally but it's not recommended.

## 📖 Usage

### Bundle files

```bash
tsup [...files]
```

Files are written into `./dist`.

You can bundle multiple files in one go:

```bash
tsup src/index.ts src/cli.ts
```

This will output `dist/index.js` and `dist/cli.js`.

## 📚 Documentation

For complete usages, please dive into the [docs](https://tsup.egoist.dev).

For all configuration options, please see [the API docs](https://jsdocs.io/package/tsup).

## 💬 Discussions

Head over to the [discussions](https://github.com/egoist/tsup/discussions) to share your ideas.

## Sponsors

<p align="center">
  <a href="https://chromatic.com" target="_blank"><picture>
  <source media="(prefers-color-scheme: dark)" width="500" srcset="https://fastly.jsdelivr.net/gh/egoist-bot/images@main/uPic/Group 2 (2).png">
  <img alt="Ship UIs faster with automated workflows for Storybook"  width="500" src="https://fastly.jsdelivr.net/gh/egoist-bot/images@main/uPic/Group%202%20(1).png">
</picture></a>
</p>

<p align="center">
<a href="https://github.com/sponsors/egoist" target="_blank"><img src="https://sponsors-images.egoist.dev/sponsors.svg" alt="sponsors"></a>
</p>

## Project Stats

![Alt](https://repobeats.axiom.co/api/embed/4ef361ec8445b33c2dab451e1d23784015834c72.svg 'Repobeats analytics image')

## License

MIT &copy; [EGOIST](https://github.com/sponsors/egoist)

