import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthResponseDto, UserProfileDto } from '../auth/dto';
import { BalanceResponseDto } from '../balances/dto';

/**
 * Composite Swagger documentation decorators for Sandbox module.
 */
export const SandboxDocs = {
  controller: () => applyDecorators(ApiTags('Sandbox')),

  login: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Instant developer login (Sandbox only)',
        description:
          'Issues valid JWT access and refresh tokens without requiring cryptographic SIWE signature. Defaults to Hardhat Account #0 (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266) if omitted. Strictly disabled in production.',
      }),
      ApiOkResponse({
        type: AuthResponseDto,
        description:
          'Successfully authenticated. Access token returned in response body and refresh token set in HttpOnly cookie.',
      }),
      ApiForbiddenResponse({
        description: 'Endpoint strictly disabled in production environment.',
      }),
    ),

  faucet: () =>
    applyDecorators(
      ApiBearerAuth('JWT-auth'),
      ApiOperation({
        summary: 'Credit sandbox funds (Faucet)',
        description:
          'Credits virtual test funds (default USDT) to available balance. Only active in sandbox/development environments.',
      }),
      ApiOkResponse({
        type: BalanceResponseDto,
        description: 'Funds successfully credited to user balance.',
      }),
      ApiForbiddenResponse({
        description: 'Endpoint strictly disabled in production environment.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  promoteToAdmin: () =>
    applyDecorators(
      ApiBearerAuth('JWT-auth'),
      ApiOperation({
        summary: 'Promote user to administrator (Sandbox only)',
        description:
          'Elevates user role to admin for testing RBAC-protected features. Only active in sandbox/development environments.',
      }),
      ApiOkResponse({
        type: UserProfileDto,
        description: 'User successfully promoted to administrator.',
      }),
      ApiForbiddenResponse({
        description: 'Endpoint strictly disabled in production environment.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),
};
