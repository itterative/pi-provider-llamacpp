import Type from "typebox";
import { CONFIG_SCHEMA } from "./schemas";

export type ValueOf<T> = T[keyof T];

export type LlamacppConfig = Type.Static<typeof CONFIG_SCHEMA>;

export type ModelOverride = NonNullable<ValueOf<LlamacppConfig["providers"]>["models"]>[number];

export interface Cost {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
}

export interface Compat {
    supportsStore: boolean;
    supportsDeveloperRole: boolean;
    supportsReasoningEffort: boolean;
    supportsUsageInStreaming: boolean;
    requiresAssistantAfterToolResult: boolean;
}

export interface ModelData {
    id: string;
    name: string;
    reasoning: boolean;
    input: ("text" | "image")[];
    contextWindow: number;
    maxTokens: number;
    cost: Cost;
    compat: Compat;
}

// Model info for display/management
export interface ModelInfo {
    id: string;
    loaded: boolean;
    loading: boolean;
    unloading: boolean;
    failed: boolean;
    sleeping: boolean;
}

// Model properties fetched from server
export interface ModelProps {
    modelAlias?: string;
    modelPath?: string;
    contextWindow: number;
    hasVision: boolean;
    hasReasoning: boolean;
}
