import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Loader } from "@mariozechner/pi-tui";

import type { ProviderRegistry } from "./registry.js";

export function setupSessionHandler(pi: ExtensionAPI, registry: ProviderRegistry): void {
    pi.on("session_start", async (event, ctx) => {
        await ctx.ui.custom<void>((tui, theme, _kb, done) => {
            const loader = new Loader(
                tui,
                (s) => theme.fg("accent", s),
                (s) => theme.fg("text", s),
                "Loading llamacpp providers...",
            );
            loader.start();

            registry
                .loadConfig()
                .then(async (result) => {
                    if (result.error) {
                        ctx.ui.notify(`pi-provider-llamacpp: ${result.error.message}`, "warning");
                        done();
                        return;
                    }

                    const badProviders = await registry.registerAllProviders();

                    if (badProviders.length > 0) {
                        ctx.ui.notify(
                            `pi-provider-llamacpp: Following providers could not be loaded: ${badProviders.join(", ")}`,
                            "warning",
                        );
                    }
                    done();
                })
                .catch(() => done());

            return {
                render: (w) => loader.render(w),
                invalidate: () => loader.invalidate(),
                handleInput: (data) => {
                    // Escape cancels the loading
                    if (data === "\x1b") {
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
