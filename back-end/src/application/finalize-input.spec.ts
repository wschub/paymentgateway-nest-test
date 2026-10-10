import {
  buildFinalizeInput,
  isFinalProviderStatus,
} from './finalize-input';

describe('finalize-input helpers', () => {
  it('treats only final statuses as final', () => {
    expect(isFinalProviderStatus('APPROVED')).toBe(true);
    expect(isFinalProviderStatus('DECLINED')).toBe(true);
    expect(isFinalProviderStatus('VOIDED')).toBe(true);
    expect(isFinalProviderStatus('ERROR')).toBe(true);
    expect(isFinalProviderStatus('PENDING')).toBe(false);
    expect(isFinalProviderStatus('UNKNOWN')).toBe(false);
  });

  it('trims and truncates the provider status message', () => {
    const message = `  ${'x'.repeat(250)}  `;
    const built = buildFinalizeInput('tx-1', {
      id: 'p-1',
      reference: 'R',
      status: 'APPROVED',
      statusMessage: message,
      amountInCents: 1,
      currency: 'COP',
      cardBrand: null,
      cardLastFour: null,
      installments: null,
      createdAt: null,
    });
    expect(built.failureReason).toBeUndefined();

    const declined = buildFinalizeInput('tx-1', {
      id: 'p-1',
      reference: 'R',
      status: 'DECLINED',
      statusMessage: message,
      amountInCents: 1,
      currency: 'COP',
      cardBrand: null,
      cardLastFour: null,
      installments: null,
      createdAt: null,
    });
    expect(declined.failureReason?.length).toBe(200);
  });
});