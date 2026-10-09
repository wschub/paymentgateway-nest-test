import { Customer, type CustomerProps } from './customer.entity';

describe('Customer', () => {
  const props: CustomerProps = {
    id: '44444444-4444-4444-8444-444444444444',
    fullName: 'Diana Alvarez',
    email: 'diana@example.com',
    phone: '+57 3001234567',
  };

  it('keeps every attribute of the customer', () => {
    const customer = new Customer(props);

    expect(customer).toEqual(props);
  });

  it('rejects an empty id', () => {
    expect(() => new Customer({ ...props, id: '   ' })).toThrow(
      'id must not be empty',
    );
  });

  it('rejects an empty full name', () => {
    expect(() => new Customer({ ...props, fullName: '' })).toThrow(
      'fullName must be a non-empty string up to 120 characters',
    );
  });

  it('rejects a full name longer than 120 characters', () => {
    expect(() => new Customer({ ...props, fullName: 'a'.repeat(121) })).toThrow(
      'fullName must be a non-empty string up to 120 characters',
    );
  });

  it('rejects an invalid email', () => {
    for (const email of ['nope', 'a@b', 'a b@c.com', 'a@b@c.com']) {
      expect(() => new Customer({ ...props, email })).toThrow(
        'email must be a valid email',
      );
    }
  });

  it('rejects a phone that is too short', () => {
    expect(() => new Customer({ ...props, phone: '300123' })).toThrow(
      'phone must be 7 to 20 characters of digits, plus signs or spaces',
    );
  });

  it('rejects a phone that is too long', () => {
    expect(() => new Customer({ ...props, phone: '1'.repeat(21) })).toThrow(
      'phone must be 7 to 20 characters of digits, plus signs or spaces',
    );
  });

  it('rejects a phone with characters other than digits, plus and spaces', () => {
    expect(() => new Customer({ ...props, phone: '300-123-4567' })).toThrow(
      'phone must be 7 to 20 characters of digits, plus signs or spaces',
    );
  });

  it('accepts a phone with plus sign, spaces and digits', () => {
    const customer = new Customer({ ...props, phone: '+57 300 123 4567' });

    expect(customer.phone).toBe('+57 300 123 4567');
  });
});