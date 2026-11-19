---
id: "npm:node-window-manager"
kind: "npm"
category: "windows-automation"
package: "node-window-manager"
version: "2.2.4"
url: "https://www.npmjs.com/package/node-window-manager"
homepage: "https://github.com/sentialx/node-window-manager#readme"
license: "MIT"
summary: "Manage windows in macOS, Windows and Linux"
fetched_at: "2026-11-08T11:20:04Z"
---

# npm: node-window-manager@2.2.4

**Description:** Manage windows in macOS, Windows and Linux

**Homepage:** https://github.com/sentialx/node-window-manager#readme

**License:** MIT

## Dependencies

- extract-file-icon@^0.3.2
- node-addon-api@2.0.0
- node-gyp-build@^4.2.1

## Peer dependencies

- none

## README (from registry)

# node-window-manager

Manage windows in Windows, macOS and ~~Linux~~(WIP)

# Install

To install this package, just run

```bash
$ npm install node-window-manager
```

# Quick start

The following example shows how to get the currently focused window's title and hide it.

```javascript
const { windowManager } = require("node-window-manager");

const window = windowManager.getActiveWindow();

// Prints the currently focused window bounds.
console.log(window.getBounds());

// This method has to be called on macOS before changing the window's bounds, otherwise it will throw an error.
// It will prompt an accessibility permission request dialog, if needed.
windowManager.requestAccessibility();

// Sets the active window's bounds.
window.setBounds({ x: 0, y: 0 });
```

# Documentation

The documentation and API references are located in the [`docs`](docs) directory.

