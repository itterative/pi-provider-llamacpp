import Type from "typebox";

export const CONFIG_SCHEMA = Type.Object({
    providers: Type.Record(
        Type.String(),
        Type.Object({
            baseUrl: Type.String(),
            apiKey: Type.Optional(Type.String()),
            models: Type.Optional(
                Type.Array(
                    Type.Object({
                        id: Type.String(),
                        name: Type.Optional(Type.String()),
                        reasoning: Type.Optional(Type.Boolean()),
                        input: Type.Optional(Type.Array(Type.Union([Type.Literal("text"), Type.Literal("image")]))),
                        contextWindow: Type.Optional(Type.Integer()),
                        maxTokens: Type.Optional(Type.Integer()),
                        cost: Type.Optional(
                            Type.Object({
                                input: Type.Number(),
                                output: Type.Number(),
                                cacheRead: Type.Number(),
                                cacheWrite: Type.Number(),
                            }),
                        ),
                        compat: Type.Optional(
                            Type.Object({
                                supportsStore: Type.Optional(Type.Boolean()),
                                supportsDeveloperRole: Type.Optional(Type.Boolean()),
                                supportsReasoningEffort: Type.Optional(Type.Boolean()),
                                reasoningEffortMap: Type.Optional(
                                    Type.Object({
                                        minimal: Type.Optional(Type.String()),
                                        low: Type.Optional(Type.String()),
                                        medium: Type.Optional(Type.String()),
                                        high: Type.Optional(Type.String()),
                                        xhigh: Type.Optional(Type.String()),
                                    }),
                                ),
                                supportsUsageInStreaming: Type.Optional(Type.Boolean()),
                                maxTokensField: Type.Optional(
                                    Type.Union([Type.Literal("max_completion_tokens"), Type.Literal("max_tokens")]),
                                ),
                                requiresToolResultName: Type.Optional(Type.Boolean()),
                                requiresAssistantAfterToolResult: Type.Optional(Type.Boolean()),
                                requiresThinkingAsText: Type.Optional(Type.Boolean()),
                                thinkingFormat: Type.Optional(
                                    Type.Union([
                                        Type.Literal("openai"),
                                        Type.Literal("zai"),
                                        Type.Literal("qwen"),
                                        Type.Literal("qwen-chat-template"),
                                    ]),
                                ),
                                supportsStrictMode: Type.Optional(Type.Boolean()),
                            }),
                        ),
                    }),
                ),
            ),
        }),
    ),
});

export const PROPS_ROUTER_SCHEMA = Type.Object({
    role: Type.Optional(Type.Enum(["router"])),
});

export const PROPS_MODEL_SCHEMA = Type.Object({
    model_alias: Type.Optional(Type.String()),
    model_path: Type.Optional(Type.String()),
    default_generation_settings: Type.Object({
        n_ctx: Type.Integer(),
    }),
    modalities: Type.Object({
        vision: Type.Boolean(),
    }),
    chat_template_caps: Type.Object({
        supports_parallel_tool_calls: Type.Boolean(),
        supports_preserve_reasoning: Type.Boolean(),
        suports_string_content: Type.Boolean(),
        suports_system_role: Type.Boolean(),
        suports_tool_calls: Type.Boolean(),
        suports_tools: Type.Boolean(),
        suports_typed_content: Type.Boolean(),
    }),
});

export const MODELS_SCHEMA = Type.Object({
    data: Type.Array(
        Type.Object({
            id: Type.String(),
            status: Type.Object({
                value: Type.Enum(["loaded", "unloaded", "loading", "failed", "sleeping"]),
                args: Type.Array(Type.String()),
            }),
        }),
    ),
});

export const LOAD_REQUEST_SCHEMA = Type.Object({
    model: Type.String(),
    load_params: Type.Optional(
        Type.Object({
            n_ctx: Type.Optional(Type.Integer()),
            n_gpu_layers: Type.Optional(Type.Integer()),
        }),
    ),
});

export const UNLOAD_REQUEST_SCHEMA = Type.Object({
    model: Type.String(),
});
