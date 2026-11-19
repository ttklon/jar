---
id: "npm:@ai-sdk/anthropic"
kind: "npm"
category: "orchestration"
package: "@ai-sdk/anthropic"
version: "4.0.99"
url: "https://www.npmjs.com/package/@ai-sdk/anthropic"
homepage: "https://ai-sdk.dev/docs"
license: "Apache-2.0"
fetched_at: "2026-11-08T11:20:04Z"
---

# npm: @ai-sdk/anthropic@4.0.99

**Description:** 

**Homepage:** https://ai-sdk.dev/docs

**License:** Apache-2.0

## Dependencies

- @ai-sdk/provider@4.0.37
- @ai-sdk/provider-utils@5.0.76

## Peer dependencies

- zod@^3.25.76 || ^4.1.8

## README (from registry)

# AI SDK - Anthropic Provider

The **[Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Anthropic Messages API](https://docs.anthropic.com/claude/reference/messages_post).

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Anthropic (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/anthropic
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const { text } = await generateText({
  model: anthropic('claude-haiku-5-5'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [Anthropic Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) for more information.

