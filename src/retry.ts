import { log } from './logger.js';

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts: number; delayMs: number; label: string },
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 1; i <= options.attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < options.attempts) {
        log.warn(`${options.label} - attempt ${i}/${options.attempts} failed: ${lastError.message}`);
        log.info(`Retrying in ${options.delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, options.delayMs));
      }
    }
  }

  throw new Error(`${options.label} - all ${options.attempts} attempts failed. Last error: ${lastError?.message}`);
}
