import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { ProviderRegistry } from "./providers/registry";
import { setupSessionHandler } from "./providers/llamacpp-provider";
import { registerModelManagerCommand } from "./commands/manage-models";

export default function (pi: ExtensionAPI) {
    const registry = new ProviderRegistry(pi);
    setupSessionHandler(pi, registry);
    registerModelManagerCommand(pi, registry);
}
