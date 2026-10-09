export type DeliveryStatus = 'PENDING' | 'ASSIGNED';

export interface DeliveryProps {
  id: string;
  transactionId: string;
  status: DeliveryStatus;
  address: string;
  city: string;
  region: string;
  notes: string | null;
  assignedAt: Date | null;
}

const DELIVERY_STATUSES: readonly DeliveryStatus[] = ['PENDING', 'ASSIGNED'];

export class Delivery {
  readonly id: string;
  readonly transactionId: string;
  readonly status: DeliveryStatus;
  readonly address: string;
  readonly city: string;
  readonly region: string;
  readonly notes: string | null;
  readonly assignedAt: Date | null;

  constructor(props: DeliveryProps) {
    if (typeof props.id !== 'string' || props.id.trim() === '') {
      throw new RangeError('id must not be empty');
    }
    if (
      typeof props.transactionId !== 'string' ||
      props.transactionId.trim() === ''
    ) {
      throw new RangeError('transactionId must not be empty');
    }
    if (!DELIVERY_STATUSES.includes(props.status)) {
      throw new RangeError('status must be one of PENDING, ASSIGNED');
    }
    if (typeof props.address !== 'string' || props.address.trim() === '') {
      throw new RangeError('address must not be empty');
    }
    if (typeof props.city !== 'string' || props.city.trim() === '') {
      throw new RangeError('city must not be empty');
    }
    if (typeof props.region !== 'string' || props.region.trim() === '') {
      throw new RangeError('region must not be empty');
    }
    if (props.notes !== null && (typeof props.notes !== 'string' || props.notes.length > 500)) {
      throw new RangeError('notes must be a string up to 500 characters or null');
    }
    if (props.assignedAt !== null && !(props.assignedAt instanceof Date)) {
      throw new RangeError('assignedAt must be a Date or null');
    }
    if ((props.status === 'ASSIGNED') !== (props.assignedAt !== null)) {
      throw new RangeError(
        'assignedAt must be a Date when ASSIGNED and null when PENDING',
      );
    }

    this.id = props.id;
    this.transactionId = props.transactionId;
    this.status = props.status;
    this.address = props.address;
    this.city = props.city;
    this.region = props.region;
    this.notes = props.notes;
    this.assignedAt = props.assignedAt;
  }

  assign(at: Date): Delivery {
    if (this.status !== 'PENDING') {
      throw new RangeError('only a PENDING delivery can be assigned');
    }
    if (!(at instanceof Date)) {
      throw new RangeError('at must be a Date');
    }
    return new Delivery({ ...this.toProps(), status: 'ASSIGNED', assignedAt: at });
  }

  private toProps(): DeliveryProps {
    return {
      id: this.id,
      transactionId: this.transactionId,
      status: this.status,
      address: this.address,
      city: this.city,
      region: this.region,
      notes: this.notes,
      assignedAt: this.assignedAt,
    };
  }
}