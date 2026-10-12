import { Currency } from '@app/common/constants';
import { DbTestContext } from '../../../test/helpers';
import { BalancesRepository } from '../src/balances/balances.repository';
import * as schema from '../src/database/schema';

describe('BalancesRepository (Integration)', () => {
  let context: DbTestContext<typeof schema>;
  let repository: BalancesRepository;

  const testUserId = '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b';

  beforeAll(async () => {
    // 1. Ensure isolated accounts_test_db exists and migrations are executed
    await DbTestContext.ensureDatabaseExists('accounts_test_db');
    context = new DbTestContext(
      {
        dbName: 'accounts_test_db',
        migrationsFolder: 'apps/accounts/src/database/migrations',
      },
      schema,
    );
    await context.runMigrations();

    repository = new BalancesRepository(context.db);
  });

  afterAll(async () => {
    // 2. Guaranteed close of connection pool to prevent open handle leaks
    if (context) {
      await context.close();
    }
  });

  beforeEach(async () => {
    // 3. Clean slate before each test case
    await context.truncateTables(['ledger_transactions', 'accounts']);
  });

  describe('findOrCreate and Deposit', () => {
    it('should create zero-balance account on first access', async () => {
      const account = await repository.findOrCreate(testUserId, Currency.USDT);

      expect(account).toBeDefined();
      expect(account.userId).toBe(testUserId);
      expect(account.currency).toBe(Currency.USDT);
      expect(Number(account.availableBalance)).toBe(0);
      expect(Number(account.lockedBalance)).toBe(0);
    });

    it('should deposit funds and maintain balance invariant (available + locked = total)', async () => {
      await repository.findOrCreate(testUserId, Currency.USDT);

      const result = await repository.deposit({
        userId: testUserId,
        currency: Currency.USDT,
        amount: '100.50000000',
        idempotencyKey: 'idemp-dep-1',
      });

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.account.availableBalance).toBe('100.50000000');
        expect(result.account.lockedBalance).toBe('0.00000000');
      }

      // Replay should return identical state with status idempotent_replay
      const replay = await repository.deposit({
        userId: testUserId,
        currency: Currency.USDT,
        amount: '100.50000000',
        idempotencyKey: 'idemp-dep-1',
      });
      expect(replay.status).toBe('idempotent_replay');
      if (replay.status === 'idempotent_replay') {
        expect(replay.account.availableBalance).toBe('100.50000000');
      }
    });
  });

  describe('Lock and Unlock balance with pessimistic lock', () => {
    beforeEach(async () => {
      await repository.findOrCreate(testUserId, Currency.USDT);
      await repository.deposit({
        userId: testUserId,
        currency: Currency.USDT,
        amount: '100.00000000',
        idempotencyKey: 'init-dep',
      });
    });

    it('should atomically transfer funds from available to locked preserving available + locked == 100', async () => {
      const lockRes = await repository.lock({
        userId: testUserId,
        currency: Currency.USDT,
        amount: '40.00000000',
        idempotencyKey: 'lock-1',
      });

      expect(lockRes.status).toBe('ok');
      if (lockRes.status === 'ok') {
        expect(lockRes.account.availableBalance).toBe('60.00000000');
        expect(lockRes.account.lockedBalance).toBe('40.00000000');

        const available = Number(lockRes.account.availableBalance);
        const locked = Number(lockRes.account.lockedBalance);
        expect(available + locked).toBe(100);
      }
    });

    it('should reject lock when available balance is insufficient without modifying balances', async () => {
      const lockRes = await repository.lock({
        userId: testUserId,
        currency: Currency.USDT,
        amount: '150.00000000',
        idempotencyKey: 'lock-fail',
      });

      expect(lockRes.status).toBe('insufficient_available');

      const account = await repository.findByUserAndCurrency(testUserId, Currency.USDT);
      expect(account?.availableBalance).toBe('100.00000000');
      expect(account?.lockedBalance).toBe('0.00000000');
    });

    it('should unlock locked balance back to available balance', async () => {
      await repository.lock({
        userId: testUserId,
        currency: Currency.USDT,
        amount: '50.00000000',
        idempotencyKey: 'lock-part',
      });

      const unlockRes = await repository.unlock({
        userId: testUserId,
        currency: Currency.USDT,
        amount: '20.00000000',
        idempotencyKey: 'unlock-1',
      });

      expect(unlockRes.status).toBe('ok');
      if (unlockRes.status === 'ok') {
        expect(unlockRes.account.availableBalance).toBe('70.00000000');
        expect(unlockRes.account.lockedBalance).toBe('30.00000000');
      }
    });
  });

  describe('CreditDepositFunds and DebitWithdrawalFunds (On-Chain Double-Entry)', () => {
    it('should credit confirmed on-chain deposit', async () => {
      const creditRes = await repository.creditDeposit({
        userId: testUserId,
        currency: Currency.ETH,
        amount: '2.50000000',
        idempotencyKey: 'onchain-dep-1',
        referenceId: '0xtxhash123',
      });

      expect(creditRes.status).toBe('ok');
      if (creditRes.status === 'ok') {
        expect(creditRes.account.currency).toBe(Currency.ETH);
        expect(creditRes.account.availableBalance).toBe('2.50000000');
        expect(creditRes.account.lockedBalance).toBe('0.00000000');
      }
    });

    it('should debit locked withdrawal and deduct from total assets', async () => {
      // 1. Credit 10 ETH
      await repository.creditDeposit({
        userId: testUserId,
        currency: Currency.ETH,
        amount: '10.00000000',
        idempotencyKey: 'dep-10',
      });

      // 2. Lock 4 ETH for withdrawal request
      await repository.lock({
        userId: testUserId,
        currency: Currency.ETH,
        amount: '4.00000000',
        idempotencyKey: 'lock-withdraw-4',
      });

      // 3. Debit confirmed withdrawal
      const debitRes = await repository.debitWithdrawal({
        userId: testUserId,
        currency: Currency.ETH,
        amount: '4.00000000',
        idempotencyKey: 'debit-withdraw-4',
        referenceId: '0xwithdrawtx',
      });

      expect(debitRes.status).toBe('ok');
      if (debitRes.status === 'ok') {
        expect(debitRes.account.availableBalance).toBe('6.00000000');
        expect(debitRes.account.lockedBalance).toBe('0.00000000');
      }
    });
  });
});
