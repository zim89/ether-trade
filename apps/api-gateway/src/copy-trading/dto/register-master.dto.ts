import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterMasterDto {
  @ApiProperty({
    example: 'Alice Crypto',
    description: 'Display name of the master trader',
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  displayName: string;

  @ApiPropertyOptional({
    example: 'Quantitative scalper and momentum trader',
    description: 'Optional biography or trading strategy description',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    example: '50.00000000',
    description: 'Minimum deposit (USDT) required to copy this master (up to 8 decimal places)',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,8})?$/, {
    message: 'minDeposit must be a valid positive decimal string with up to 8 decimal places',
  })
  minDeposit?: string;
}
