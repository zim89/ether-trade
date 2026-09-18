import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Request body for sandbox promote to admin endpoint.
 */
export class PromoteToAdminDto {
  @ApiPropertyOptional({
    example: '0191ebc2-0000-7000-8000-000000000002',
    description: 'Target user ID to promote (defaults to authenticated caller if omitted)',
  })
  @IsOptional()
  @IsUUID('all', { message: 'userId must be a valid UUIDv7.' })
  userId?: string;
}
