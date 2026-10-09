import type { ReferenceGenerator } from './reference-generator.port';

describe('ReferenceGenerator port', () => {
  it('generates a reference through newReference()', () => {
    const reference = 'TXN-A1B2C3D4E5F6G7H8';
    const generator: ReferenceGenerator = { newReference: () => reference };

    expect(generator.newReference()).toBe(reference);
  });
});