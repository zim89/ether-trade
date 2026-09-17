import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto';
import { AuthResponseDto, GetNonceResponseDto, LogoutResponseDto, UserProfileDto } from '../dto';

export const AuthDocs = {
  controller: () => applyDecorators(ApiTags('Authentication')),

  getNonce: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Generate SIWE nonce',
        description:
          'Issues a single-use cryptographic nonce with a 5-minute TTL to sign with an Ethereum wallet.',
      }),
      ApiOkResponse({
        description: 'Nonce successfully generated',
        type: GetNonceResponseDto,
      }),
      ApiBadRequestResponse({
        description: 'Invalid or missing wallet address',
        type: ErrorResponseDto,
      }),
    ),

  verify: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Verify SIWE signature and authenticate',
        description:
          'Validates EIP-4361 signature against stored nonce, registers/authenticates user, sets HttpOnly refresh cookie, and returns access token.',
      }),
      ApiOkResponse({
        description:
          'Authentication successful. Access token returned in response body, refresh token set in HttpOnly cookie.',
        type: AuthResponseDto,
      }),
      ApiBadRequestResponse({
        description: 'Signature verification failed, nonce expired, or invalid parameters',
        type: ErrorResponseDto,
      }),
    ),

  refresh: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Rotate session tokens',
        description:
          'Exchanges a valid HttpOnly refresh cookie for a new access token and rotated refresh cookie.',
      }),
      ApiCookieAuth(),
      ApiOkResponse({
        description: 'Tokens successfully refreshed',
        type: AuthResponseDto,
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, malformed, or expired refresh token cookie',
        type: ErrorResponseDto,
      }),
    ),

  logout: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Terminate user session',
        description:
          'Revokes the active refresh token session in Identity service and clears the HttpOnly cookie.',
      }),
      ApiBearerAuth(),
      ApiCookieAuth(),
      ApiOkResponse({
        description: 'Session terminated and cookie cleared',
        type: LogoutResponseDto,
      }),
      ApiUnauthorizedResponse({
        description: 'Invalid or missing authentication credentials',
        type: ErrorResponseDto,
      }),
    ),

  me: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Get current user profile',
        description: 'Returns authenticated user identity and role from verified JWT token.',
      }),
      ApiBearerAuth(),
      ApiOkResponse({
        description: 'Current user profile retrieved successfully',
        type: UserProfileDto,
      }),
      ApiUnauthorizedResponse({
        description: 'Missing or expired bearer token',
        type: ErrorResponseDto,
      }),
    ),
};
