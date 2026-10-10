import {
  isValidCustomerEmail,
  isValidCustomerFullName,
  isValidCustomerPhone,
} from '../rules/customer.rules';
import { isNonEmptyString } from '../rules/string.rules';

export interface CustomerProps {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}

export class Customer {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;

  constructor(props: CustomerProps) {
    if (!isNonEmptyString(props.id)) {
      throw new RangeError('id must not be empty');
    }
    if (!isValidCustomerFullName(props.fullName)) {
      throw new RangeError(
        'fullName must be a non-empty string up to 120 characters',
      );
    }
    if (!isValidCustomerEmail(props.email)) {
      throw new RangeError('email must be a valid email');
    }
    if (!isValidCustomerPhone(props.phone)) {
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