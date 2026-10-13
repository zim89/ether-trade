import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxRepository } from './outbox.repository';

@Injectable()
export class OutboxRetentionService {
  private readonly logger = new Logger(OutboxRetentionService.name);
  private readonly retentionHours = 48;
  private readonly batchSize = 1000;

  constructor(private readonly outboxRepository: OutboxRepository) {}

  /**
   * Periodically deletes PUBLISHED events older than retention period (48 hours)
   * in batches to avoid PostgreSQL table bloat and high query latencies.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanPublishedEvents(): Promise<number> {
    const cutoffDate = new Date(Date.now() - this.retentionHours * 60 * 60 * 1000);
    let totalDeleted = 0;

    try {
      let deleted = 0;
      do {
        deleted = await this.outboxRepository.deletePublishedEventsOlderThan(
          cutoffDate,
          this.batchSize,
        );
        totalDeleted += deleted;
      } while (deleted === this.batchSize);

      if (totalDeleted > 0) {
        this.logger.log(
          `Outbox retention cleanup removed ${totalDeleted} published events older than ${this.retentionHours}h`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `Failed to run outbox retention cleanup: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    return totalDeleted;
  }
}
