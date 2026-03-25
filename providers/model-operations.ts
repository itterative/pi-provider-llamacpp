import type { ModelInfo } from "../common/types";
import { errorToString } from "../common/errors";
import { sleep } from "../common/utils";

import type { ProviderRegistry } from "./registry";
import { LlamaCppApi } from "./model-api";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

const MAX_UNLOAD_WAIT_MS = 30_000;
const MAX_UNLOAD_WAIT_STEP_MS = 500;

/**
 * ModelOperations handles model loading and unloading operations.
 * Takes the provider registry in the constructor and uses ExtensionContext for notifications.
 */
export class ModelOperations {
    constructor(
        private readonly registry: ProviderRegistry,
        private readonly ctx: ExtensionContext,
    ) {}

    /**
     * Load a model and refresh the provider registry.
     * Returns updated model list.
     */
    async loadAndRefresh(
        providerName: string,
        modelId: string,
        api: LlamaCppApi,
    ): Promise<ModelInfo[]> {
        this.ctx.ui.notify(`Loading model "${modelId}"...`, "info");

        try {
            const loaded = await api.loadModel(modelId);
            if (loaded) {
                this.ctx.ui.notify(`Model "${modelId}" loaded successfully`, "info");
                try {
                    await this.registry.registerProvider(providerName);
                } catch (e) {
                    this.ctx.ui.notify(`Failed to refresh provider: ${errorToString(e)}`, "warning");
                }
            }
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") {
                this.ctx.ui.notify(`Loading model "${modelId}" was aborted`, "warning");
            } else {
                const message = errorToString(e);
                this.ctx.ui.notify(`Failed to load model "${modelId}": ${message}`, "error");
            }
        }

        return await this.registry.fetchModels(providerName);
    }

    /**
     * Unload a model and poll until completion.
     * Calls onUpdate during polling for UI feedback.
     * Returns updated model list.
     */
    async unloadAndWait(
        providerName: string,
        modelId: string,
        api: LlamaCppApi,
        onUpdate: (models: ModelInfo[]) => void,
    ): Promise<ModelInfo[]> {
        this.ctx.ui.notify(`Unloading model "${modelId}"...`, "info");

        try {
            const success = await api.unloadModel(modelId);
            if (!success) {
                return await this.registry.fetchModels(providerName);
            }
            this.ctx.ui.notify(`Model "${modelId}" unloaded successfully`, "info");
        } catch (e) {
            const message = errorToString(e);
            this.ctx.ui.notify(`Failed to unload model "${modelId}": ${message}`, "error");
            return await this.registry.fetchModels(providerName);
        }

        // Poll until model is actually unloaded
        const maxAttempts = Math.ceil(MAX_UNLOAD_WAIT_MS / MAX_UNLOAD_WAIT_STEP_MS);
        for (let i = 0; i < maxAttempts; i++) {
            await sleep(MAX_UNLOAD_WAIT_STEP_MS);

            const currentModels = await this.registry.fetchModels(providerName);
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
            await this.registry.registerProvider(providerName);
        } catch (e) {
            this.ctx.ui.notify(`Failed to refresh provider: ${errorToString(e)}`, "warning");
        }

        return await this.registry.fetchModels(providerName);
    }
}
