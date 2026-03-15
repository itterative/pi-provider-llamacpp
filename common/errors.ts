/**
 * Error handling utilities.
 */

// Custom error classes for typed error handling
export class LlamaCppApiError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "LlamaCppApiError";
    }
}

export class LlamaCppNetworkError extends LlamaCppApiError {
    constructor(
        message: string,
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = "LlamaCppNetworkError";
    }
}

export class LlamaCppSchemaError extends LlamaCppApiError {
    constructor(
        message: string,
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = "LlamaCppSchemaError";
    }
}

export class LlamaCppResponseError extends LlamaCppApiError {
    constructor(
        public readonly code: number,
        message: string,
    ) {
        super(message);
        this.name = "LlamaCppResponseError";
    }
}

/**
 * Parse a llama.cpp error response.
 * Handles format: {"error":{"code": number, "message": string}}
 * Also handles simple string error or {"error": string} format.
 */
export function parseLlamaCppError(data: unknown): LlamaCppResponseError | null {
    if (typeof data === "object" && data !== null) {
        const obj = data as Record<string, unknown>;

        // Format: {"error":{"code": number, "message": string}}
        if (typeof obj.error === "object" && obj.error !== null) {
            const errorObj = obj.error as Record<string, unknown>;
            if (typeof errorObj.code === "number" && typeof errorObj.message === "string") {
                return new LlamaCppResponseError(errorObj.code, errorObj.message);
            }
        }

        // Format: {"error": string}
        if (typeof obj.error === "string") {
            return new LlamaCppResponseError(0, obj.error);
        }
    }

    return null;
}

export function errorToString(e: unknown): string {
    if (e instanceof LlamaCppApiError) return e.message;
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}
