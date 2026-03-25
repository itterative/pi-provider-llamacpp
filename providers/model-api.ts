import Type from "typebox";
import Schema from "typebox/schema";

import { PROPS_MODEL_SCHEMA, PROPS_ROUTER_SCHEMA, MODELS_SCHEMA } from "../common/schemas";
import type { ModelInfo, ModelProps } from "../common/types";
import { LlamaCppApiError, LlamaCppNetworkError, LlamaCppSchemaError, parseLlamaCppError } from "../common/errors";
import { sleep, timeout } from "../common/utils";

const DEFAULT_TIMEOUTS_MS = 2000;
const HEALTH_TIMEOUT_MS = 1000;
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
     * Check if the server is healthy and available.
     * Returns false on any network error or non-200 response.
     */
    async isHealthy(signal?: AbortSignal): Promise<boolean> {
        signal = signal ?? AbortSignal.timeout(HEALTH_TIMEOUT_MS);

        try {
            const response = await fetch(`${this.baseUrl}/health`, {
                headers: this.headers,
                signal: signal,
            });

            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Check if the server is a router (multi-model) instance.
     * @throws LlamaCppNetworkError on network failures
     */
    async isInRouterMode(signal?: AbortSignal): Promise<boolean> {
        try {
            const props = await this.fetch("props", {
                signal: timeout(DEFAULT_TIMEOUTS_MS, signal),
                schema: PROPS_ROUTER_SCHEMA,
            });

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
    async fetchModels(signal?: AbortSignal): Promise<ModelInfo[]> {
        try {
            const models = await this.fetch("models", { signal, schema: MODELS_SCHEMA });
            return models.data
                .filter((m) => m.status.args.includes("--model") || m.status.args.includes("-m"))
                .map((m) => ({
                    id: m.id,
                    loaded: m.status.value === "loaded",
                    loading: m.status.value === "loading",
                    unloading: false,
                    failed: m.status.value === "failed",
                    sleeping: m.status.value === "sleeping",
                }));
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
    async fetchProps(modelId?: string, signal?: AbortSignal): Promise<ModelProps> {
        const path = modelId ? `props?model=${encodeURIComponent(modelId)}&autoload=false` : "props";
        const props = await this.fetch(path, { signal, schema: PROPS_MODEL_SCHEMA });

        return {
            modelAlias: props.model_alias,
            modelPath: props.model_path,
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
        await this.fetch("models/load", { method: "POST", body: { model: modelId }, signal });
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
        await this.fetch("models/unload", { method: "POST", body: { model: modelId } });
        return true;
    }

    /**
     * Fetch raw models data with schema validation.
     * Used by registerProvider to get full model details.
     */
    async fetchModelsRaw(signal?: AbortSignal): Promise<Type.Static<typeof MODELS_SCHEMA>> {
        return this.fetch("models", { signal, schema: MODELS_SCHEMA });
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

    private async fetch<T extends Type.TSchema>(
        path: string,
        options?: {
            method?: "GET" | "POST";
            body?: unknown;
            signal?: AbortSignal;
            schema?: T;
        },
    ): Promise<Type.Static<T>> {
        const { method = "GET", body, signal, schema } = options ?? {};

        try {
            const response = await fetch(`${this.baseUrl}/${path}`, {
                method,
                headers: method === "POST" ? { ...this.headers, "Content-Type": "application/json" } : this.headers,
                body: body ? JSON.stringify(body) : undefined,
                signal,
            });

            const data = await response.json();

            const error = parseLlamaCppError(data);
            if (error) throw error;

            if (!response.ok) {
                throw new LlamaCppNetworkError(`Returned status ${response.status}`);
            }

            if (schema) {
                try {
                    return Schema.Parse(schema, data) as Type.Static<T>;
                } catch (e) {
                    throw new LlamaCppSchemaError("Schema validation failed", e);
                }
            }

            return data;
        } catch (e) {
            if (e instanceof LlamaCppApiError) throw e;
            if (e instanceof LlamaCppSchemaError) throw e;
            if (e instanceof Error && e.name === "AbortError") throw e;
            throw new LlamaCppNetworkError(`Network error: ${e instanceof Error ? e.message : String(e)}`, e);
        }
    }
}
