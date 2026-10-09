export interface CustomerProps {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PHONE_PATTERN = /^[0-9+ ]{7,20}$/;

export class Customer {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;

  constructor(props: CustomerProps) {
    if (typeof props.id !== 'string' || props.id.trim() === '') {
      throw new RangeError('id must not be empty');
    }
    if (
      typeof props.fullName !== 'string' ||
      props.fullName.trim() === '' ||
      props.fullName.length > 120
    ) {
      throw new RangeError(
        'fullName must be a non-empty string up to 120 characters',
      );
    }
    if (typeof props.email !== 'string' || !EMAIL_PATTERN.test(props.email)) {
      throw new RangeError('email must be a valid email');
    }
    if (typeof props.phone !== 'string' || !PHONE_PATTERN.test(props.phone)) {
      throw new RangeError(
        'phone must be 7 to 20 characters of digits, plus signs or spaces',
      );
    }

    this.id = props.id;
    this.fullName = props.fullName;
    this.email = props.email;
    this.phone = props.phone;
  }
}