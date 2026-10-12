import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DepositAddressResponseDto {
  @ApiProperty({
    example: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
    description: 'Smart contract DepositVault address on-chain',
  })
  vaultAddress: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'User UUID identifier',
  })
  userId: string;

  @ApiProperty({
    example: '0x123e4567e89b12d3a456426614174000',
    description: 'Compact 16-byte hex representation for DepositVault smart contract parameter',
  })
  userIdBytes16: string;
}

export class WithdrawalResponseDto {
  @ApiProperty({
    example: 'd9b2d63d-a212-4014-b153-617a23c3d001',
    description: 'Unique withdrawal request ID',
  })
  id: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'User UUID identifier',
  })
  userId: string;

  @ApiProperty({
    example: 'ETH',
    description: 'Withdrawn currency asset (ETH, USDT)',
  })
  currency: string;

  @ApiProperty({
    example: '0.50000000',
    description: 'Withdrawn amount formatted to 8 decimal places',
  })
  amount: string;

  @ApiProperty({
    example: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    description: 'Destination on-chain EVM address',
  })
  destinationAddress: string;

  @ApiProperty({
    example: 'PENDING',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    description: 'Lifecycle status of the withdrawal request',
  })
  status: string;

  @ApiPropertyOptional({
    example: '0x3a4b...c5d6',
    description: 'On-chain transaction hash once broadcasted',
    nullable: true,
  })
  txHash?: string;

  @ApiPropertyOptional({
    example: null,
    description: 'Error explanation if status is FAILED',
    nullable: true,
  })
  errorMessage?: string;

  @ApiProperty({
    example: 1712920000,
    description: 'Unix timestamp in seconds when the request was created',
  })
  createdAt: number;

  @ApiProperty({
    example: 1712920000,
    description: 'Unix timestamp in seconds when the request was last updated',
  })
  updatedAt: number;
}

export class WithdrawalListResponseDto {
  @ApiProperty({
    type: [WithdrawalResponseDto],
    description: 'Array of withdrawal records matching criteria',
  })
  items: WithdrawalResponseDto[];

  @ApiProperty({
    example: 1,
    description: 'Total number of items available matching query',
  })
  total: number;
}
