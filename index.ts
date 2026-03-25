import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { ProviderRegistry } from "./providers/registry";
import { ModelPropsCache } from "./providers/model-props-cache";
import { setupSessionHandler } from "./providers/llamacpp-provider";
import { registerModelManagerCommand } from "./commands/manage-models";
import { loadConfigSync } from "./providers/config";

export default function (pi: ExtensionAPI) {
    // Load config synchronously
    const { config, error } = loadConfigSync();

    const modelPropsCache = new ModelPropsCache();

    // Load cache synchronously on init
    modelPropsCache.load();

    const registry = new ProviderRegistry(pi, config, modelPropsCache);

    // Register cached providers immediately so models are available
    // before session_start fires
    registry.registerCachedProviders();

    setupSessionHandler(pi, registry, error);
    registerModelManagerCommand(pi, registry);
}
