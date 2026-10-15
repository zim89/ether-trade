import { ApiProperty } from '@nestjs/swagger';

export class CopySubscriptionResponseDto {
  @ApiProperty({
    example: '01925b42-d6c1-7cb4-966a-12e08cba9a20',
    description: 'Subscription ID',
  })
  id: string;

  @ApiProperty({
    example: '01925b42-d6c1-7cb4-966a-12e08cba9a02',
    description: 'Follower user ID',
  })
  followerUserId: string;

  @ApiProperty({
    example: '01925b42-d6c1-7cb4-966a-12e08cba9a10',
    description: 'Master trader ID',
  })
  masterId: string;

  @ApiProperty({
    example: '500.00000000',
    description: 'Allocated balance in USDT',
  })
  allocatedBalance: string;

  @ApiProperty({
    example: '1.00',
    description: 'Maximum allowable slippage percentage',
  })
  maxSlippagePercent: string;

  @ApiProperty({
    example: 'ACTIVE',
    description: 'Subscription status (ACTIVE, PAUSED, TERMINATED)',
  })
  status: string;

  @ApiProperty({
    example: 1729000000,
    description: 'Creation timestamp (seconds)',
  })
  createdAt: number;
}

export class CopySubscriptionsListResponseDto {
  @ApiProperty({
    type: [CopySubscriptionResponseDto],
    description: 'List of copy trading subscriptions',
  })
  items: CopySubscriptionResponseDto[];
}
