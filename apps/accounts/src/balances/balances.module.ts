import { Module } from '@nestjs/common';
import { BalancesController } from './balances.controller';
import { BalancesRepository } from './balances.repository';
import { BalancesService } from './balances.service';

@Module({
  controllers: [BalancesController],
  providers: [BalancesService, BalancesRepository],
  exports: [BalancesService, BalancesRepository],
})
export class BalancesModule {}
