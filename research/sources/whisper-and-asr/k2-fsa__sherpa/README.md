---
id: "github:k2-fsa/sherpa"
kind: "github"
category: "whisper-and-asr"
repo: "k2-fsa/sherpa"
url: "https://github.com/k2-fsa/sherpa"
description: "Speech-to-text server framework with next-gen Kaldi"
stars: 1016
forks: 155
language: "C++"
license: "Apache-2.0"
topics:
  - "asr"
  - "cpp"
  - "ctc"
  - "end-to-end-asr"
  - "python"
  - "pytorch"
  - "speech-recognition"
  - "transducer"
  - "websocket"
archived: false
pushed_at: "2026-11-08T02:43:51Z"
default_branch: "master"
fetched_at: "2026-11-08T11:20:04Z"
---

# sherpa


`sherpa` is an open-source speech-text-text inference framework using
PyTorch, focusing **exclusively** on end-to-end (E2E) models,
namely transducer- and CTC-based models. It provides both C++ and Python APIs.

This project focuses on deployment, i.e., using pre-trained models to
transcribe speech. If you are interested in how to train or fine-tune your own
models, please refer to [icefall][icefall].

We also have other **similar** projects that don't depend on PyTorch:

  - [sherpa-onnx][sherpa-onnx]
  - [sherpa-ncnn][sherpa-ncnn]

> `sherpa-onnx` and `sherpa-ncnn` also support iOS, Android and embedded systems.

## Installation and Usage

Please refer to the **documentation** at <https://k2-fsa.github.io/sherpa/>

## Try it in your browser

Try `sherpa` from within your browser without installing anything:
<https://huggingface.co/spaces/k2-fsa/automatic-speech-recognition>

[icefall]: https://github.com/k2-fsa/icefall
[sherpa-onnx]: https://github.com/k2-fsa/sherpa-onnx
[sherpa-ncnn]: https://github.com/k2-fsa/sherpa-ncnn
