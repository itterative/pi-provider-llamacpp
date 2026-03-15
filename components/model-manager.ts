/**
 * Model Manager Component
 *
 * A component for managing models in a llamacpp router.
 * Supports 'l' for load, 'u' for unload, with live updates during operations.
 */

import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { ModelInfo } from "../common/types";

// Re-export for backward compatibility
export type { ModelInfo } from "../common/types";

// Result from the model manager when it closes
export type ModelManagerCloseResult = "done" | "refresh";

// Options for the model manager component
export interface ModelManagerOptions {
    providerName: string;
    models: ModelInfo[];
    // Called for load/unload. Call updateModels to show progress. Return final models.
    onAction?: (
        action: "load" | "unload",
        modelId: string,
        updateModels: (models: ModelInfo[]) => void,
    ) => Promise<ModelInfo[]>;
    // Called when user presses Enter to set the active model. Return true if successful.
    onSetModel?: (modelId: string) => Promise<boolean>;
}

// Show model manager UI and return result when closed
export async function modelManager(
    options: ModelManagerOptions,
    ctx: { hasUI: boolean; ui: ExtensionContext["ui"] },
): Promise<ModelManagerCloseResult> {
    if (!ctx.hasUI) {
        return "done";
    }

    if (options.models.length === 0) {
        return "done";
    }

    return ctx.ui.custom<ModelManagerCloseResult>((tui, theme, _kb, done) => {
        // State
        let models = [...options.models];
        let cursor = models.findIndex((m) => m.loaded);
        if (cursor < 0) cursor = 0;
        let pendingAction: { action: "load" | "unload"; modelId: string } | null = null;
        let cachedLines: string[] | undefined;

        function invalidate(): void {
            cachedLines = undefined;
        }

        function render(width: number): string[] {
            if (cachedLines) return cachedLines;

            const lines: string[] = [];
            const add = (s: string) => lines.push(truncateToWidth(s, width));

            // Top border
            add(theme.fg("border", "─".repeat(width)));

            // Title
            add(theme.fg("accent", theme.bold(`  Models: ${options.providerName}`)));
            lines.push("");

            // Status summary
            const loadedCount = models.filter((m) => m.loaded).length;
            const loadingCount = models.filter((m) => m.loading || m.unloading).length;
            let statusText = `  ${loadedCount}/${models.length} models loaded`;
            if (loadingCount > 0) {
                statusText += `, ${loadingCount} loading`;
            }
            add(theme.fg("muted", statusText));
            lines.push("");

            // Model list
            for (let i = 0; i < models.length; i++) {
                const model = models[i]!;
                const isCursor = i === cursor;

                let status: string;
                let statusColor: (s: string) => string;

                if (model.unloading) {
                    status = "◐ unloading";
                    statusColor = (s) => theme.fg("warning", s);
                } else if (model.loading) {
                    status = "◐ loading";
                    statusColor = (s) => theme.fg("warning", s);
                } else if (model.failed) {
                    status = "✗ failed";
                    statusColor = (s) => theme.fg("error", s);
                } else if (model.loaded) {
                    status = "● loaded";
                    statusColor = (s) => theme.fg("success", s);
                } else {
                    status = "○ unloaded";
                    statusColor = (s) => theme.fg("dim", s);
                }

                const cursorMarker = isCursor ? theme.fg("accent", "→ ") : "  ";
                const label = isCursor ? theme.fg("accent", model.id) : theme.fg("text", model.id);
                const statusText = statusColor(status);
                add(`${cursorMarker}${label} ${statusText}`);
            }

            lines.push("");

            // Help text
            add(theme.fg("muted", "  ↑/↓: navigate • l: load • u: unload • enter: select • r: refresh • esc: done"));

            // Bottom border
            add(theme.fg("border", "─".repeat(width)));

            cachedLines = lines;
            return lines;
        }

        async function executeAction(action: "load" | "unload", modelId: string): Promise<void> {
            pendingAction = { action, modelId };

            // Mark model as loading/unloading immediately for visual feedback
            if (action === "load") {
                models = models.map((m) => (m.id === modelId ? { ...m, loading: true } : m));
            } else {
                models = models.map((m) => (m.id === modelId ? { ...m, unloading: true } : m));
            }
            invalidate();
            tui.requestRender();

            const updateModels = (newModels: ModelInfo[]) => {
                models = newModels;
                invalidate();
                tui.requestRender();
            };

            try {
                const newModels = await options.onAction!(action, modelId, updateModels);
                models = newModels;
            } finally {
                pendingAction = null;
                invalidate();
                tui.requestRender();
            }
        }

        function handleInput(key: string): void {
            // Don't process input while action is pending
            if (pendingAction) return;

            // Navigation
            if (matchesKey(key, "up") || key === "k") {
                if (cursor > 0) {
                    cursor--;
                    invalidate();
                    tui.requestRender();
                }
                return;
            }

            if (matchesKey(key, "down") || key === "j") {
                if (cursor < models.length - 1) {
                    cursor++;
                    invalidate();
                    tui.requestRender();
                }
                return;
            }

            // 'l' for load selected model
            if (key === "l") {
                const model = models[cursor];
                if (model && !model.loaded && !model.loading && !model.unloading && options.onAction) {
                    executeAction("load", model.id);
                }
                return;
            }

            // 'u' for unload selected model
            if (key === "u") {
                const model = models[cursor];
                if (model && model.loaded && !model.loading && !model.unloading && options.onAction) {
                    executeAction("unload", model.id);
                }
                return;
            }

            // Enter to set the active model (load first if needed)
            if (matchesKey(key, "enter")) {
                const model = models[cursor];
                if (model && !model.loading && !model.unloading && options.onSetModel) {
                    const onSetModel = options.onSetModel;
                    if (model.loaded) {
                        // Already loaded, just set it
                        void onSetModel(model.id);
                        done("done");
                    } else if (options.onAction) {
                        // Need to load first, then set
                        executeAction("load", model.id).then(() => {
                            const loadedModel = models.find((m) => m.id === model.id);
                            if (loadedModel?.loaded) {
                                void onSetModel(model.id);
                            }
                            done("done");
                        });
                    }
                }
                return;
            }

            // 'r' for refresh
            if (key === "r") {
                done("refresh");
                return;
            }

            // Escape or 'q' to done
            if (matchesKey(key, "escape") || key === "q") {
                done("done");
                return;
            }
        }

        return {
            render,
            invalidate,
            handleInput,
        };
    });
}
