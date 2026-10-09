import { randomInt } from 'node:crypto';
import type { ReferenceGenerator } from '../../domain/ports/reference-generator.port';
import {
  REFERENCE_PREFIX,
  REFERENCE_SUFFIX_LENGTH,
} from '../../domain/rules/transaction.rules';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export class CryptoReferenceGenerator implements ReferenceGenerator {
  newReference(): string {
    let suffix = '';
    for (let i = 0; i < REFERENCE_SUFFIX_LENGTH; i++) {
      suffix += ALPHABET[randomInt(ALPHABET.length)];
    }
    return `${REFERENCE_PREFIX}${suffix}`;
  }
}