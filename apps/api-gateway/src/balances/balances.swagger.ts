import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { BalanceResponseDto } from './dto';

/**
 * Composite Swagger documentation decorators for Balances module.
 */
export const BalancesDocs = {
  controller: () => applyDecorators(ApiTags('Balances'), ApiBearerAuth('JWT-auth')),

  getBalance: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Get user balance',
        description:
          'Retrieves available, locked, and total balance for the authenticated user in the requested currency.',
      }),
      ApiOkResponse({
        type: BalanceResponseDto,
        description: 'Account balance successfully retrieved.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),
};
