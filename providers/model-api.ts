import Type from "typebox";
import Schema from "typebox/schema";

import { PROPS_MODEL_SCHEMA, PROPS_ROUTER_SCHEMA, MODELS_SCHEMA } from "../common/schemas";
import type { ModelInfo, ModelProps } from "../common/types";
import { LlamaCppApiError, LlamaCppNetworkError, LlamaCppSchemaError, parseLlamaCppError } from "../common/errors";
import { sleep } from "../common/utils";

const MODEL_LOAD_POLL_INTERVAL_MS = 500;

/**
 * LlamaCpp API client for communicating with llama.cpp server instances.
 * Encapsulates connection details and provides methods for all API operations.
 */
export class LlamaCppApi {
    private readonly headers: Record<string, string>;

    constructor(
        private readonly baseUrl: string,
        apiKey?: string,
    ) {
        this.headers = apiKey ? { "x-api-key": apiKey } : {};
    }

    /**
     * Check if the server is a router (multi-model) instance.
     * @throws LlamaCppNetworkError on network failures
     */
    async checkIfRouter(): Promise<boolean> {
        try {
            const props = await this.fetchWithSchema("props", PROPS_ROUTER_SCHEMA, 2000);
            return props.role === "router";
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") throw e;
            return false;
        }
    }

    /**
     * Fetch list of models with their status.
     * Returns empty array on error (non-critical operation).
     */
    async fetchModels(): Promise<ModelInfo[]> {
        try {
            const response = await fetch(`${this.baseUrl}/models`, { headers: this.headers });
            if (response.ok) {
                const data = Schema.Parse(MODELS_SCHEMA, await response.json());
                return data.data
                    .filter((m) => m.status.args.includes("--model") || m.status.args.includes("-m"))
                    .map((m) => ({
                        id: m.id,
                        loaded: m.status.value === "loaded",
                        loading: m.status.value === "loading",
                        unloading: false,
                        failed: m.status.value === "failed",
                    }));
            }
        } catch {
            // Ignore errors - model list is not critical
        }
        return [];
    }

    /**
     * Fetch model properties from the server.
     * @param modelId - If provided, fetches props for a specific model (router mode). Otherwise fetches server props.
     * @throws LlamaCppNetworkError on network failures
     * @throws LlamaCppSchemaError on schema validation failures
     */
    async fetchProps(modelId?: string): Promise<ModelProps> {
        const path = modelId ? `props?model=${encodeURIComponent(modelId)}&autoload=false` : "props";
        const props = await this.fetchWithSchema(path, PROPS_MODEL_SCHEMA);
        return {
            contextWindow: props.default_generation_settings.n_ctx,
            hasVision: props.modalities.vision,
            hasReasoning: props.chat_template_caps.supports_preserve_reasoning,
        };
    }

    /**
     * Load a model on the server.
     * @returns true if the model was loaded successfully
     * @throws LlamaCppNetworkError on network failures
     * @throws LlamaCppResponseError if the server returns an error
     * @throws LlamaCppApiError if the server rejects the load request
     */
    async loadModel(modelId: string, signal?: AbortSignal): Promise<boolean> {
        const response = await fetch(`${this.baseUrl}/models/load`, {
            method: "POST",
            headers: { ...this.headers, "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelId }),
            signal,
        });

        const data = await response.json();

        // Check for llama.cpp error response format
        const error = parseLlamaCppError(data);
        if (error) {
            throw error;
        }

        if (!response.ok) {
            throw new LlamaCppApiError(`Failed to load model: ${JSON.stringify(data)}`);
        }

        return this.waitForModelLoad(modelId, signal);
    }

    /**
     * Unload a model from the server.
     * @returns true if the model was unloaded successfully
     * @throws LlamaCppNetworkError on network failures
     * @throws LlamaCppResponseError if the server returns an error
     * @throws LlamaCppApiError if the server rejects the unload request
     */
    async unloadModel(modelId: string): Promise<boolean> {
        const response = await fetch(`${this.baseUrl}/models/unload`, {
            method: "POST",
            headers: { ...this.headers, "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelId }),
        });

        const data = await response.json();

        // Check for llama.cpp error response format
        const error = parseLlamaCppError(data);
        if (error) {
            throw error;
        }

        if (!response.ok) {
            throw new LlamaCppApiError(`Failed to unload model: ${JSON.stringify(data)}`);
        }

        return true;
    }

    /**
     * Fetch raw models data with schema validation.
     * Used by registerProvider to get full model details.
     */
    async fetchModelsRaw(): Promise<Type.Static<typeof MODELS_SCHEMA>> {
        return this.fetchWithSchema("models", MODELS_SCHEMA);
    }

    private async waitForModelLoad(modelId: string, signal?: AbortSignal): Promise<boolean> {
        while (!signal?.aborted) {
            const models = await this.fetchModels();
            const model = models.find((m) => m.id === modelId);

            if (!model) {
                throw new LlamaCppApiError(`Model "${modelId}" not found in model list`);
            }

            if (model.failed) {
                throw new LlamaCppApiError(`Model "${modelId}" failed to load`);
            }

            if (model.loaded) {
                return true;
            }

            await sleep(MODEL_LOAD_POLL_INTERVAL_MS, signal);
        }

        return false;
    }

    private async fetchWithSchema<T extends Type.TSchema>(
        path: string,
        schema: T,
        timeoutMs?: number,
    ): Promise<Type.Static<T>> {
        const controller = new AbortController();
        const timeout = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

        try {
            const response = await fetch(`${this.baseUrl}/${path}`, {
                headers: this.headers,
                signal: controller.signal,
            });

            const data = await response.json();

            // Check for llama.cpp error response format
            const error = parseLlamaCppError(data);
            if (error) {
                throw error;
            }

            if (response.status !== 200) {
                throw new LlamaCppNetworkError(`Returned status ${response.status}`);
            }

            try {
                return Schema.Parse(schema, data) as Type.Static<T>;
            } catch (e) {
                throw new LlamaCppSchemaError("Schema validation failed", e);
            }
        } catch (e) {
            if (e instanceof LlamaCppApiError) throw e;
            if (e instanceof Error && e.name === "AbortError") throw e;
            throw new LlamaCppNetworkError(`Network error: ${e instanceof Error ? e.message : String(e)}`, e);
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }
}
