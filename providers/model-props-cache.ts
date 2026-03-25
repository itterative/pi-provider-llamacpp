import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { LlamacppConfig } from "../common/types";
import { deepEquals } from "../common/utils";

interface CachedModelProps {
    contextWindow: number;
    hasVision: boolean;
    hasReasoning: boolean;
}

export type { CachedModelProps };

interface ProviderCacheEntry {
    lastUpdated: number;
    models: {
        [modelId: string]: CachedModelProps;
    };
}

type ModelPropsCacheData = {
    [providerName: string]: ProviderCacheEntry;
};

// Cache directory is at extension root (one level up from providers/)
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(THIS_DIR, "..", ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "models-props.json");

export class ModelPropsCache {
    private cache: ModelPropsCacheData = {};

    load(): void {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                const data = fs.readFileSync(CACHE_FILE, "utf-8");
                this.cache = JSON.parse(data);
            }
        } catch (e) {
            console.warn("Failed to load model props cache:", e);
            this.cache = {};
        }
    }

    save(): void {
        try {
            // Read existing cache to compare
            let existing: ModelPropsCacheData = {};
            if (fs.existsSync(CACHE_FILE)) {
                const data = fs.readFileSync(CACHE_FILE, "utf-8");
                existing = JSON.parse(data);
            }

            // Only write if cache differs from what's on disk
            // Compare without lastUpdated since that's always different
            const cacheWithoutTimestamp = this.stripTimestamps(this.cache);
            const existingWithoutTimestamp = this.stripTimestamps(existing);
            if (deepEquals(cacheWithoutTimestamp, existingWithoutTimestamp)) {
                return;
            }

            if (!fs.existsSync(CACHE_DIR)) {
                fs.mkdirSync(CACHE_DIR, { recursive: true });
            }
            fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2));
        } catch (e) {
            console.warn("Failed to save model props cache:", e);
        }
    }

    private stripTimestamps(cache: ModelPropsCacheData): Record<string, { models: Record<string, CachedModelProps> }> {
        const result: Record<string, { models: Record<string, CachedModelProps> }> = {};
        for (const [providerName, entry] of Object.entries(cache)) {
            result[providerName] = { models: entry.models };
        }
        return result;
    }

    getCache(): ModelPropsCacheData {
        return this.cache;
    }

    getModelProps(providerName: string, modelId: string): CachedModelProps | undefined {
        return this.cache[providerName]?.models[modelId];
    }

    updateProviderModels(providerName: string, models: Map<string, CachedModelProps>): void {
        const entry: ProviderCacheEntry = {
            lastUpdated: Date.now(),
            models: {},
        };

        for (const [modelId, props] of models.entries()) {
            entry.models[modelId] = { ...props };
        }

        this.cache[providerName] = entry;
    }

    /**
     * Remove cache entries for providers no longer in config.
     * Returns list of removed provider names.
     */
    reconcile(config: LlamacppConfig): string[] {
        const configProviders = new Set(Object.keys(config.providers));
        const removed: string[] = [];

        for (const providerName of Object.keys(this.cache)) {
            if (!configProviders.has(providerName)) {
                delete this.cache[providerName];
                removed.push(providerName);
            }
        }

        return removed;
    }
}
