import { Logger } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { COMMON_ERRORS, COMMON_LOGS, LOGGER_CONTEXTS } from '../constants';

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
