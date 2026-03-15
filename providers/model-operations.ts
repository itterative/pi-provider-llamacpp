import type { ModelInfo } from "../common/types";
import { errorToString } from "../common/errors";
import { sleep } from "../common/utils";

import type { ProviderRegistry } from "./registry";
import { LlamaCppApi } from "./model-api";

type NotifyFn = (msg: string, level: "info" | "error" | "warning") => void;

const MAX_UNLOAD_WAIT_MS = 30_000;
const MAX_UNLOAD_WAIT_STEP_MS = 500;

/**
 * Load a model and refresh the provider registry.
 * Returns updated model list.
 */
export async function loadAndRefresh(
    registry: ProviderRegistry,
    providerName: string,
    modelId: string,
    api: LlamaCppApi,
    notify: NotifyFn,
): Promise<ModelInfo[]> {
    notify(`Loading model "${modelId}"...`, "info");

    try {
        const loaded = await api.loadModel(modelId);
        if (loaded) {
            notify(`Model "${modelId}" loaded successfully`, "info");
            try {
                await registry.registerProvider(providerName);
            } catch (e) {
                notify(`Failed to refresh provider: ${errorToString(e)}`, "warning");
            }
        }
    } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
            notify(`Loading model "${modelId}" was aborted`, "warning");
        } else {
            const message = errorToString(e);
            notify(`Failed to load model "${modelId}": ${message}`, "error");
        }
    }

    return await registry.fetchModels(providerName);
}

/**
 * Unload a model and poll until completion.
 * Calls onUpdate during polling for UI feedback.
 * Returns updated model list.
 */
export async function unloadAndWait(
    registry: ProviderRegistry,
    providerName: string,
    modelId: string,
    api: LlamaCppApi,
    notify: NotifyFn,
    onUpdate: (models: ModelInfo[]) => void,
): Promise<ModelInfo[]> {
    notify(`Unloading model "${modelId}"...`, "info");

    try {
        const success = await api.unloadModel(modelId);
        if (!success) {
            return await registry.fetchModels(providerName);
        }
        notify(`Model "${modelId}" unloaded successfully`, "info");
    } catch (e) {
        const message = errorToString(e);
        notify(`Failed to unload model "${modelId}": ${message}`, "error");
        return await registry.fetchModels(providerName);
    }

    // Poll until model is actually unloaded
    const maxAttempts = Math.ceil(MAX_UNLOAD_WAIT_MS / MAX_UNLOAD_WAIT_STEP_MS);
    for (let i = 0; i < maxAttempts; i++) {
        await sleep(MAX_UNLOAD_WAIT_STEP_MS);

        const currentModels = await registry.fetchModels(providerName);
        const targetModel = currentModels.find((m) => m.id === modelId);

        // Update UI with current state
        onUpdate(currentModels);

        if (!targetModel) {
            // Model disappeared entirely
            break;
        }

        if (!targetModel.loaded && !targetModel.loading) {
            // Successfully unloaded
            break;
        }
    }

    // Re-register provider after unload is complete
    try {
        await registry.registerProvider(providerName);
    } catch (e) {
        notify(`Failed to refresh provider: ${errorToString(e)}`, "warning");
    }

    return await registry.fetchModels(providerName);
}
