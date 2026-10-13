import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProcessedEventsRepository } from './processed-events.repository';

@Injectable()
export class ProcessedEventsRetentionService {
  private readonly logger = new Logger(ProcessedEventsRetentionService.name);
  private readonly retentionDays = 30;
  private readonly batchSize = 1000;

  constructor(private readonly processedEventsRepository: ProcessedEventsRepository) {}

  /**
   * Periodically deletes processed_events older than retention threshold (30 days)
   * in batches to prevent unbounded table growth.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanProcessedEvents(): Promise<number> {
    const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    let totalDeleted = 0;

    try {
      let deleted = 0;
      do {
        deleted = await this.processedEventsRepository.deleteOlderThan(cutoffDate, this.batchSize);
        totalDeleted += deleted;
      } while (deleted === this.batchSize);

      if (totalDeleted > 0) {
        this.logger.log(
          `ProcessedEvents retention cleanup removed ${totalDeleted} records older than ${this.retentionDays}d`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `Failed to run processed_events retention cleanup: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    return totalDeleted;
  }
}
