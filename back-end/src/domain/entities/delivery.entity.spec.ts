import {
  Delivery,
  type DeliveryProps,
  type DeliveryStatus,
} from './delivery.entity';

describe('Delivery', () => {
  const props: DeliveryProps = {
    id: '55555555-5555-4555-8555-555555555555',
    transactionId: '22222222-2222-4222-8222-222222222222',
    status: 'PENDING',
    address: 'Calle 100 # 20-30',
    city: 'Bogotá',
    region: 'Cundinamarca',
    notes: null,
    assignedAt: null,
  };

  it('keeps every attribute of the delivery', () => {
    const delivery = new Delivery(props);

    expect(delivery.id).toBe(props.id);
    expect(delivery.transactionId).toBe(props.transactionId);
    expect(delivery.status).toBe('PENDING');
    expect(delivery.address).toBe(props.address);
    expect(delivery.city).toBe(props.city);
    expect(delivery.region).toBe(props.region);
    expect(delivery.notes).toBeNull();
    expect(delivery.assignedAt).toBeNull();
  });

  it('rejects an empty id', () => {
    expect(() => new Delivery({ ...props, id: '   ' })).toThrow(
      'id must not be empty',
    );
  });

  it('rejects an empty transaction id', () => {
    expect(() => new Delivery({ ...props, transactionId: '' })).toThrow(
      'transactionId must not be empty',
    );
  });

  it('rejects an unknown status', () => {
    expect(() =>
      new Delivery({ ...props, status: 'DELIVERED' as DeliveryStatus }),
    ).toThrow('status must be one of PENDING, ASSIGNED');
  });

  it('rejects an empty address, city or region', () => {
    expect(() => new Delivery({ ...props, address: '  ' })).toThrow(
      'address must not be empty',
    );
    expect(() => new Delivery({ ...props, city: '' })).toThrow(
      'city must not be empty',
    );
    expect(() => new Delivery({ ...props, region: '' })).toThrow(
      'region must not be empty',
    );
  });

  it('rejects notes longer than 500 characters', () => {
    expect(() => new Delivery({ ...props, notes: 'a'.repeat(501) })).toThrow(
      'notes must be a string up to 500 characters or null',
    );
  });

  it('requires assignedAt exactly when ASSIGNED', () => {
    expect(() => new Delivery({ ...props, status: 'ASSIGNED' })).toThrow(
      'assignedAt must be a Date when ASSIGNED and null when PENDING',
    );
    expect(() =>
      new Delivery({ ...props, assignedAt: new Date() }),
    ).toThrow('assignedAt must be a Date when ASSIGNED and null when PENDING');
  });

  it('assigns the delivery once while PENDING', () => {
    const at = new Date('2026-10-09T12:00:00.000Z');
    const assigned = new Delivery(props).assign(at);

    expect(assigned.status).toBe('ASSIGNED');
    expect(assigned.assignedAt).toEqual(at);
  });

  it('rejects assigning an already assigned delivery', () => {
    const assigned = new Delivery(props).assign(new Date());

    expect(() => assigned.assign(new Date())).toThrow(
      'only a PENDING delivery can be assigned',
    );
  });
});