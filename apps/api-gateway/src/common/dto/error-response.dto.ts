import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard RFC-compatible HTTP error response payload for API Gateway.
 */
export class ErrorResponseDto {
  @ApiProperty({
    example: 400,
    description: 'HTTP status code',
  })
  statusCode: number;

  @ApiProperty({
    example: 'Validation failed',
    description: 'Error message or array of validation constraint failures',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiPropertyOptional({
    example: 'Bad Request',
    description: 'Short HTTP error reason phrase',
  })
  error?: string;

  @ApiProperty({
    example: '2026-09-17T14:30:00.000Z',
    description: 'ISO 8601 timestamp when the error occurred',
  })
  timestamp: string;

  @ApiProperty({
    example: '/api/v1/auth/verify',
    description: 'Request path that triggered the error',
  })
  path: string;

  @ApiPropertyOptional({
    example: 'INSUFFICIENT_BALANCE',
    description: 'Stable machine-readable error code (may be omitted until fully rolled out)',
  })
  errorCode?: string;
}
