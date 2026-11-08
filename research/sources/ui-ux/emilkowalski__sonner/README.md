---
id: "github:emilkowalski/sonner"
kind: "github"
category: "ui-ux"
repo: "emilkowalski/sonner"
url: "https://github.com/emilkowalski/sonner"
description: "An opinionated toast component for React."
stars: 13159
forks: 469
language: "TypeScript"
license: "MIT"
topics:
  - "notifications"
  - "react"
  - "toast"
archived: false
pushed_at: "2026-08-10T11:13:03Z"
default_branch: "main"
fetched_at: "2026-11-08T11:20:04Z"
---

https://github.com/vallezw/sonner/assets/50796600/59b95cb7-9068-4f3e-8469-0b35d9de5cf0

[Sonner](https://sonner.emilkowal.ski/) is an opinionated toast component for React. You can read more about why and how it was built [here](https://emilkowal.ski/ui/building-a-toast-component).

## Usage

To start using the library, install it in your project:

```bash
npm install sonner
```

Alternatively you can use the `/ask-sonner` skill to do it for you and help you with any other Sonner-related questions.

```bash
npx skills add https://github.com/emilkowalski/skills --skill ask-sonner
```

Add `<Toaster />` to your app, it will be the place where all your toasts will be rendered.
After that you can use `toast()` from anywhere in your app.

```jsx
import { Toaster, toast } from 'sonner';

// ...

function App() {
  return (
    <div>
      <Toaster />
      <button onClick={() => toast('My first toast')}>Give me a toast</button>
    </div>
  );
}
```

## Documentation

Find the full API reference in the [documentation](https://sonner.emilkowal.ski/getting-started).
