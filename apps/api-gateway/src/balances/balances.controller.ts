import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type CurrentUserData } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { BalancesService } from './balances.service';
import { BalancesDocs } from './balances.swagger';
import { BalanceResponseDto, GetBalanceQueryDto } from './dto';

/**
 * Controller handling user balance inquiries.
 */
@BalancesDocs.controller()
@Controller('balances')
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @BalancesDocs.getBalance()
  async getBalance(
    @CurrentUser() user: CurrentUserData,
    @Query() query: GetBalanceQueryDto,
  ): Promise<BalanceResponseDto> {
    return this.balancesService.getBalance(user.userId, query);
  }
}
