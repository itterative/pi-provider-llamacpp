import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Loader, matchesKey } from "@mariozechner/pi-tui";

import type { ProviderRegistry } from "./registry.js";
import { timeout } from "../common/utils.js";

const INIT_TIMEOUT_MS = 2000;

export function setupSessionHandler(
    pi: ExtensionAPI,
    registry: ProviderRegistry,
    configError?: { message: string },
): void {
    pi.on("session_start", async (event, ctx) => {
        // If config failed to load, notify and exit early
        if (configError) {
            ctx.ui.notify(`pi-provider-llamacpp: ${configError.message}`, "warning");
            return;
        }

        await ctx.ui.custom<void>((tui, theme, _kb, done) => {
            const loader = new Loader(
                tui,
                (s) => theme.fg("accent", s),
                (s) => theme.fg("text", s),
                "Loading llamacpp providers...",
            );
            loader.start();

            const abortController = new AbortController();
            const signal = timeout(INIT_TIMEOUT_MS, abortController.signal);

            registry
                .registerAllProviders(signal)
                .then((badProviders) => {
                    if (badProviders.length > 0) {
                        ctx.ui.notify(
                            `pi-provider-llamacpp: Following providers could not be loaded: ${badProviders.join(", ")}`,
                            "warning",
                        );
                    }

                    // Save cache after refresh (only writes if different)
                    registry.getModelPropsCache().save();
                    done();
                })
                .catch(() => done());

            return {
                render: (w) => loader.render(w),
                invalidate: () => loader.invalidate(),
                handleInput: (data) => {
                    // Escape cancels the loading
                    if (matchesKey(data, "escape")) {
                        abortController.abort();
                        loader.stop();
                        done();
                    }
                },
            };
        });
    });

    pi.on("agent_start", async (event, ctx) => {
        const model = ctx.model;
        if (!model) return;

        const providerNames = registry.getProviderNames();
        if (!providerNames.includes(model.provider)) return;

        // Ensure model is loaded (for routers)
        await registry.ensureModelLoaded(model.provider, model.id, ctx.ui.notify);

        // Refresh the provider only if model info is stale
        if (await registry.needsRefresh(model.provider, model.id)) {
            await registry.registerProvider(model.provider);
        }
    });

    pi.on("model_select", async (event, ctx) => {
        const providerNames = registry.getProviderNames();
        if (!providerNames.includes(event.model.provider)) return;

        // Ensure model is loaded (for routers)
        await registry.ensureModelLoaded(event.model.provider, event.model.id, ctx.ui.notify);

        // Refresh the provider only if model info is stale
        if (await registry.needsRefresh(event.model.provider, event.model.id)) {
            await registry.registerProvider(event.model.provider);
        }
    });
}
