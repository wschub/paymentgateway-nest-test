describe('test environment setup', () => {
  it('forbids network calls by replacing fetch with a guard', () => {
    expect(() => globalThis.fetch('https://example.com')).toThrow(
      'network calls are forbidden in tests',
    );
  });

  it('runs with test-safe placeholders instead of the real .env values', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.DATABASE_URL).toBeDefined();
    expect(process.env.CORS_ORIGINS).toBeDefined();
    expect(process.env.UAT_SANDBOX_URL).toBeDefined();
  });
});
