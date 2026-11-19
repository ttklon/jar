---
id: "npm:@ai-sdk/openai"
kind: "npm"
category: "orchestration"
package: "@ai-sdk/openai"
version: "4.0.111"
url: "https://www.npmjs.com/package/@ai-sdk/openai"
homepage: "https://ai-sdk.dev/docs"
license: "Apache-2.0"
fetched_at: "2026-11-08T11:20:04Z"
---

# npm: @ai-sdk/openai@4.0.111

**Description:** 

**Homepage:** https://ai-sdk.dev/docs

**License:** Apache-2.0

## Dependencies

- @ai-sdk/provider@4.0.37
- @ai-sdk/provider-utils@5.0.76

## Peer dependencies

- zod@^3.25.76 || ^4.1.8

## README (from registry)

# AI SDK - OpenAI Provider

The **[OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the OpenAI chat and completion APIs and embedding model support for the OpenAI embeddings API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access OpenAI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/openai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: openai('gpt-6-luna'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [OpenAI Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/openai) for more information.

