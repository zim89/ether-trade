import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

/**
 * Account balance details for a specific user and currency.
 */
@Exclude()
export class BalanceResponseDto {
  @ApiProperty({
    example: '0191ebc2-0000-7000-8000-000000000001',
    description: 'Unique internal account identifier (UUIDv7)',
  })
  @Expose()
  accountId: string;

  @ApiProperty({
    example: '0191ebc2-0000-7000-8000-000000000002',
    description: 'User identifier (UUIDv7)',
  })
  @Expose()
  userId: string;

  @ApiProperty({
    example: 'USDT',
    description: 'Currency code',
  })
  @Expose()
  currency: string;

  @ApiProperty({
    example: '10000.00000000',
    description: 'Available balance accessible for trading and withdrawals',
  })
  @Expose()
  availableBalance: string;

  @ApiProperty({
    example: '0.00000000',
    description: 'Locked balance reserved in active orders or settlement',
  })
  @Expose()
  lockedBalance: string;

  @ApiProperty({
    example: '10000.00000000',
    description: 'Total balance (available + locked)',
  })
  @Expose()
  totalBalance: string;

  @ApiProperty({
    example: 1726588200,
    description: 'Unix timestamp in seconds when the account balance was last updated',
  })
  @Expose()
  updatedAt: number;
}
