<!-- SYNC IMPACT REPORT
Version change: 0.0.0 → 1.0.0 (MAJOR: Initial constitution for the project based on requirements)
Modified principles:
- All placeholder principles replaced with project-specific ones
Added sections:
- Architecture Constraints (Section 2)
- Development Workflow (Section 3)
Removed sections:
- None
-->
# Payment Gateway Checkout Constitution

## Core Principles

### I. Source of Truth
Use docs/requirements.md as the source of truth for project requirements. All features, acceptance criteria, and business rules must align with docs/requirements.md. Any deviation requires explicit documentation in specs and approval before implementation.

### II. Hexagonal Architecture (Ports & Adapters) - NON-NEGOTIABLE
Every backend component follows hexagonal architecture: domain/ (entities, value objects, ports), application/ (use cases), infrastructure/ (adapters, implementations). Controllers contain no business logic. Use cases must never import `PrismaClient`, provider SDKs, or infrastructure-specific concerns. Clear boundaries between layers are required.

### III. Testing & Coverage (NON-NEGOTIABLE)
Test-first for domain and use cases (Red-Green-Refactor); tests written alongside the code everywhere else.
Overall coverage must stay above 80% in each app (back-end and front-end), targeting 85% for margin.
Jest is the test runner in both apps (not Vitest). Back-end use cases are tested with in-memory fakes of the
ports (no database). Front-end: reducers, thunks, validators and critical components are tested.

### IV. Railway Oriented Programming & Explicit Errors
Backend use cases follow Railway Oriented Programming with a typed `Result`. Business errors are values, not exceptions. Error handling must be explicit and predictable. Never throw for expected business failures (validation, insufficient stock, etc.).

### V. Security by Design - NON-NEGOTIABLE
Card data never reaches or lives in our systems. The browser tokenizes cards using the provider's public key only; the backend uses private/integrity secrets server-side only. Secrets live in environment variables only (.env.example contains empty values; real secrets never committed). Apply OWASP principles: input validation, safe error messages, rate limiting, restricted CORS, security headers (Helmet), HTTPS in deployment.

### VI. Atomicity & Data Integrity
Stock changes must be atomic and conditional (decrement only if stock >= quantity) inside a Prisma transaction. Money is stored as integers in minor units (COP). Database constraints enforced: stock >= 0 (CHECK), unique keys, foreign keys, enums. Prevent race conditions (two buyers for last unit) through proper transactional logic and constraints.

### VII. Simplicity & YAGNI
Start simple. No unnecessary complexity. Do not mention specific payment provider company names anywhere in code, files, docs, or repository - use generic names like PaymentGateway. Favor clarity over cleverness.

## Architecture Constraints

### Technology Stack
- **Backend**: NestJS + TypeScript, PostgreSQL, Prisma
- **Frontend**: React SPA (no Next.js), TypeScript, Vite, Redux Toolkit (Flux), Tailwind CSS
- **Testing**: Jest for backend and frontend
- **Infrastructure**: Docker, Docker Compose, IaC (Terraform/CDK recommended)

### API Design
Follow proper HTTP semantics: correct verbs, appropriate status codes (201, 400, 404, 409, 422), consistent error bodies. Honor Idempotency-Key on transaction creation. All endpoints must validate inputs at DTO, domain/use-case, and DB levels.

### UI/UX Constraints
Mobile-first design targeting iPhone SE (2020) 375x667 CSS px (750x1334 physical). No horizontal overflow. Fast images (WebP), explicit width/height, lazy loading below fold. Never store card number or CVC in Redux persist or localStorage.

## Development Workflow
### Branches and Pull Requests
One branch and one pull request per feature. Branches created by Spec Kit keep their generated numbered
names (do not rename them). Pull request titles follow Conventional Commits.

### AI Usage
AI assistance is supervised and spec-driven: specs, plans and tasks are reviewed by the developer before
implementation, and the workflow is documented in the README.

### Spec-Driven Development
Follow the feature roadmap (6 features in order) using Spec Kit workflow:
1. `/speckit-specify` → clarify open questions, create numbered branch
2. `/speckit-plan`, `/speckit-tasks` → plan and generate tasks
3. `/speckit-implement` → implement in small commits with tests
4. `/speckit-converge` → iterate until Converged

### Quality Gates
- - Tests green and overall coverage ≥ 80% in each app (target 85%)
- Lint and type-check clean
- No secrets committed
- No payment provider company names
- README, Swagger/Postman updated as required
- Conventional Commits used (feat, fix, test, docs, chore, refactor, ci)
- Small, frequent commits with visible history

## Governance

This Constitution supersedes all other practices. Amendments require documentation, approval, and a migration plan if they affect existing implementations. All PRs and reviews must verify compliance with these principles. Complexity must be justified when it violates Simplicity/YAGNI. Use runtime development guidance from docs/requirements.md as the authoritative reference for business requirements.

**Version**: 1.0.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07
