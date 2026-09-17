import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IdentityModule } from './../src/identity.module';

describe('IdentityController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it.todo('should be implemented');
});
