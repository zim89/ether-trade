import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MasterTraderResponseDto {
  @ApiProperty({
    example: '01925b42-d6c1-7cb4-966a-12e08cba9a10',
    description: 'Master profile ID',
  })
  id: string;

  @ApiProperty({
    example: '01925b42-d6c1-7cb4-966a-12e08cba9a01',
    description: 'Owner user ID',
  })
  userId: string;

  @ApiProperty({
    example: 'Alice Crypto',
    description: 'Display name',
  })
  displayName: string;

  @ApiPropertyOptional({
    example: 'Quantitative scalper and momentum trader',
    description: 'Bio',
  })
  bio?: string;

  @ApiProperty({
    example: '0.00000000',
    description: 'Cumulative PnL in USDT',
  })
  totalPnl: string;

  @ApiProperty({
    example: '0.00',
    description: 'Win rate percentage',
  })
  winRate: string;

  @ApiProperty({
    example: 12,
    description: 'Total active copiers subscribed to this master',
  })
  totalCopiers: number;

  @ApiProperty({
    example: '50.00000000',
    description: 'Minimum required deposit in USDT',
  })
  minDeposit: string;

  @ApiProperty({
    example: true,
    description: 'Whether the master profile is active',
  })
  isActive: boolean;
}

export class MasterTradersListResponseDto {
  @ApiProperty({
    type: [MasterTraderResponseDto],
    description: 'List of master traders',
  })
  items: MasterTraderResponseDto[];

  @ApiProperty({
    example: 42,
    description: 'Total number of active master traders',
  })
  total: number;
}
