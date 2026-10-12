# Feature Specification: Front-end Store Pages

**Feature Branch**: `003-front-end-store`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "Front-end store pages for the checkout (React single page app, mobile first). Goal: a shopper can browse the tech-accessory catalog, open a product, choose a quantity and start the purchase; the app remembers the purchase progress across a page refresh. The front-end folder only contains the framework starter template, so everything is built from scratch. Scope: product gallery (home) with image, name, price in Colombian pesos and units available, out-of-stock marked and unselectable, loading/empty/error states with retry; product detail with image, name, description, price, stock and a quantity selector between 1 and the smaller of available stock and ten units, plus a button that starts the purchase and shows a clear next-step placeholder; checkout progress in a central store (current step, selected product and quantity, delivery data, transaction id) persisted only for non-sensitive values so a refresh restores progress, never card data; the catalog is always read from the back-end API; mobile-first from 375x667 up to desktop with no horizontal overflow, fast images with fixed dimensions, lazy loading below the fold, image fallback; basic accessibility (keyboard navigation, visible focus, labels, alt text). Out of scope: card and delivery form, payment, summary and final status screens, deployment changes. Edge cases: API slow or unreachable, empty catalog, product removed or out of stock while on its page, stale persisted state referencing a missing product, too many requests, quantity above available stock."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the product catalog (Priority: P1)

A shopper opens the store and sees every tech-accessory product in a gallery: image, name, price in
Colombian pesos and units available. Products that are out of stock are clearly marked and cannot be
selected. While the catalog is being fetched the gallery shows a loading state; when the catalog is empty
it shows an empty state; when the request fails it shows an error state with a retry action.

**Why this priority**: The catalog is the entry point of the whole checkout. Without it there is nothing to
buy, so it is the minimum viable slice that already delivers value.

**Independent Test**: Open the store against the running catalog API and confirm every returned product is
rendered with its image, name, peso price and available units; out-of-stock products are marked and cannot
be selected; the loading, empty and error (with retry) states are each reachable.

**Acceptance Scenarios**:

1. **Given** the catalog API returns several products, **When** the shopper opens the store, **Then** the
   gallery lists each product with image, name, price in Colombian pesos and units available.
2. **Given** a product has zero units available, **When** the gallery is shown, **Then** that product is
   clearly marked as out of stock and cannot be selected.
3. **Given** the catalog API is slow or unreachable, **When** the gallery loads, **Then** a loading state is
   shown first and, on failure, an error state with a retry action is shown.
4. **Given** the catalog API returns an empty list, **When** the gallery loads, **Then** an empty state is
   shown.
5. **Given** the catalog API answers with a "too many requests" response, **When** the gallery loads,
   **Then** a friendly message is shown instead of a raw error.

---

### User Story 2 - Open a product, choose a quantity and start the purchase (Priority: P2)

A shopper opens a product and sees its image, name, description, price and available stock. The shopper
chooses a quantity between 1 and the smaller of the available stock and ten units, and presses a button that
starts the purchase. Because the card form arrives in a later feature, the app records the choice in the
central store and shows a clear "next step" placeholder message.

**Why this priority**: This is the interaction that turns browsing into a purchase intent, and it produces
the central store data every later checkout screen depends on.

**Independent Test**: Open a product, confirm its details render from the API, move the quantity within its
bounds, press the purchase button and confirm the choice is stored and the "next step" placeholder appears.

**Acceptance Scenarios**:

1. **Given** a product with available stock, **When** the shopper opens its detail page, **Then** the image,
   name, description, price and available stock are shown.
2. **Given** a product with available stock N, **When** the shopper uses the quantity selector, **Then** the
   quantity stays between 1 and the smaller of N and ten.
3. **Given** a chosen quantity, **When** the shopper presses the purchase button, **Then** the selected
   product and quantity are recorded in the central store and a clear "next step" placeholder is shown.
4. **Given** the shopper is on a product page, **When** the product is removed or becomes out of stock,
   **Then** the app informs the shopper and prevents starting the purchase.

---

### User Story 3 - Resume progress after a page refresh (Priority: P3)

A shopper refreshes the browser and the app restores the purchase progress: the current step, the selected
product, the chosen quantity and any non-sensitive delivery and transaction data. If the restored state
references a product that no longer exists, that state is discarded so the shopper is not stranded on a
missing product. Card data is never restored because it is never persisted.

**Why this priority**: Refresh recovery protects shoppers from losing their progress and is required by the
business flow, but it builds on the store and the pages from the two preceding stories.

**Independent Test**: Select a product and quantity, refresh the page and confirm the selection and step are
restored; seed a persisted state pointing at a non-existent product and confirm it is discarded on load.

**Acceptance Scenarios**:

1. **Given** a selected product and quantity, **When** the shopper refreshes the page, **Then** the app
   restores the current step, the selected product and the quantity.
2. **Given** persisted progress that references a product that no longer exists, **When** the app loads,
   **Then** the stale progress is discarded and the shopper starts from the catalog.
3. **Given** card data was entered, **When** the page is refreshed, **Then** no card number or CVC is
   restored (they are never persisted).
4. **Given** the shopper has opened a product detail page, **When** the page is reloaded, **Then** the app
   shows the same product detail page (by product id).

---

### Edge Cases

- The catalog API is slow: a loading state is shown until it answers.
- The catalog API is unreachable: an error state with a retry action is shown, and retry re-reads the API.
- The catalog is empty: an empty state is shown.
- A product is removed or becomes out of stock while the shopper is on its page: the shopper is informed and
  cannot start the purchase.
- Persisted progress references a product that no longer exists: the stale progress is discarded.
- The API answers "too many requests": a friendly message is shown, without exposing internal details.
- A quantity above the available stock (including stock that drops after the selection): the app prevents
  exceeding the available stock and adjusts per latest data when needed.
- An image fails to load: a fallback is shown in its place.
- Reloading a product detail page: the same product detail page is shown by its address (product id).
- An unknown address is entered: a not-found page with a link back to the gallery is shown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The gallery (home) MUST show every product returned by the catalog API with its image, name,
  price and units available.
- **FR-002**: The system MUST display prices in Colombian pesos by dividing the stored minor-unit amount by
  100.
- **FR-003**: The system MUST clearly mark out-of-stock products and prevent selecting them.
- **FR-004**: The gallery MUST provide loading, empty and error states, and the error state MUST offer a
  retry action.
- **FR-005**: The system MUST always read the catalog from the back-end API so the displayed stock reflects
  the latest value each time the gallery is shown.
- **FR-006**: The product detail page MUST show the product image, name, description, price and available
  stock from the API.
- **FR-007**: The product detail page MUST provide a quantity selector bounded between 1 and the smaller of
  the available stock and ten units.
- **FR-008**: The system MUST prevent a selected quantity from exceeding the available stock. The product data
  (including stock) MUST be re-read when the product page opens, when the browser tab becomes visible again,
  and right before the purchase choice is recorded. If the stock is no longer enough, the shopper MUST be told
  and the quantity MUST be adjusted to what remains, or the purchase MUST be blocked when nothing remains.
- **FR-009**: The product detail page MUST provide a button that starts the purchase; it MUST record the
  selected product and quantity and show a clear "next step" placeholder (the card form is a later feature).
- **FR-010**: When a product is removed or becomes out of stock while the shopper is on its page (including
  after a re-read of product data), the system MUST inform the shopper and prevent starting the purchase. The
  product data MUST be re-read when the product page opens, when the browser tab becomes visible again, and
  right before the purchase choice is recorded; if stock is no longer enough the shopper is told and the
  quantity is adjusted to what remains, or the purchase is blocked when nothing remains.
- **FR-011**: The system MUST keep the checkout progress in a single central store containing the current
  step (product page, card and delivery, summary, final status), the selected product, the quantity, the
  delivery data and the transaction id.
- **FR-012**: The system MUST persist only non-sensitive progress values (step, selected product, quantity,
  delivery data, transaction id/reference/status) so a page refresh restores the progress. Delivery data is
  personal and MUST not outlive the purchase.
- **FR-013**: The system MUST NOT persist or store the card number or CVC at any time.
- **FR-014**: On load, persisted progress that references a product that no longer exists MUST be discarded.
- **FR-015**: The selected product and quantity MUST survive a page refresh.
- **FR-016**: When the API is unreachable or answers "too many requests", the system MUST show a friendly
  message and MUST NOT expose internal error details.
- **FR-017**: The system MUST assign each page its own address (gallery and product detail by product id).
  Reloading or opening an address directly MUST show the right page. An unknown address MUST show a not-found
  page with a link back to the gallery.
- **FR-018**: The layout MUST be mobile-first and MUST work from a 375x667 CSS-pixel viewport up to desktop
  with no horizontal overflow.
- **FR-019**: Images MUST use a light-weight format with fixed dimensions, MUST be lazy-loaded below the
  fold, and MUST show a fallback when an image fails to load.
- **FR-020**: The interface MUST support keyboard navigation, visible focus, labels for interactive elements
  and alternative text for images.
- **FR-021**: Persisted progress MUST be cleared when the purchase reaches its final step and the shopper
  leaves it, when the shopper chooses to start over, and when it is older than 24 hours.
- **FR-022**: Front-end automated tests (Jest) MUST cover the central store logic, the page behaviors and the
  refresh-restore behavior, keeping overall front-end coverage above 80%.

### Key Entities *(include if feature involves data)*

- **Product**: A tech accessory the store sells; attributes include an identifier, name, description, price
  in minor units, available stock and an image reference.
- **Checkout progress**: The shopper's in-flight purchase; attributes include the current step, the selected
  product, the chosen quantity, the delivery data and the transaction id. Persisted values are limited to
  the non-sensitive subset.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper can open the store and a product, and both pages show the real catalog data, with the
  displayed price equal to the stored amount divided by 100.
- **SC-002**: The stock shown in the gallery matches the back-end API's latest value after a purchase, because
  the catalog is re-read from the API.
- **SC-003**: The gallery and product detail pages have no horizontal overflow at a 375-pixel-wide viewport
  and remain usable up to desktop width.
- **SC-004**: After a page refresh, the selected product and quantity (and other non-sensitive progress) are
  restored.
- **SC-005**: 100% of out-of-stock products are visibly marked and cannot be selected.
- **SC-006**: Front-end automated test coverage stays above 80%.
- **SC-007**: A keyboard-only shopper can reach and operate the gallery, the product detail, the quantity
  selector and the purchase button, with a visible focus indicator at each stop.
- **SC-008**: Reloading or opening a product detail address directly shows the correct product detail page.

## Assumptions

- The catalog endpoints (`GET /products` and `GET /products/:id`) already exist in the back-end and return
  products with stock.
- One product with a quantity per purchase (no multi-product cart), matching the current business decision,
  and the maximum quantity per purchase is ten units.
- The ten-unit limit mirrors the back-end rule and must be kept in sync.
- Checkout is a guest flow with no customer authentication.
- Prices are stored in integer minor units (COP multiplied by 100) and shown as Colombian pesos.
- Because the card and delivery form, the payment, the summary and the final status screens are later
  features, the "start purchase" action only stores the choice and shows a placeholder for the next step.
- The front-end is built from the framework starter template in the `front-end/` folder, and Jest is the test
  runner for the front-end as required by the project.
- A "too many requests" response is treated as a transient, user-friendly condition, not as an internal error.
