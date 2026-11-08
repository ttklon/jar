---
id: "npm:sonner"
kind: "npm"
category: "ui-ux"
package: "sonner"
version: "2.0.8"
url: "https://www.npmjs.com/package/sonner"
homepage: "https://sonner.emilkowal.ski/"
license: "MIT"
summary: "An opinionated toast component for React."
fetched_at: "2026-11-08T11:20:04Z"
---

# npm: sonner@2.0.8

**Description:** An opinionated toast component for React.

**Homepage:** https://sonner.emilkowal.ski/

**License:** MIT

## Dependencies

- none

## Peer dependencies

- @types/react@^18.0.0 || ^19.0.0
- react@^18.0.0 || ^19.0.0 || ^19.0.0-rc
- react-dom@^18.0.0 || ^19.0.0 || ^19.0.0-rc

## README (from registry)

https://github.com/vallezw/sonner/assets/50796600/59b95cb7-9068-4f3e-8469-0b35d9de5cf0

[Sonner](https://sonner.emilkowal.ski/) is an opinionated toast component for React. You can read more about why and how it was built [here](https://emilkowal.ski/ui/building-a-toast-component).

## Usage

To start using the library, install it in your project:

```bash
npm install sonner
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

