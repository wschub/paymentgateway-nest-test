import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRODUCTS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Wireless Mouse', description: 'Ergonomic wireless mouse', priceInCents: 35000, stock: 15, imageUrl: '/images/products/wireless-mouse.webp' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Mechanical Keyboard', description: 'RGB mechanical keyboard', priceInCents: 180000, stock: 8, imageUrl: '/images/products/mechanical-keyboard.webp' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'USB-C Hub', description: '7-in-1 USB-C hub', priceInCents: 95000, stock: 12, imageUrl: '/images/products/usb-c-hub.webp' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Laptop Stand', description: 'Aluminum laptop stand', priceInCents: 65000, stock: 20, imageUrl: '/images/products/laptop-stand.webp' },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Wireless Headphones', description: 'Noise-cancelling over-ear', priceInCents: 250000, stock: 6, imageUrl: '/images/products/wireless-headphones.webp' },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Phone Case', description: 'Protective TPU case', priceInCents: 25000, stock: 50, imageUrl: '/images/products/phone-case.webp' },
  { id: '77777777-7777-4777-8777-777777777777', name: 'Cable Organizer', description: 'Cable management set', priceInCents: 15000, stock: 40, imageUrl: '/images/products/cable-organizer.webp' },
  { id: '88888888-8888-4888-8888-888888888888', name: 'Webcam', description: '1080p HD webcam', priceInCents: 120000, stock: 10, imageUrl: '/images/products/webcam.webp' },
  { id: '99999999-9999-4999-8999-999999999999', name: 'External SSD', description: '1TB portable SSD', priceInCents: 350000, stock: 7, imageUrl: '/images/products/external-ssd.webp' },
];

async function main() {
  for (const product of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
  }
  console.log('Seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
