import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DEFAULT_ENV_FILES } from '../constants';

/**
 * Preloads environment variables from a cascade of `.env` files into `process.env`.
 *
 * Files are processed sequentially without overriding existing keys (`override: false`).
 *
 * @param envFiles - Cascade list of relative or absolute file paths to load in priority order
 * @param baseDir - Root directory used to resolve relative file paths
 */
export function loadEnv(
  envFiles: readonly string[] = DEFAULT_ENV_FILES,
  baseDir: string = process.cwd(),
): void {
  for (const file of envFiles) {
    const fullPath = path.isAbsolute(file) ? file : path.resolve(baseDir, file);
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath, override: false });
    }
  }
}
