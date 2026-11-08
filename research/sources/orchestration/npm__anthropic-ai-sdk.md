---
id: "npm:@anthropic-ai/sdk"
kind: "npm"
category: "orchestration"
package: "@anthropic-ai/sdk"
version: "1.6.0"
url: "https://www.npmjs.com/package/@anthropic-ai/sdk"
homepage: "https://github.com/anthropics/anthropic-sdk-typescript#readme"
license: "Apache-2.0"
summary: "The official TypeScript library for the Anthropic API"
fetched_at: "2026-11-08T11:20:04Z"
---

# npm: @anthropic-ai/sdk@1.6.0

**Description:** The official TypeScript library for the Anthropic API

**Homepage:** https://github.com/anthropics/anthropic-sdk-typescript#readme

**License:** Apache-2.0

## Dependencies

- @opentelemetry/api@^1.4.1
- json-schema-to-ts@^3.1.1
- standardwebhooks@^1.0.0

## Peer dependencies

- zod@^3.25.0 || ^4.0.0

## README (from registry)

# <img src=".github/logo.svg" alt="" width="32"> Anthropic SDK for TypeScript

[![NPM version](https://img.shields.io/npm/v/@anthropic-ai/sdk.svg)](https://npmjs.org/package/@anthropic-ai/sdk)

The Anthropic SDK for TypeScript provides access to the [Claude API](https://docs.anthropic.com/en/api/) from server-side TypeScript or JavaScript applications.

## Documentation

Full documentation is available at **[platform.claude.com/docs/en/api/sdks/typescript](https://platform.claude.com/docs/en/api/sdks/typescript)**.

## Installation

```sh
npm install @anthropic-ai/sdk
```

## Getting started

```js
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'], // This is the default and can be omitted
});

const message = await client.messages.create({
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude' }],
  model: 'claude-opus-5-5',
});

console.log(message.content);
```

## Requirements

TypeScript >= 5.0 is supported.

The following runtimes are supported:

- Node.js 20 LTS or later ([non-EOL](https://endoflife.date/nodejs)) versions.
- Deno v1.28.0 or higher.
- Bun 1.0 or later.
- Cloudflare Workers.
- Vercel Edge Runtime.
- Jest 28 or greater with the `"node"` environment (`"jsdom"` is not supported at this time).
- Nitro v2.6 or greater.
- Web browsers: disabled by default to avoid exposing your secret API credentials (see [API key best practices](https://support.anthropic.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure)). Enable browser support by explicitly setting `dangerouslyAllowBrowser` to `true`.

Note that React Native is not supported at this time.

If you are interested in other runtime environments, please open or upvote an issue.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](LICENSE) file for details. Versions released before the change from the MIT License, and third-party contributions merged before it, remain under the MIT License. See [LICENSE-MIT](LICENSE-MIT).

