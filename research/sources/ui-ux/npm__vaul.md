---
id: "npm:vaul"
kind: "npm"
category: "ui-ux"
package: "vaul"
version: "1.1.2"
url: "https://www.npmjs.com/package/vaul"
homepage: "https://vaul.emilkowal.ski/"
license: "MIT"
summary: "Drawer component for React."
fetched_at: "2026-11-08T12:19:23Z"
---

# npm: vaul@1.1.2

**Description:** Drawer component for React.

**Homepage:** https://vaul.emilkowal.ski/

**License:** MIT

## Dependencies

- @radix-ui/react-dialog@^1.1.1

## Peer dependencies

- react@^16.8 || ^17.0 || ^18.0 || ^19.0.0 || ^19.0.0-rc
- react-dom@^16.8 || ^17.0 || ^18.0 || ^19.0.0 || ^19.0.0-rc

## README (from registry)

https://github.com/emilkowalski/vaul/assets/36730035/fdf8c5e8-ade8-433b-8bb0-4ce10e722516

Vaul is an unstyled drawer component for React that can be used as a Dialog replacement on tablet and mobile devices. You can read about why and how it was built [here](https://emilkowal.ski/ui/building-a-drawer-component).

## Usage

To start using the library, install it in your project:,

```bash
npm install vaul
```

Use the drawer in your app.

```jsx
import { Drawer } from 'vaul';

function MyComponent() {
  return (
    <Drawer.Root>
      <Drawer.Trigger>Open</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Content>
          <Drawer.Title>Title</Drawer.Title>
        </Drawer.Content>
        <Drawer.Overlay />
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

## Documentation

Find the full API reference and examples in the [documentation](https://vaul.emilkowal.ski/getting-started).

