/**
 * Utility functions.
 */

/**
 * Deep equality check for JSON-serializable values.
 * Compares objects, arrays, and primitives recursively.
 */
export function deepEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;
    if (typeof a !== "object") return false;

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, i) => deepEquals(item, b[i]));
    }

    const keysA = Object.keys(aObj);
    const keysB = Object.keys(bObj);
    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) => deepEquals(aObj[key], bObj[key]));
}

/**
 * Creates an AbortSignal that aborts when either the timeout expires or the provided signal aborts.
 * @param millis - The timeout duration in milliseconds.
 * @param signal - Optional AbortSignal to chain abort events from.
 * @returns An AbortSignal that will abort on timeout or when the provided signal aborts.
 */
export function timeout(millis: number, signal?: AbortSignal): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(millis);
    return signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
}

/**
 * Sleep for a specified duration, optionally abortable via an AbortSignal.
 * @param sleepMs - The number of milliseconds to sleep.
 * @param signal - Optional AbortSignal to cancel the sleep.
 * @throws DOMException with name "AbortError" if the signal is aborted.
 */
export function sleep(sleepMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }

        const timeoutId = setTimeout(resolve, sleepMs);

        signal?.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            reject(signal.reason);
        });
    });
}
