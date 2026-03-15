# pi-provider-llamacpp

A [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) extension that provides better integration with local [llama.cpp](https://github.com/ggml-org/llama.cpp).

## Overview

This extension will:

- Automatically add all your llama.cpp models to your pi session
- Allow you to load and unload models through the `/llamacpp` command

## Configuration

Create `~/.pi/agent/models-llamacpp.json` with the following structure:

```json
{
    "providers": {
        "my-llamacpp": {
            "baseUrl": "http://localhost:8080/v1"
        }
    }
}
```

Refer to [models.json](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/models.md) to know what options are available.

## Compatibility

Unless the public APIs for either pi or llama.cpp changes, this should remain compatible with most version. The following were tested:

- pi - 0.55.1
- llama.cpp - b8355
