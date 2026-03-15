import { Compat, Cost, ModelProps } from "./types";

export const DEFAULT_CONTEXT_WINDOW = 128000;
export const DEFAULT_MAX_TOKENS = 16384;

export const DEFAULT_COST: Cost = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
};

export const DEFAULT_COMPAT: Compat = {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsUsageInStreaming: true,
    requiresAssistantAfterToolResult: false,
};

export const DEFAULT_MODEL_PROPS: ModelProps = {
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    hasVision: false,
    hasReasoning: false,
};
