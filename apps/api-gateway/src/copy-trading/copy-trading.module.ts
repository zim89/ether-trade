import { Module } from '@nestjs/common';
import { CopyTradingController } from './copy-trading.controller';
import { CopyTradingService } from './copy-trading.service';

@Module({
  controllers: [CopyTradingController],
  providers: [CopyTradingService],
  exports: [CopyTradingService],
})
export class CopyTradingModule {}
