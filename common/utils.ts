/**
 * Utility functions.
 */

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
