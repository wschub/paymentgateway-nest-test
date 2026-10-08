# Feature Specification: Back-end Base - Product Catalog API

**Feature Branch**: `001-back-end-base`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Back-end base for the checkout store. Source of truth: docs/requirements.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Products (Priority: P1)

As a customer, I need to view all available tech-accessory products with their stock levels so I can decide what to purchase.

**Why this priority**: This is the entry point to the checkout flow - the product listing is essential for the app to function.

**Independent Test**: Can call GET /products and receive a list of products with complete data (name, description, price, stock, image). Works even if single product endpoint is not implemented.

**Acceptance Scenarios**:

1. **Given** the database is seeded with products, **When** I call GET /products, **Then** I receive a 200 OK with an array of product objects including id, name, description, priceInCents (COP minor units), stock, imageUrl
2. **Given** the database contains products, **When** I call GET /products, **Then** all returned products have non-negative stock and valid data
3. **Given** no special filtering, **When** I call GET /products, **Then** I get all seeded products (8-10 items)
4. **Given** a product has stock 0, **When** I call GET /products, **Then** it is still listed with stock 0

---

### User Story 2 - View Product Details (Priority: P1)

As a customer, I need to view the details of a specific product by its ID so I can see full information before purchasing.

**Why this priority**: Customers need to view individual product details; also required for the checkout flow.

**Independent Test**: Can call GET /products/:id with a valid ID and get full product details. Can test error cases independently.

**Acceptance Scenarios**:

1. **Given** a product exists with id X, **When** I call GET /products/:id with X, **Then** I receive 200 OK with the full product object
2. **Given** no product exists with a well-formed UUID (for example 00000000-0000-4000-8000-000000000000), **When** I call GET /products/:id with it, **Then** I receive 404 Not Found with consistent error body
3. **Given** a malformed id (not a UUID, for example 999999 or abc), **When** I call GET /products/:id, **Then** I receive 400 Bad Request with consistent error body

---

### User Story 3 - API Documentation (Priority: P2)

As a developer integrating with the API, I need Swagger documentation so I can understand the endpoints and their contracts.

**Why this priority**: Required by project requirements for API docs; supports testing and integration.

**Independent Test**: Swagger UI is accessible at /docs and shows documented /products endpoints.

**Acceptance Scenarios**:

1. **Given** the API is running, **When** I open /docs, **Then** I see the API docs with both product endpoints documented

### Edge Cases

- Empty catalog: GET /products returns 200 with an empty array
- Database unavailable: safe error body with no internal details (5xx), never a stack trace
- Unknown routes and unsupported methods return the same consistent error body
- Request from a non-allowed origin is rejected by CORS
- Too many requests from the same client receive 429 with the consistent error body

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide GET /products endpoint returning list of all products with stock
- **FR-002**: System MUST provide GET /products/:id endpoint returning a single product
- **FR-003**: System MUST return 200 OK with product data when product is found
- **FR-004**: System MUST return 404 Not Found with consistent error body format when product id does not exist
- **FR-005**: System MUST return 400 Bad Request with consistent error body format for malformed ids
- **FR-006**: System MUST enforce stock >= 0 constraint at database level
- **FR-007**: System MUST store money as integers in minor units (COP currency)
- **FR-008**: System MUST define the four entities Product (with stock), Customer, Transaction and Delivery in the database schema. The schema defines all four entities; domain entities, ports and repositories are implemented for Product only in this feature.
- **FR-009**: System MUST seed database with 8-10 tech-accessory products with WebP image URLs
- **FR-010**: System MUST provide Swagger API documentation at the public path /docs (JSON at /docs-json)
- **FR-011**: System MUST use consistent error response body format across all endpoints
- **FR-012**: System MUST apply security headers, restricted CORS (allowed origins from configuration), rate limiting, input validation and safe error messages

### Key Entities *(include if feature involves data)*

- **Product**: Represents a tech-accessory product with id (UUID), name, description, priceInCents (int, COP minor units), stock (int >= 0), imageUrl (WebP). Has stock tracking.
- **Customer**: Represents customer contact data (full name, email, phone). Schema only in this feature.
- **Transaction**: Represents payment transaction with status enum (PENDING, APPROVED, DECLINED, VOIDED, ERROR), reference, idempotency key, amounts, product/customer references. Schema only in this feature.
- **Delivery**: Represents delivery information (address, city, region, postal code, notes, status) linked to a transaction. Schema only in this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: API starts successfully from clean state following README setup steps
- **SC-002**: Seed data loads with 8-10 products
- **SC-003**: GET /products returns all seeded products with 200 OK
- **SC-004**: GET /products/:id returns correct product with 200 OK for valid id
- **SC-005**: GET /products/:id returns 404 with consistent error body for non-existent id
- **SC-006**: GET /products/:id returns 400 with consistent error body for malformed id
- **SC-007**: Unit tests pass with ≥ 80% coverage for backend code
- **SC-008**: API documentation (Swagger) is accessible at /docs

## Assumptions

- NestJS + TypeScript, PostgreSQL, Prisma stack as per constitution/requirements
- Docker Compose available for local database
- .env.example with empty values provided
- Hexagonal architecture enforced (domain, application, infrastructure layers)
- Money stored as integers in minor units (COP)
- Product ids are UUIDs
- WebP images for products, served by the front-end (relative paths in the seed)
