import { useId, useState } from 'react'
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
  TransactionView,
} from '@/features/checkout/checkout.types'
import { tokenizeCard } from '@/shared/api/payment-provider'
import { isApiError } from '@/shared/api/http'
import type { ApiError } from '@/shared/api/api.errors'

export interface CardAndDeliveryFormResult {
  transaction: TransactionView
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

  const deliveryErrors = validateDelivery(delivery)
  const cardErrors = validateCard({ ...card, installments }, config.installments.max)
  const contractsError =
    submitted && !(termsAccepted && personalDataAccepted)
      ? 'Debes aceptar ambos contratos para continuar.'
      : null

  const show = (field: string) => touched[field] || submitted

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
    if (submitting) return
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
      setFormError({
        kind: 'badRequest',
        message: 'No pudimos iniciar la compra. Cierra e inténtalo de nuevo.',
      })
      return
    }

    const expiry = parseExpiry(card.expiry)
    if (!expiry) return

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
      setSubmitting(false)
      return
    }

    const outcome = await dispatch(
      createTransaction({ idempotencyKey, productId, quantity, delivery }),
    )
      .unwrap()
      .catch((error: ApiError) => error)

    if (isApiError(outcome)) {
      setFormError(outcome)
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
    setSubmitting(false)
  }

  const errorText = (field: string, message?: string) =>
    message && show(field) ? (
      <p id={`${fieldId}-${field}-error`} className="text-sm font-medium text-red-700">
        {message}
      </p>
    ) : null

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
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
          />
        </label>
        {errorText('fullName', deliveryErrors.fullName)}

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
          />
        </label>
        {errorText('email', deliveryErrors.email)}

        <label htmlFor={`${fieldId}-phone`} className="flex flex-col gap-1 text-sm text-gray-700">
          Teléfono
          <input
            id={`${fieldId}-phone`}
            className={inputClass}
            value={delivery.phone}
            onChange={(e) => updateDelivery({ phone: e.target.value })}
            onBlur={() => markTouched('phone')}
            autoComplete="tel"
          />
        </label>
        {errorText('phone', deliveryErrors.phone)}

        <label htmlFor={`${fieldId}-address`} className="flex flex-col gap-1 text-sm text-gray-700">
          Dirección
          <input
            id={`${fieldId}-address`}
            className={inputClass}
            value={delivery.address}
            onChange={(e) => updateDelivery({ address: e.target.value })}
            onBlur={() => markTouched('address')}
            autoComplete="street-address"
          />
        </label>
        {errorText('address', deliveryErrors.address)}

        <label htmlFor={`${fieldId}-city`} className="flex flex-col gap-1 text-sm text-gray-700">
          Ciudad
          <input
            id={`${fieldId}-city`}
            className={inputClass}
            value={delivery.city}
            onChange={(e) => updateDelivery({ city: e.target.value })}
            onBlur={() => markTouched('city')}
            autoComplete="address-level2"
          />
        </label>
        {errorText('city', deliveryErrors.city)}

        <label htmlFor={`${fieldId}-region`} className="flex flex-col gap-1 text-sm text-gray-700">
          Departamento
          <input
            id={`${fieldId}-region`}
            className={inputClass}
            value={delivery.region}
            onChange={(e) => updateDelivery({ region: e.target.value })}
            onBlur={() => markTouched('region')}
            autoComplete="address-level1"
          />
        </label>
        {errorText('region', deliveryErrors.region)}

        <label htmlFor={`${fieldId}-notes`} className="flex flex-col gap-1 text-sm text-gray-700">
          Notas (opcional)
          <input
            id={`${fieldId}-notes`}
            className={inputClass}
            value={delivery.notes ?? ''}
            onChange={(e) => updateDelivery({ notes: e.target.value })}
            onBlur={() => markTouched('notes')}
          />
        </label>
        {errorText('notes', deliveryErrors.notes)}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
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
          />
        </label>
        {errorText('number', cardErrors.number)}

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
          />
        </label>
        {errorText('expiry', cardErrors.expiry)}

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
          />
        </label>
        {errorText('cvc', cardErrors.cvc)}

        <label htmlFor={`${fieldId}-cardholder`} className="flex flex-col gap-1 text-sm text-gray-700">
          Nombre del titular
          <input
            id={`${fieldId}-cardholder`}
            className={inputClass}
            value={card.cardholder}
            onChange={(e) => updateCard({ cardholder: e.target.value })}
            onBlur={() => markTouched('cardholder')}
            autoComplete="cc-name"
          />
        </label>
        {errorText('cardholder', cardErrors.cardholder)}

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
        {errorText('installments', cardErrors.installments)}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
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
          <p role="alert" className="text-sm font-medium text-red-700">
            {contractsError}
          </p>
        ) : null}
      </fieldset>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {formError.message}
        </p>
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
