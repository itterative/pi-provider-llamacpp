import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { modelManager } from "../components/model-manager";
import type { ProviderRegistry } from "../providers/registry";
import { ModelOperations } from "../providers/model-operations";

export function registerModelManagerCommand(pi: ExtensionAPI, registry: ProviderRegistry) {
    pi.registerCommand("llamacpp", {
        description: "Manage models in llamacpp router instances",
        handler: async (_args, ctx) => {
            const providerNames = registry.getProviderNames();

            if (providerNames.length === 0) {
                ctx.ui.notify("pi-provider-llamacpp: No llamacpp providers configured", "warning");
                return;
            }

            let providerName: string;
            if (providerNames.length === 1) {
                providerName = providerNames[0]!;
            } else {
                const selected = await ctx.ui.select("Select provider", providerNames);
                if (!selected) return;
                providerName = selected;
            }

            await showModelManager(pi, registry, providerName, ctx);
        },
    });
}

async function showModelManager(
    pi: ExtensionAPI,
    registry: ProviderRegistry,
    providerName: string,
    ctx: ExtensionContext,
): Promise<void> {
    // Check if it's a router
    let isRouter = false;
    try {
        isRouter = await registry.isRouter(providerName);
    } catch {
        // Not a router or unavailable
    }

    if (!isRouter) {
        ctx.ui.notify(
            `pi-provider-llamacpp: Provider "${providerName}" is not a router (multi-model server)`,
            "warning",
        );
        return;
    }

    // Fetch models
    let models = await registry.fetchModels(providerName);

    if (models.length === 0) {
        ctx.ui.notify("pi-provider-llamacpp: No models found in router", "warning");
        return;
    }

    // Show model selection loop
    await showModelsMenu(pi, registry, providerName, models, ctx);
}

async function showModelsMenu(
    pi: ExtensionAPI,
    registry: ProviderRegistry,
    providerName: string,
    initialModels: {
        id: string;
        loaded: boolean;
        loading: boolean;
        unloading: boolean;
        failed: boolean;
        sleeping: boolean;
    }[],
    ctx: ExtensionContext,
): Promise<void> {
    const api = registry.getApi(providerName);
    if (!api) return;

    let models = initialModels;

    // Create ModelOperations instance
    const modelOps = new ModelOperations(registry, ctx);

    while (true) {
        const result = await modelManager(
            {
                providerName,
                models,
                onAction: async (action, modelId, updateModels) => {
                    if (action === "load") {
                        return await modelOps.loadAndRefresh(providerName, modelId, api);
                    } else {
                        // Mark as unloading for visual feedback
                        models = models.map((m) => (m.id === modelId ? { ...m, unloading: true, sleeping: false } : m));
                        updateModels(models);

                        return await modelOps.unloadAndWait(providerName, modelId, api, updateModels);
                    }
                },
                onSetModel: async (modelId: string) => {
                    // Find the model in the registry and set it
                    const allModels = ctx.modelRegistry.getAll();
                    const targetModel = allModels.find((m) => m.provider === providerName && m.id === modelId);
                    if (targetModel) {
                        const success = await pi.setModel(targetModel);
                        if (success) {
                            ctx.ui.notify(`Switched to model "${modelId}"`, "info");
                        }
                        return success;
                    }
                    ctx.ui.notify(`Model "${modelId}" not found in registry`, "error");
                    return false;
                },
            },
            ctx,
        );

        if (result === "done") {
            return;
        }

        // Refresh
        const refreshedModels = await registry.fetchModels(providerName);
        if (refreshedModels.length > 0) {
            models = refreshedModels;
        }
    }
}
