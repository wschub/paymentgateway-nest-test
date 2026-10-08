import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { validateEnv } from './env.validation';

export const AppConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: [resolve(process.cwd(), '../.env'), resolve(process.cwd(), '.env')],
  validate: validateEnv,
});
