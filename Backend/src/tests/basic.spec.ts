import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';

describe('App bootstrap', () => {
  it('should compile the testing module', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
  });
});
