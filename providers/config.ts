import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import Schema, { ParseError } from "typebox/schema";

import { CONFIG_SCHEMA } from "../common/schemas";
import { errorToString } from "../common/errors";
import type { LlamacppConfig, ModelOverride, ValueOf } from "../common/types";

export const CONFIG_PATH = path.join(os.homedir(), ".pi/agent/models-llamacpp.json");

export interface LoadConfigResult {
    config: LlamacppConfig;
    error?: { message: string };
}

export async function loadConfig(): Promise<LoadConfigResult> {
    const emptyConfig: LlamacppConfig = { providers: {} };

    let data: unknown;
    try {
        data = JSON.parse(await fs.readFile(CONFIG_PATH, { encoding: "utf8" }));
    } catch (e) {
        return {
            config: emptyConfig,
            error: { message: `Could not load config: ${errorToString(e)}` },
        };
    }

    try {
        const config = Schema.Parse(CONFIG_SCHEMA, data);
        return { config };
    } catch (e) {
        if (e instanceof ParseError) {
            const errors = e.errors.map((e) => `  ${e.schemaPath}: ${e.message}`).join("\n");
            return {
                config: emptyConfig,
                error: { message: `Config is invalid\n${errors}` },
            };
        }

        return {
            config: emptyConfig,
            error: { message: "Config is invalid" },
        };
    }
}

export function buildModelOverrides(provider: ValueOf<LlamacppConfig["providers"]>): Record<string, ModelOverride> {
    const overrides: Record<string, ModelOverride> = {};
    for (const model of provider.models ?? []) {
        overrides[model.id] = model;
    }
    return overrides;
}
