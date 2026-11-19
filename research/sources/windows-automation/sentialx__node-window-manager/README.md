---
id: "github:sentialx/node-window-manager"
kind: "github"
category: "windows-automation"
repo: "sentialx/node-window-manager"
url: "https://github.com/sentialx/node-window-manager"
description: "Manage windows in Windows, macOS and Linux using Node.js"
stars: 437
forks: 69
language: "C++"
license: "MIT"
topics:
  - "cpp"
  - "library"
  - "linux"
  - "macos"
  - "native"
  - "nodejs"
  - "swift"
  - "typescript"
  - "window-manager"
  - "windows"
archived: false
pushed_at: "2024-06-01T17:38:00Z"
default_branch: "master"
fetched_at: "2026-11-08T11:26:32Z"
---

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
