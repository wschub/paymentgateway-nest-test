import { useId, useRef, useState } from 'react'
import { useAppDispatch } from '@/app/hooks'
import { createTransaction } from '@/features/checkout/checkout.thunks'
import {
  cardDisplaySet,
  contractsAcceptanceChanged,
  deliveryChanged,
  installmentsChanged,
  type DeliveryData,
} from '@/features/checkout/checkout.slice'
import { validateDelivery } from '@/features/checkout/delivery.validation'
import { parseExpiry, validateCard } from '@/features/checkout/card.validation'
import type {
  CheckoutConfig,
  TransactionCreated,
} from '@/features/checkout/checkout.types'
import { describePaymentError } from '@/features/checkout/payment-errors'
import { tokenizeCard } from '@/shared/api/payment-provider'
import { isApiError } from '@/shared/api/http'
import { createApiError, type ApiError } from '@/shared/api/api.errors'
import { LiveRegion } from '@/shared/ui/LiveRegion'

export interface CardAndDeliveryFormResult {
  transaction: TransactionCreated
  cardToken: string
  brand: string
  lastFour: string
  installments: number
}

export interface CardAndDeliveryFormProps {
  config: CheckoutConfig
  idempotencyKey: string | null
  productId: string
  quantity: number
  onCreated: (result: CardAndDeliveryFormResult) => void
  /** An error handed back by the modal (e.g. an `invalidToken` at Pagar). */
  error?: ApiError | null
}

const EMPTY_DELIVERY: DeliveryData = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  region: '',
  notes: '',
}

const EMPTY_CARD = { number: '', expiry: '', cvc: '', cardholder: '' }

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-base text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500'

export function CardAndDeliveryForm({
  config,
  idempotencyKey,
  productId,
  quantity,
  onCreated,
  error = null,
}: CardAndDeliveryFormProps) {
  const dispatch = useAppDispatch()
  const fieldId = useId()

  const [delivery, setDelivery] = useState<DeliveryData>(EMPTY_DELIVERY)
  const [card, setCard] = useState(EMPTY_CARD)
  const [installments, setInstallments] = useState(config.installments.default)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [personalDataAccepted, setPersonalDataAccepted] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<ApiError | null>(null)
  const submittingRef = useRef(false)

  const deliveryErrors = validateDelivery(delivery)
  const cardErrors = validateCard({ ...card, installments }, config.installments.max)
  const contractsError =
    submitted && !(termsAccepted && personalDataAccepted)
      ? 'Debes aceptar ambos contratos para continuar.'
      : null

  const show = (field: string) => touched[field] || submitted

  const fieldError = (field: string, message?: string) => {
    const visible = Boolean(message && show(field))
    return {
      message: visible ? (message as string) : undefined,
      attributes: {
        'aria-invalid': visible || undefined,
        'aria-describedby': visible ? `${fieldId}-${field}-error` : undefined,
      },
    }
  }

  const firstFieldError = (
    [
      ['fullName', deliveryErrors.fullName],
      ['email', deliveryErrors.email],
      ['phone', deliveryErrors.phone],
      ['address', deliveryErrors.address],
      ['city', deliveryErrors.city],
      ['region', deliveryErrors.region],
      ['notes', deliveryErrors.notes],
      ['number', cardErrors.number],
      ['expiry', cardErrors.expiry],
      ['cvc', cardErrors.cvc],
      ['cardholder', cardErrors.cardholder],
      ['installments', cardErrors.installments],
    ] as Array<[string, string | undefined]>
  ).find(([field, message]) => Boolean(message && show(field)))?.[1]

  const handedBack = describePaymentError(error)
  const formErrorGuidance = describePaymentError(formError)
  const announcement =
    formErrorGuidance?.message ??
    contractsError ??
    (firstFieldError ? 'Revisa los campos marcados para continuar.' : null) ??
    handedBack?.message ??
    ''

  const updateDelivery = (patch: Partial<DeliveryData>) => {
    const next = { ...delivery, ...patch }
    setDelivery(next)
    dispatch(deliveryChanged(next))
  }

  const updateCard = (patch: Partial<typeof EMPTY_CARD>) => {
    setCard((current) => ({ ...current, ...patch }))
  }

  const markTouched = (field: string) =>
    setTouched((current) => ({ ...current, [field]: true }))

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submittingRef.current) return
    setSubmitted(true)
    setFormError(null)

    if (
      Object.keys(deliveryErrors).length > 0 ||
      Object.keys(cardErrors).length > 0 ||
      !(termsAccepted && personalDataAccepted)
    ) {
      return
    }
    if (!idempotencyKey) {
      setFormError(createApiError('badRequest'))
      return
    }

    const expiry = parseExpiry(card.expiry)
    if (!expiry) return

    submittingRef.current = true
    setSubmitting(true)
    const token = await tokenizeCard({
      baseUrl: config.baseUrl,
      publicKey: config.publicKey,
      card: {
        number: card.number,
        cvc: card.cvc,
        expMonth: expiry.month,
        expYear: expiry.year,
        cardholder: card.cardholder,
      },
    })
    if (isApiError(token)) {
      setFormError(token)
      submittingRef.current = false
      setSubmitting(false)
      return
    }

    const outcome = await dispatch(
      createTransaction({ idempotencyKey, productId, quantity, delivery }),
    )
      .unwrap()
      .catch((created: ApiError) => created)

    if (isApiError(outcome)) {
      setFormError(outcome)
      submittingRef.current = false
      setSubmitting(false)
      return
    }

    dispatch(cardDisplaySet({ brand: token.brand, lastFour: token.lastFour }))
    dispatch(installmentsChanged(installments))
    onCreated({
      transaction: outcome,
      cardToken: token.token,
      brand: token.brand,
      lastFour: token.lastFour,
      installments,
    })
    submittingRef.current = false
    setSubmitting(false)
  }

  const fullName = fieldError('fullName', deliveryErrors.fullName)
  const email = fieldError('email', deliveryErrors.email)
  const phone = fieldError('phone', deliveryErrors.phone)
  const address = fieldError('address', deliveryErrors.address)
  const city = fieldError('city', deliveryErrors.city)
  const region = fieldError('region', deliveryErrors.region)
  const notes = fieldError('notes', deliveryErrors.notes)
  const cardNumber = fieldError('number', cardErrors.number)
  const cardExpiry = fieldError('expiry', cardErrors.expiry)
  const cardCvc = fieldError('cvc', cardErrors.cvc)
  const cardholder = fieldError('cardholder', cardErrors.cardholder)
  const installmentsField = fieldError('installments', cardErrors.installments)

  const errorText = (field: string, message?: string) =>
    message ? (
      <p id={`${fieldId}-${field}-error`} className="text-sm font-medium text-red-700">
        {message}
      </p>
    ) : null

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <LiveRegion politeness="assertive" message={announcement} />

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="text-base font-semibold text-gray-900">Entrega</legend>

        <label htmlFor={`${fieldId}-fullName`} className="flex flex-col gap-1 text-sm text-gray-700">
          Nombre completo
          <input
            id={`${fieldId}-fullName`}
            className={inputClass}
            value={delivery.fullName}
            onChange={(e) => updateDelivery({ fullName: e.target.value })}
            onBlur={() => markTouched('fullName')}
            autoComplete="name"
            {...fullName.attributes}
          />
        </label>
        {errorText('fullName', fullName.message)}

        <label htmlFor={`${fieldId}-email`} className="flex flex-col gap-1 text-sm text-gray-700">
          Correo electrónico
          <input
            id={`${fieldId}-email`}
            type="email"
            className={inputClass}
            value={delivery.email}
            onChange={(e) => updateDelivery({ email: e.target.value })}
            onBlur={() => markTouched('email')}
            autoComplete="email"
            {...email.attributes}
          />
        </label>
        {errorText('email', email.message)}

        <label htmlFor={`${fieldId}-phone`} className="flex flex-col gap-1 text-sm text-gray-700">
          Teléfono
          <input
            id={`${fieldId}-phone`}
            className={inputClass}
            value={delivery.phone}
            onChange={(e) => updateDelivery({ phone: e.target.value })}
            onBlur={() => markTouched('phone')}
            autoComplete="tel"
            {...phone.attributes}
          />
        </label>
        {errorText('phone', phone.message)}

        <label htmlFor={`${fieldId}-address`} className="flex flex-col gap-1 text-sm text-gray-700">
          Dirección
          <input
            id={`${fieldId}-address`}
            className={inputClass}
            value={delivery.address}
            onChange={(e) => updateDelivery({ address: e.target.value })}
            onBlur={() => markTouched('address')}
            autoComplete="street-address"
            {...address.attributes}
          />
        </label>
        {errorText('address', address.message)}

        <label htmlFor={`${fieldId}-city`} className="flex flex-col gap-1 text-sm text-gray-700">
          Ciudad
          <input
            id={`${fieldId}-city`}
            className={inputClass}
            value={delivery.city}
            onChange={(e) => updateDelivery({ city: e.target.value })}
            onBlur={() => markTouched('city')}
            autoComplete="address-level2"
            {...city.attributes}
          />
        </label>
        {errorText('city', city.message)}

        <label htmlFor={`${fieldId}-region`} className="flex flex-col gap-1 text-sm text-gray-700">
          Departamento
          <input
            id={`${fieldId}-region`}
            className={inputClass}
            value={delivery.region}
            onChange={(e) => updateDelivery({ region: e.target.value })}
            onBlur={() => markTouched('region')}
            autoComplete="address-level1"
            {...region.attributes}
          />
        </label>
        {errorText('region', region.message)}

        <label htmlFor={`${fieldId}-notes`} className="flex flex-col gap-1 text-sm text-gray-700">
          Notas (opcional)
          <input
            id={`${fieldId}-notes`}
            className={inputClass}
            value={delivery.notes ?? ''}
            onChange={(e) => updateDelivery({ notes: e.target.value })}
            onBlur={() => markTouched('notes')}
            {...notes.attributes}
          />
        </label>
        {errorText('notes', notes.message)}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="text-base font-semibold text-gray-900">Tarjeta</legend>

        <label htmlFor={`${fieldId}-number`} className="flex flex-col gap-1 text-sm text-gray-700">
          Número de tarjeta
          <input
            id={`${fieldId}-number`}
            className={inputClass}
            inputMode="numeric"
            value={card.number}
            onChange={(e) => updateCard({ number: e.target.value })}
            onBlur={() => markTouched('number')}
            autoComplete="cc-number"
            {...cardNumber.attributes}
          />
        </label>
        {errorText('number', cardNumber.message)}

        <label htmlFor={`${fieldId}-expiry`} className="flex flex-col gap-1 text-sm text-gray-700">
          Vencimiento (MM/AA)
          <input
            id={`${fieldId}-expiry`}
            className={inputClass}
            placeholder="MM/AA"
            value={card.expiry}
            onChange={(e) => updateCard({ expiry: e.target.value })}
            onBlur={() => markTouched('expiry')}
            autoComplete="cc-exp"
            {...cardExpiry.attributes}
          />
        </label>
        {errorText('expiry', cardExpiry.message)}

        <label htmlFor={`${fieldId}-cvc`} className="flex flex-col gap-1 text-sm text-gray-700">
          CVC
          <input
            id={`${fieldId}-cvc`}
            className={inputClass}
            inputMode="numeric"
            value={card.cvc}
            onChange={(e) => updateCard({ cvc: e.target.value })}
            onBlur={() => markTouched('cvc')}
            autoComplete="cc-csc"
            {...cardCvc.attributes}
          />
        </label>
        {errorText('cvc', cardCvc.message)}

        <label htmlFor={`${fieldId}-cardholder`} className="flex flex-col gap-1 text-sm text-gray-700">
          Nombre del titular
          <input
            id={`${fieldId}-cardholder`}
            className={inputClass}
            value={card.cardholder}
            onChange={(e) => updateCard({ cardholder: e.target.value })}
            onBlur={() => markTouched('cardholder')}
            autoComplete="cc-name"
            {...cardholder.attributes}
          />
        </label>
        {errorText('cardholder', cardholder.message)}

        <label htmlFor={`${fieldId}-installments`} className="flex flex-col gap-1 text-sm text-gray-700">
          Cuotas
          <select
            id={`${fieldId}-installments`}
            className={inputClass}
            value={installments}
            onChange={(e) => {
              const value = Number(e.target.value)
              setInstallments(value)
              dispatch(installmentsChanged(value))
            }}
            {...installmentsField.attributes}
          >
            {Array.from({ length: config.installments.max }, (_, index) => index + 1).map(
              (option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ),
            )}
          </select>
        </label>
        {errorText('installments', installmentsField.message)}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-base font-semibold text-gray-900">Contratos</legend>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => {
              setTermsAccepted(e.target.checked)
              dispatch(
                contractsAcceptanceChanged(e.target.checked && personalDataAccepted),
              )
            }}
          />
          <span>
            Acepto los{' '}
            <a
              href={config.contracts.terms}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              términos y condiciones
            </a>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={personalDataAccepted}
            onChange={(e) => {
              setPersonalDataAccepted(e.target.checked)
              dispatch(
                contractsAcceptanceChanged(termsAccepted && e.target.checked),
              )
            }}
          />
          <span>
            Autorizo el{' '}
            <a
              href={config.contracts.personalData}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              tratamiento de mis datos personales
            </a>
          </span>
        </label>

        {contractsError ? (
          <p className="text-sm font-medium text-red-700">{contractsError}</p>
        ) : null}
      </fieldset>

      {formErrorGuidance ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-red-700">
            {formErrorGuidance.message}
          </p>
          {formErrorGuidance.action !== 'retry' ? (
            <p className="text-sm text-gray-700">{formErrorGuidance.actionLabel}</p>
          ) : null}
        </div>
      ) : !formError && handedBack ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-red-700">{handedBack.message}</p>
          <p className="text-sm text-gray-700">{handedBack.actionLabel}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="w-fit rounded-md bg-gray-800 px-5 py-2 font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Validando…' : 'Continuar'}
      </button>
    </form>
  )
}
