import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CopySubscriptionResponseDto,
  CopySubscriptionsListResponseDto,
  MasterTraderResponseDto,
  MasterTradersListResponseDto,
} from './dto';

export const CopyTradingDocs = {
  controller: () => applyDecorators(ApiTags('Copy Trading'), ApiBearerAuth('JWT-auth')),

  registerMaster: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Register as a master trader',
        description: 'Creates a public master trader profile for the authenticated user.',
      }),
      ApiCreatedResponse({
        type: MasterTraderResponseDto,
        description: 'Master trader profile registered successfully.',
      }),
      ApiBadRequestResponse({
        description: 'Invalid input parameters or master profile already inactive.',
      }),
      ApiConflictResponse({
        description: 'Master profile already exists for user.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  getMasterTraders: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Get list of active master traders',
        description:
          'Retrieves public catalog of active master traders with stats, win rate, and PnL.',
      }),
      ApiOkResponse({
        type: MasterTradersListResponseDto,
        description: 'Catalog of master traders with PnL and copiers count.',
      }),
    ),

  subscribe: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Subscribe to a master trader',
        description:
          'Subscribes the authenticated user to a master trader with allocated virtual USDT balance. Idempotent via x-idempotency-key.',
      }),
      ApiCreatedResponse({
        type: CopySubscriptionResponseDto,
        description: 'Subscription created or reactivated successfully.',
      }),
      ApiBadRequestResponse({
        description:
          'Deposit below minDeposit, allocated balance exceeds available USDT, or missing idempotency key.',
      }),
      ApiNotFoundResponse({
        description: 'Master trader not found or inactive.',
      }),
      ApiConflictResponse({
        description: 'Active subscription already exists for this master.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  cancelSubscription: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Cancel active subscription to master trader',
        description: 'Cancels active subscription by subscriptionId.',
      }),
      ApiOkResponse({
        type: CopySubscriptionResponseDto,
        description: 'Subscription cancelled successfully.',
      }),
      ApiNotFoundResponse({
        description: 'Subscription not found or not owned by the authenticated user.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  getSubscriptions: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Get current user active copy trading subscriptions',
        description: 'Retrieves all subscriptions belonging to the authenticated user.',
      }),
      ApiOkResponse({
        type: CopySubscriptionsListResponseDto,
        description: 'List of user subscriptions.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),
};
