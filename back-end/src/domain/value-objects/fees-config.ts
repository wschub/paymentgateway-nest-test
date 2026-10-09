export interface FeesConfigProps {
  baseFeeInCents: number;
  deliveryFeeInCents: number;
  currency: string;
}

export class FeesConfig {
  readonly baseFeeInCents: number;
  readonly deliveryFeeInCents: number;
  readonly currency: string;

  constructor(props: FeesConfigProps) {
    if (!Number.isInteger(props.baseFeeInCents) || props.baseFeeInCents < 0) {
      throw new RangeError('baseFeeInCents must be a non-negative integer');
    }
    if (
      !Number.isInteger(props.deliveryFeeInCents) ||
      props.deliveryFeeInCents < 0
    ) {
      throw new RangeError('deliveryFeeInCents must be a non-negative integer');
    }
    if (
      typeof props.currency !== 'string' ||
      props.currency.trim() === ''
    ) {
      throw new RangeError('currency must be a non-empty string');
    }

    this.baseFeeInCents = props.baseFeeInCents;
    this.deliveryFeeInCents = props.deliveryFeeInCents;
    this.currency = props.currency;
  }
}