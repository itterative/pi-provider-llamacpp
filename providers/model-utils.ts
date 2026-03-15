/**
 * Model construction utilities for building and transforming model data.
 */

import { DEFAULT_COMPAT, DEFAULT_CONTEXT_WINDOW, DEFAULT_COST, DEFAULT_MAX_TOKENS } from "../common/constants";
import type { ModelData, ModelOverride } from "../common/types";

export function parseModelArgs(args: string[]): { contextWindow: number; hasVision: boolean } {
    let contextWindow = DEFAULT_CONTEXT_WINDOW;
    let hasVision = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--ctx-size" || arg === "-c" || arg === "--n-ctx") {
            const value = args[i + 1];
            if (value) {
                const parsed = parseInt(value, 10);
                if (!isNaN(parsed)) {
                    contextWindow = parsed;
                }
            }
        } else if (arg.startsWith("--ctx-size=") || arg.startsWith("-c=") || arg.startsWith("--n-ctx=")) {
            const value = arg.split("=", 2)[1];
            if (value) {
                const parsed = parseInt(value, 10);
                if (!isNaN(parsed)) {
                    contextWindow = parsed;
                }
            }
        } else if (arg === "--mmproj" || arg.startsWith("--mmproj=")) {
            hasVision = true;
        }
    }

    return { contextWindow, hasVision };
}

export function applyModelOverrides(model: ModelData, overrides: ModelOverride | undefined): ModelData {
    if (!overrides) return model;

    return {
        id: model.id,
        name: overrides.name ?? model.name,
        reasoning: overrides.reasoning ?? model.reasoning,
        input: overrides.input ?? model.input,
        contextWindow: overrides.contextWindow ?? model.contextWindow,
        maxTokens: overrides.maxTokens ?? model.maxTokens,
        cost: overrides.cost ?? model.cost,
        compat: overrides.compat ? { ...model.compat, ...overrides.compat } : model.compat,
    };
}

export function createBaseModel(
    id: string,
    contextWindow: number,
    hasVision: boolean,
    hasReasoning: boolean,
): ModelData {
    return {
        id,
        name: id,
        reasoning: hasReasoning,
        input: hasVision ? (["text", "image"] as const) : (["text"] as const),
        contextWindow,
        maxTokens: Math.min(contextWindow, DEFAULT_MAX_TOKENS),
        cost: { ...DEFAULT_COST },
        compat: { ...DEFAULT_COMPAT },
    };
}
