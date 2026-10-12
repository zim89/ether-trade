import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DepositAddressResponseDto, WithdrawalListResponseDto, WithdrawalResponseDto } from './dto';

export const TransfersDocs = {
  controller: () => applyDecorators(ApiTags('Transfers')),

  getDepositAddress: () =>
    applyDecorators(
      ApiBearerAuth('JWT-auth'),
      ApiOperation({
        summary: 'Get on-chain deposit address and user ID bytes16',
        description:
          'Returns the DepositVault contract address and the user identity encoded as bytes16 for depositNative or depositToken contract calls.',
      }),
      ApiOkResponse({
        type: DepositAddressResponseDto,
        description: 'Deposit vault contract address and user metadata.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  requestWithdrawal: () =>
    applyDecorators(
      ApiBearerAuth('JWT-auth'),
      ApiOperation({
        summary: 'Request on-chain withdrawal',
        description:
          'Initiates an on-chain withdrawal saga. Funds are locked in accounts-service, followed by asynchronous EVM transaction dispatch.',
      }),
      ApiHeader({
        name: 'x-idempotency-key',
        required: true,
        description: 'Unique client operation key (UUIDv7 or UUIDv4) for safe retries.',
      }),
      ApiCreatedResponse({
        type: WithdrawalResponseDto,
        description: 'Withdrawal request created with PENDING status.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  getWithdrawalById: () =>
    applyDecorators(
      ApiBearerAuth('JWT-auth'),
      ApiOperation({
        summary: 'Get withdrawal request by ID',
        description:
          'Returns the current status, transaction hash, and details of a specific withdrawal request.',
      }),
      ApiParam({
        name: 'id',
        type: String,
        description: 'UUID of the withdrawal request',
      }),
      ApiOkResponse({
        type: WithdrawalResponseDto,
        description: 'Withdrawal request details.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  getWithdrawalHistory: () =>
    applyDecorators(
      ApiBearerAuth('JWT-auth'),
      ApiOperation({
        summary: 'Get withdrawal history',
        description: 'Returns paginated withdrawal requests belonging to the authenticated user.',
      }),
      ApiOkResponse({
        type: WithdrawalListResponseDto,
        description: 'List of user withdrawal requests.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),
};
