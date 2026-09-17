import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountsModule } from './../src/accounts.module';

describe('AccountsController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AccountsModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it.todo('should be implemented');
});
