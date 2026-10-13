import { Module } from '@nestjs/common';
import { TransfersOutboxModule } from '../outbox/transfers-outbox.module';
import { DepositScannerService } from './blockchain/deposit-scanner.service';
import { RpcClientService } from './blockchain/rpc-client.service';
import { DepositProcessorService } from './processors/deposit-processor.service';
import { WithdrawalProcessorService } from './processors/withdrawal-processor.service';
import { TransfersController } from './transfers.controller';
import { TransfersRepository } from './transfers.repository';
import { TransfersService } from './transfers.service';

@Module({
  imports: [TransfersOutboxModule],
  controllers: [TransfersController],
  providers: [
    TransfersRepository,
    RpcClientService,
    DepositProcessorService,
    DepositScannerService,
    WithdrawalProcessorService,
    TransfersService,
  ],
  exports: [TransfersService, TransfersRepository],
})
export class TransfersSubModule {}
