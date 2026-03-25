import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CancellableLoader } from "@mariozechner/pi-tui";

import type { ProviderRegistry } from "./registry.js";
import { timeout } from "../common/utils.js";
import { Model } from "@mariozechner/pi-ai";

const INIT_TIMEOUT_MS = 2000;

export function setupSessionHandler(
    pi: ExtensionAPI,
    registry: ProviderRegistry,
    configError?: { message: string },
): void {
    async function loadSession(ctx: ExtensionContext, signal: AbortSignal) {
        try {
            const badProviders = await registry.registerAllProviders(signal);

            if (badProviders.length > 0) {
                ctx.ui.notify(
                    `pi-provider-llamacpp: Following providers could not be loaded: ${badProviders.join(", ")}`,
                    "warning",
                );
            }

            // Save cache after refresh (only writes if different)
            registry.getModelPropsCache().save();
        } catch (e) {
            // pass
        }
    }

    async function loadModel(ctx: ExtensionContext, model?: Model<any>) {
        if (!model) {
            return;
        }

        const providerNames = registry.getProviderNames();

        if (!providerNames.includes(model.provider)) {
            return;
        }

        // Ensure model is loaded (for routers)
        await registry.ensureModelLoaded(model.provider, model.id, ctx.ui.notify);

        // Refresh the provider only if model info is stale
        if (await registry.needsRefresh(model.provider, model.id)) {
            await registry.registerProvider(model.provider);
        }
    }

    pi.on("session_start", async (event, ctx) => {
        // If config failed to load, notify and exit early
        if (configError) {
            ctx.ui.notify(`pi-provider-llamacpp: ${configError.message}`, "warning");
            return;
        }

        await ctx.ui.custom<void>((tui, theme, _kb, done) => {
            const loader = new CancellableLoader(
                tui,
                (s) => theme.fg("accent", s),
                (s) => theme.fg("text", s),
                "Loading llamacpp providers...\n",
            );
            loader.start();

            const signal = timeout(INIT_TIMEOUT_MS, loader.signal);
            loadSession(ctx, signal).then(done);

            return loader;
        });
    });

    pi.on("agent_start", async (event, ctx) => {
        await loadModel(ctx, ctx.model);
    });

    pi.on("model_select", async (event, ctx) => {
        await loadModel(ctx, event.model);
    });
}
