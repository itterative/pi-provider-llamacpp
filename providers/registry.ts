import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { DEFAULT_MODEL_PROPS } from "../common/constants";
import { errorToString } from "../common/errors";
import type { LlamacppConfig, ModelData, ModelInfo, ModelProps, ValueOf } from "../common/types";

import { parseModelArgs, createBaseModel, applyModelOverrides, slugifyModel } from "./model-utils";
import { buildModelOverrides } from "./config";
import { LlamaCppApi } from "./model-api";
import { ModelPropsCache, type CachedModelProps } from "./model-props-cache";

export class ProviderRegistry {
    private apiCache: Map<string, LlamaCppApi> = new Map();
    private routerCache: Map<string, boolean> = new Map();
    private lastRefreshTimes: Map<string, number> = new Map();
    private registeredModels: Map<string, Map<string, ModelProps>> = new Map();
    private modelPropsCache: ModelPropsCache;

    constructor(
        private pi: ExtensionAPI,
        private config: LlamacppConfig,
        cache?: ModelPropsCache,
    ) {
        this.modelPropsCache = cache ?? new ModelPropsCache();
    }

    getModelPropsCache(): ModelPropsCache {
        return this.modelPropsCache;
    }

    /**
     * Register providers from cache without hitting the API.
     * Called on extension init to make models available immediately.
     * Also populates registeredModels for needsRefresh() comparisons.
     */
    registerCachedProviders(): void {
        for (const [providerName, entry] of Object.entries(this.modelPropsCache.getCache())) {
            const provider = this.config.providers[providerName];
            if (!provider) continue;

            const models: ModelData[] = [];
            const modelPropsMap = new Map<string, ModelProps>();

            for (const [modelId, props] of Object.entries(entry.models)) {
                const baseModel = createBaseModel(modelId, props.contextWindow, props.hasVision, props.hasReasoning);
                models.push(baseModel);

                // Also populate registeredModels for needsRefresh()
                modelPropsMap.set(modelId, {
                    contextWindow: props.contextWindow,
                    hasVision: props.hasVision,
                    hasReasoning: props.hasReasoning,
                });
            }

            if (models.length === 0) continue;

            const url = new URL(provider.baseUrl);
            const api = new LlamaCppApi(url.origin, provider.apiKey);

            this.pi.registerProvider(providerName, {
                baseUrl: url.origin,
                apiKey: provider.apiKey,
                api: "openai-completions",
                headers: api["headers"],
                models: models.map((m) => ({
                    id: m.id,
                    name: m.name,
                    reasoning: m.reasoning,
                    input: m.input,
                    contextWindow: m.contextWindow,
                    maxTokens: m.maxTokens,
                    cost: m.cost,
                    compat: m.compat,
                })),
            });

            // Store in registeredModels for needsRefresh() comparisons
            this.registeredModels.set(providerName, modelPropsMap);
        }
    }

    getConfig(): LlamacppConfig {
        return this.config;
    }

    getProviderNames(): string[] {
        return Object.keys(this.config.providers);
    }

    getProvider(name: string): ValueOf<LlamacppConfig["providers"]> | undefined {
        return this.config.providers[name];
    }

    getProviderConfig(name: string): { url: URL; headers: Record<string, string> } | null {
        const provider = this.config.providers[name];
        if (!provider) return null;

        const url = new URL(provider.baseUrl);
        const headers: Record<string, string> = {};
        if (provider.apiKey) {
            headers["x-api-key"] = provider.apiKey;
        }

        return { url, headers };
    }

    /**
     * Get or create an API client for a provider.
     */
    getApi(providerName: string): LlamaCppApi | null {
        const cached = this.apiCache.get(providerName);
        if (cached) return cached;

        const provider = this.config.providers[providerName];
        if (!provider) return null;

        const url = new URL(provider.baseUrl);
        const api = new LlamaCppApi(url.origin, provider.apiKey);
        this.apiCache.set(providerName, api);
        return api;
    }

    async isRouter(providerName: string): Promise<boolean> {
        const cached = this.routerCache.get(providerName);
        if (cached !== undefined) return cached;

        const api = this.getApi(providerName);
        if (!api) return false;

        try {
            const isRouter = await api.isInRouterMode();
            this.routerCache.set(providerName, isRouter);
            return isRouter;
        } catch {
            return false;
        }
    }

    async fetchModels(providerName: string): Promise<ModelInfo[]> {
        const api = this.getApi(providerName);
        if (!api) return [];

        return api.fetchModels();
    }

    /**
     * Check if a provider's model info needs to be refreshed.
     * Returns true if:
     * - Provider was never registered
     * - Model info is older than maxAge
     * - The specified model's properties differ from what's cached
     */
    async needsRefresh(providerName: string, modelId?: string, maxAgeMs: number = 30000): Promise<boolean> {
        // Never registered
        if (!this.lastRefreshTimes.has(providerName)) {
            return true;
        }

        // Check age
        const lastRefresh = this.lastRefreshTimes.get(providerName)!;
        if (Date.now() - lastRefresh > maxAgeMs) {
            return true;
        }

        // If modelId specified, check if properties differ
        if (modelId) {
            const api = this.getApi(providerName);
            if (!api) return false;

            const cached = this.registeredModels.get(providerName)?.get(modelId);
            if (!cached) return true;

            try {
                const isRouter = await this.isRouter(providerName);
                const props = await api.fetchProps(isRouter ? modelId : undefined);
                if (
                    props.contextWindow !== cached.contextWindow ||
                    props.hasVision !== cached.hasVision ||
                    props.hasReasoning !== cached.hasReasoning
                ) {
                    return true;
                }
            } catch {
                // If we can't fetch props, assume stale
                return true;
            }
        }

        return false;
    }

    /**
     * Check if a model is loaded on the server.
     * For non-router servers, always returns true (single model is always loaded).
     * For routers, checks the /models endpoint.
     */
    async isModelLoaded(providerName: string, modelId: string): Promise<boolean> {
        const isRouter = await this.isRouter(providerName);
        if (!isRouter) return true;

        const api = this.getApi(providerName);
        if (!api) return false;

        const models = await api.fetchModels();
        const model = models.find((m) => m.id === modelId);
        return model?.loaded ?? false;
    }

    /**
     * Ensure a model is loaded on the server.
     * Returns true if the model is loaded (was already or just loaded).
     */
    async ensureModelLoaded(
        providerName: string,
        modelId: string,
        notify: (msg: string, level: "info" | "error" | "warning") => void,
    ): Promise<boolean> {
        const isRouter = await this.isRouter(providerName);
        if (!isRouter) return true; // Non-router always has model loaded

        const api = this.getApi(providerName);
        if (!api) return false;

        // Check if already loaded
        const models = await api.fetchModels();
        const model = models.find((m) => m.id === modelId);

        if (model?.loaded) return true;

        // Need to load the model
        notify(`Loading model "${modelId}"...`, "info");
        try {
            const loaded = await api.loadModel(modelId);
            if (loaded) {
                notify(`Model "${modelId}" loaded successfully`, "info");
            }
            return loaded;
        } catch (e) {
            const message = errorToString(e);
            notify(`Failed to load model "${modelId}": ${message}`, "error");
            return false;
        }
    }

    async registerProvider(name: string, signal?: AbortSignal): Promise<boolean> {
        const provider = this.config.providers[name];
        if (!provider) return false;

        const api = this.getApi(name);
        if (!api) return false;

        // Check if server is healthy before proceeding
        if (!(await api.isHealthy())) {
            return false;
        }

        const url = new URL(provider.baseUrl);
        const models: ModelData[] = [];
        const modelOverrides = buildModelOverrides(provider);

        // Check if this is a router (multi-model server)
        let isRouter = false;
        try {
            isRouter = await this.isRouter(name);
        } catch {
            return false;
        }

        if (isRouter) {
            // Fetch list of models from router
            const modelsResponse = await api.fetchModelsRaw(signal);

            for (const model of modelsResponse.data) {
                // Skip entries without a model path
                if (!model.status.args.includes("--model") && !model.status.args.includes("-m")) {
                    continue;
                }

                // Fetch per-model props for context window, vision, and reasoning support
                let props: ModelProps = { ...DEFAULT_MODEL_PROPS };

                try {
                    props = await api.fetchProps(model.id);
                } catch {
                    // Model not loaded - fall back to parsing args
                    const parsed = parseModelArgs(model.status.args);
                    props.contextWindow = parsed.contextWindow;
                    props.hasVision = parsed.hasVision;
                }

                const baseModel = createBaseModel(model.id, props.contextWindow, props.hasVision, props.hasReasoning);
                models.push(applyModelOverrides(baseModel, modelOverrides[model.id]));
            }
        } else {
            // Single model server
            let props: ModelProps = { ...DEFAULT_MODEL_PROPS };
            try {
                props = await api.fetchProps();
            } catch {
                // Use defaults
            }

            // Use model_alias if available, otherwise slugify model_path
            const modelId = props.modelAlias ?? (props.modelPath ? slugifyModel(props.modelPath) : name);
            const baseModel = createBaseModel(modelId, props.contextWindow, props.hasVision, props.hasReasoning);
            models.push(applyModelOverrides(baseModel, modelOverrides[modelId]));
        }

        if (models.length === 0) {
            return false;
        }

        this.pi.registerProvider(name, {
            baseUrl: url.origin,
            apiKey: provider.apiKey,
            api: "openai-completions",
            headers: api["headers"], // Access private headers for registration
            models: models.map((m) => ({
                id: m.id,
                name: m.name,
                reasoning: m.reasoning,
                input: m.input,
                contextWindow: m.contextWindow,
                maxTokens: m.maxTokens,
                cost: m.cost,
                compat: m.compat,
            })),
        });

        // Cache model info for stale detection and persistent cache
        const modelPropsMap = new Map<string, ModelProps>();
        const cachedPropsMap = new Map<string, CachedModelProps>();

        for (const model of models) {
            const props: ModelProps = {
                contextWindow: model.contextWindow,
                hasVision: model.input.includes("image"),
                hasReasoning: model.reasoning,
            };
            modelPropsMap.set(model.id, props);
            cachedPropsMap.set(model.id, props);
        }

        // Update registeredModels (for needsRefresh comparisons)
        this.registeredModels.set(name, modelPropsMap);
        // Update persistent cache
        this.modelPropsCache.updateProviderModels(name, cachedPropsMap);
        this.lastRefreshTimes.set(name, Date.now());

        return true;
    }

    async registerAllProviders(signal?: AbortSignal): Promise<string[]> {
        const badProviders: string[] = [];

        const registerOne = async (name: string) => {
            let ok = false;
            try {
                ok = await this.registerProvider(name, signal);
            } catch {
                // pass
            }
            if (!ok) {
                badProviders.push(name);
            }
        };

        await Promise.all(Object.keys(this.config.providers).map((name) => registerOne(name)));

        return badProviders;
    }
}
