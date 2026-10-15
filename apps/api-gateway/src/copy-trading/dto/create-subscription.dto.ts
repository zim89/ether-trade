import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateSubscriptionDto {
  @ApiProperty({
    example: '01925b42-d6c1-7cb4-966a-12e08cba9a10',
    description: 'Unique master trader identifier (UUIDv7)',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  masterId: string;

  @ApiProperty({
    example: '500.00000000',
    description: 'Virtual USDT balance allocated for this copy trading subscription',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,8})?$/, {
    message: 'allocatedBalance must be a valid positive decimal string with up to 8 decimal places',
  })
  allocatedBalance: string;

  @ApiPropertyOptional({
    example: '1.00',
    description: 'Maximum allowable slippage percentage (default: 1.00)',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      'maxSlippagePercent must be a valid decimal percentage string with up to 2 decimal places',
  })
  maxSlippagePercent?: string;
}
