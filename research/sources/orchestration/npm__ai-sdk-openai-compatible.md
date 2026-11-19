---
id: "npm:@ai-sdk/openai-compatible"
kind: "npm"
category: "orchestration"
package: "@ai-sdk/openai-compatible"
version: "3.0.87"
url: "https://www.npmjs.com/package/@ai-sdk/openai-compatible"
homepage: "https://ai-sdk.dev/docs"
license: "Apache-2.0"
fetched_at: "2026-11-08T11:20:04Z"
---

# npm: @ai-sdk/openai-compatible@3.0.87

**Description:** 

**Homepage:** https://ai-sdk.dev/docs

**License:** Apache-2.0

## Dependencies

- @ai-sdk/provider@4.0.37
- @ai-sdk/provider-utils@5.0.76

## Peer dependencies

- zod@^3.25.76 || ^4.1.8

## README (from registry)

# AI SDK - OpenAI Compatible Provider

This package provides a foundation for implementing providers that expose an OpenAI-compatible API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access hundreds of models from any provider — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/openai-compatible
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const { text } = await generateText({
  model: createOpenAICompatible({
    baseURL: 'https://api.example.com/v1',
    name: 'example',
    apiKey: process.env.MY_API_KEY,
  }).chatModel('meta-llama/Llama-3-70b-chat-hf'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [OpenAI Compatible Provider documentation](https://ai-sdk.dev/providers/openai-compatible-providers) for more information.

