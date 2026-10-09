import { ConfigModule, type ConfigModuleOptions } from '@nestjs/config';
import { resolve } from 'node:path';
import { validateEnv } from './env.validation';

export const resolveEnvFilePaths = (): string[] => [
  resolve(process.cwd(), '../.env'),
  resolve(process.cwd(), '.env'),
];

export const shouldIgnoreEnvFile = (nodeEnv: string | undefined): boolean =>
  nodeEnv === 'test';

const buildConfigOptions = (
  nodeEnv: string | undefined = process.env.NODE_ENV,
): ConfigModuleOptions => ({
  isGlobal: true,
  // Tests are hermetic: they use the placeholders from `test/setup-env.ts`
  // instead of the real `.env`, which holds real values.
  ignoreEnvFile: shouldIgnoreEnvFile(nodeEnv),
  envFilePath: resolveEnvFilePaths(),
  validate: validateEnv,
});

export { buildConfigOptions };

export const AppConfigModule = ConfigModule.forRoot(buildConfigOptions());
