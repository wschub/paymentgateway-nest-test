import { CryptoReferenceGenerator } from './crypto-reference-generator';

const REFERENCE_PATTERN = /^TXN-[A-Z0-9]{16}$/;

describe('CryptoReferenceGenerator', () => {
  it('generates references with the TXN- prefix and 16 uppercase letters or digits', () => {
    const generator = new CryptoReferenceGenerator();

    for (let i = 0; i < 2000; i++) {
      expect(generator.newReference()).toMatch(REFERENCE_PATTERN);
    }
  });

  it('never produces two consecutive identical references', () => {
    const generator = new CryptoReferenceGenerator();

    for (let i = 0; i < 100; i++) {
      const first = generator.newReference();
      const second = generator.newReference();

      expect(first).toMatch(REFERENCE_PATTERN);
      expect(second).toMatch(REFERENCE_PATTERN);
      expect(second).not.toBe(first);
    }
  });
});