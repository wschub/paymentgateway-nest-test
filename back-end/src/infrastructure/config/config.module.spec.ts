import {
  buildConfigOptions,
  resolveEnvFilePaths,
  shouldIgnoreEnvFile,
} from './config.module';

describe('AppConfigModule', () => {
  it('ignores the .env file in test so suites stay hermetic', () => {
    expect(shouldIgnoreEnvFile('test')).toBe(true);
    expect(buildConfigOptions('test').ignoreEnvFile).toBe(true);
  });

  it('loads the .env files outside of test', () => {
    expect(shouldIgnoreEnvFile('development')).toBe(false);
    expect(shouldIgnoreEnvFile('production')).toBe(false);
    expect(shouldIgnoreEnvFile(undefined)).toBe(false);

    expect(buildConfigOptions('development').ignoreEnvFile).toBe(false);
  });

  it('keeps the global flag and lists both .env candidate paths', () => {
    const paths = resolveEnvFilePaths();

    expect(buildConfigOptions('development').isGlobal).toBe(true);
    expect(paths).toHaveLength(2);
    expect(paths.every((path) => path.endsWith('.env'))).toBe(true);
  });
});
