---
id: "npm:edge-tts"
kind: "npm"
category: "tts-and-voice"
package: "edge-tts"
version: "1.0.1"
url: "https://www.npmjs.com/package/edge-tts"
license: "CC BY-NC-SA 4.0"
summary: "Use Microsoft Edge's online text-to-speech service from JavaScript WITHOUT needing Microsoft Edge or Windows or an API key"
fetched_at: "2026-11-08T11:20:04Z"
---

# npm: edge-tts@1.0.1

**Description:** Use Microsoft Edge's online text-to-speech service from JavaScript WITHOUT needing Microsoft Edge or Windows or an API key

**Homepage:** 

**License:** CC BY-NC-SA 4.0

## Dependencies

- ws@^8.16.0

## Peer dependencies

- typescript@^5.0.0

## README (from registry)

# edge-tts
`edge-tts` is a allows you to use Microsoft Edge's online text-to-speech service from within your TypeScript code.

Based on [edge-tts](https://github.com/rany2/edge-tts/) for python.

## Usage
```js
import { tts, ttsSave } from 'edge-tts'

// buffer of mp3 data
const audioBuffer = await tts('hello world')

// or if you just want a file
await ttsSave('hello world', './tts.mp3')

// customize voice
await tts('hello world', {
  voice: 'es-VE-PaolaNeural', // can be any Voice.Name, Voice.ShortName, or Voice.FriendlyName
  volume: '+50%', // 50% louder
  rate: '-50%', // 50% the speed
  pitch: '-50Hz' // 50Hz lower
})
```

Find voices to use for the `voice` param using `getVoices`
```js
import { getVoices, tts } from 'edge-tts'

// get list of available voices
const voices = await getVoices()

// get voices done by native english speakers
const englishVoices = voices.filter(v => v.Locale === 'en-US')

// select a random english voice
const voice = englishVoices[Math.floor(Math.random() * englishVoices.length)]

// can also use voice.ShortName, or voice.FriendlyName
const audioBuffer = await tts('hello world', { voice: voice.Name })
```

