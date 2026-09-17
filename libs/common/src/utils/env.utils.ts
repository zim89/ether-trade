import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import * as dotenv from 'dotenv';
import { COMMON_ERRORS, COMMON_LOGS, DEFAULT_ENV_FILES, LOGGER_CONTEXTS } from '../constants';

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

/**
 * Validates and transforms a raw configuration object against a class-validator DTO class.
 *
 * Logs structured error messages and throws an informative Error if validation fails.
 *
 * @param cls - Class constructor with class-validator decorators
 * @param config - Raw configuration dictionary (e.g., process.env)
 * @returns Transformed and validated configuration instance
 */
export function validateEnv<T extends object>(
  cls: ClassConstructor<T>,
  config: Record<string, unknown>,
): T {
  const validated = plainToInstance(cls, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const logger = new Logger(LOGGER_CONTEXTS.envValidation);
    logger.error(COMMON_LOGS.env.validationFailedHeader(errors.length));

    for (const err of errors) {
      const constraints = Object.values(err.constraints || {}).join(', ');
      logger.error(COMMON_LOGS.env.validationErrorItem(err.property, constraints));
    }

    throw new Error(COMMON_ERRORS.env.validationFailed(errors.toString()));
  }

  return validated;
}

/**
 * Preloads environment variables from the `.env` cascade and immediately
 * validates and transforms `process.env` against the specified DTO schema class.
 *
 * Enforces fail-fast bootstrap before DI container assembly or opening network sockets.
 *
 * @param cls - Class constructor decorated with class-validator decorators (e.g. EnvironmentVariables)
 * @param envFiles - Cascade list of relative or absolute file paths to load in priority order
 * @param baseDir - Root directory used to resolve relative file paths
 * @returns Transformed and validated configuration instance
 */
export function loadAndValidateEnv<T extends object>(
  cls: ClassConstructor<T>,
  envFiles: readonly string[] = DEFAULT_ENV_FILES,
  baseDir: string = process.cwd(),
): T {
  loadEnv(envFiles, baseDir);
  return validateEnv(cls, process.env);
}
