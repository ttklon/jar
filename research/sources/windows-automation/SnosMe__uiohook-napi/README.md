---
id: "github:SnosMe/uiohook-napi"
kind: "github"
category: "windows-automation"
repo: "SnosMe/uiohook-napi"
url: "https://github.com/SnosMe/uiohook-napi"
stars: 244
forks: 67
language: "C"
license: "MIT"
topics:
  - "cross-platform"
  - "global-hooks"
  - "keyboard-events"
  - "mouse-events"
  - "n-api"
  - "nodejs"
archived: false
pushed_at: "2026-03-21T18:18:41Z"
default_branch: "master"
fetched_at: "2026-11-08T11:20:04Z"
---

# uiohook-napi

[![](https://img.shields.io/npm/v/uiohook-napi/latest?color=CC3534&label=uiohook-napi&logo=npm&labelColor=212121)](https://www.npmjs.com/package/uiohook-napi)

N-API C-bindings for [libuiohook](https://github.com/kwhat/libuiohook).


### Usage example

```typescript
import { uIOhook, UiohookKey } from 'uiohook-napi'

uIOhook.on('keydown', (e) => {
  if (e.keycode === UiohookKey.Q) {
    console.log('Hello!')
  }

  if (e.keycode === UiohookKey.Escape) {
    process.exit(0)
  }
})

uIOhook.start()
```

### API

```typescript
interface UiohookNapi {
  on(event: 'input', listener: (e: UiohookKeyboardEvent | UiohookMouseEvent | UiohookWheelEvent) => void): this

  on(event: 'keydown', listener: (e: UiohookKeyboardEvent) => void): this
  on(event: 'keyup', listener: (e: UiohookKeyboardEvent) => void): this

  on(event: 'mousedown', listener: (e: UiohookMouseEvent) => void): this
  on(event: 'mouseup', listener: (e: UiohookMouseEvent) => void): this
  on(event: 'mousemove', listener: (e: UiohookMouseEvent) => void): this
  on(event: 'click', listener: (e: UiohookMouseEvent) => void): this

  on(event: 'wheel', listener: (e: UiohookWheelEvent) => void): this

  keyTap(key: keycode, modifiers?: keycode[])
  keyToggle(key: keycode, toggle: 'down' | 'up')
}

export interface UiohookKeyboardEvent {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  keycode: number
}

export interface UiohookMouseEvent {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  x: number
  y: number
  button: unknown
  clicks: number
}

export interface UiohookWheelEvent {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  x: number
  y: number
  clicks: number
  amount: number
  direction: WheelDirection
  rotation: number
}
```
