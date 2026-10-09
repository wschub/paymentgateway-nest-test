import { randomInt } from 'node:crypto';
import type { ReferenceGenerator } from '../../domain/ports/reference-generator.port';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const PREFIX = 'TXN-';
const SUFFIX_LENGTH = 16;

export class CryptoReferenceGenerator implements ReferenceGenerator {
  newReference(): string {
    let suffix = '';
    for (let i = 0; i < SUFFIX_LENGTH; i++) {
      suffix += ALPHABET[randomInt(ALPHABET.length)];
    }
    return `${PREFIX}${suffix}`;
  }
}