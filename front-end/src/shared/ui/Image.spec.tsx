import { fireEvent, render, screen } from '@testing-library/react'
import { Image } from '@/shared/ui/Image'

describe('Image', () => {
  it('renders fixed dimensions, responsive classes, lazy loading and async decoding', () => {
    render(
      <Image
        src="/images/products/mouse.webp"
        alt="Wireless Mouse"
        width={300}
        height={200}
      />,
    )

    const img = screen.getByRole('img', {
      name: 'Wireless Mouse',
    }) as HTMLImageElement

    expect(img).toHaveAttribute('width', '300')
    expect(img).toHaveAttribute('height', '200')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img.getAttribute('fetchpriority')).toBe('auto')
    expect(img).toHaveAttribute('decoding', 'async')
    expect(img.className).toContain('w-full')
    expect(img.className).toContain('h-auto')
    expect(img).toHaveAttribute('src', '/images/products/mouse.webp')
  })

  it('loads above-the-fold images eagerly with high fetch priority', () => {
    render(
      <Image
        src="/images/products/mouse.webp"
        alt="Wireless Mouse"
        width={300}
        height={200}
        priority
      />,
    )

    const img = screen.getByRole('img', {
      name: 'Wireless Mouse',
    }) as HTMLImageElement

    expect(img).toHaveAttribute('loading', 'eager')
    expect(img.getAttribute('fetchpriority')).toBe('high')
  })

  it('swaps to the local fallback exactly once when the source fails', () => {
    render(
      <Image
        src="/images/products/missing.webp"
        alt="Broken"
        width={10}
        height={10}
      />,
    )

    const img = screen.getByRole('img') as HTMLImageElement
    fireEvent.error(img)
    expect(img).toHaveAttribute('src', '/images/fallback.svg')

    fireEvent.error(img)
    expect(img).toHaveAttribute('src', '/images/fallback.svg')
  })

  it('resets to the new source when the src prop changes', () => {
    const { rerender } = render(
      <Image src="/a.webp" alt="A" width={10} height={10} />,
    )
    const img = screen.getByRole('img') as HTMLImageElement
    fireEvent.error(img)
    expect(img).toHaveAttribute('src', '/images/fallback.svg')

    rerender(<Image src="/b.webp" alt="B" width={10} height={10} />)
    expect(img).toHaveAttribute('src', '/b.webp')
  })
})
