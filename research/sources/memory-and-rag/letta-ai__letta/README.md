---
id: "github:letta-ai/letta"
kind: "github"
category: "memory-and-rag"
repo: "letta-ai/letta"
url: "https://github.com/letta-ai/letta"
description: "Platform for stateful agents: AI with advanced memory that can learn and self-improve over time."
stars: 25385
forks: 2668
license: "Apache-2.0"
topics:
  - "ai"
  - "ai-agents"
  - "llm"
  - "llm-agent"
archived: false
pushed_at: "2026-10-18T22:28:04Z"
default_branch: "main"
fetched_at: "2026-11-08T11:20:04Z"
---

# Letta

Build stateful agents with memory that can learn and improve over time.

Letta (f.k.a. MemGPT) is actively developed. The current source code lives in [`letta-ai/letta-code`](https://github.com/letta-ai/letta-code), which includes the agent harness, interactive terminal UI, App Server, channels, and the runtime used by the desktop and web apps.

## Get started

Install Letta from npm:

```bash
npm install -g @letta-ai/letta-code
```

Launch the interactive terminal UI:

```bash
letta
```

Run the App Server for local or self-hosted agents:

```bash
letta server
```

You can also use Letta through:

- [chat.letta.com](https://chat.letta.com) in your browser, including on mobile
- [Slack, Telegram, Discord, and custom channels](https://docs.letta.com/letta-code/channels)
- the [Letta Agent SDK](https://docs.letta.com/letta-agent-sdk/overview) for building agents into TypeScript applications
- [Letta Cloud](https://github.com/letta-ai/letta-code#letta-cloud) for keeping agent memory, identity, and conversations available across computers

See the [Letta documentation](https://docs.letta.com) for current installation, development, and deployment instructions.

## Historical source

The [`archive`](https://github.com/letta-ai/letta/tree/archive) branch contains the retired Letta V1 API server. Existing tags and releases remain available for reproducibility, but active projects should use the [current source](https://github.com/letta-ai/letta-code).
