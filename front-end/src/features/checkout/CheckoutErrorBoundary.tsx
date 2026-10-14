import { Component, type ReactNode } from 'react'

export interface CheckoutErrorBoundaryProps {
  children: ReactNode
  /** Called by the recovery action; the modal uses it to return to the product. */
  onBackToProduct: () => void
  /** Changing this value clears a previous failure (e.g. when the modal reopens). */
  resetKey?: string | number | boolean
}

interface CheckoutErrorBoundaryState {
  failed: boolean
}

/**
 * Keeps a render error inside one checkout step from blanking the whole app.
 * It only logs a fixed, non-sensitive message: props and state may carry a
 * card token, so nothing from the failed tree is ever logged.
 */
export class CheckoutErrorBoundary extends Component<
  CheckoutErrorBoundaryProps,
  CheckoutErrorBoundaryState
> {
  state: CheckoutErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): CheckoutErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(): void {
    console.error('No se pudo mostrar el paso del pago.')
  }

  componentDidUpdate(prevProps: CheckoutErrorBoundaryProps): void {
    if (
      this.state.failed &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ failed: false })
    }
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }

    return (
      <div role="alert" className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-gray-900">
          Algo salió mal al mostrar este paso.
        </h3>
        <p className="text-sm text-gray-700">
          Vuelve al producto y empieza de nuevo. No se realizó ningún cobro
          nuevo.
        </p>
        <button
          type="button"
          onClick={this.props.onBackToProduct}
          className="w-fit rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
        >
          Volver al producto
        </button>
      </div>
    )
  }
}
