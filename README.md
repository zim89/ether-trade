# ether-trade Server Monorepo (`et-server`)

> Backend microservices platform for the **ether-trade** crypto copy-trading and matching ecosystem.

Built with **NestJS 11**, **gRPC (`ts-proto`)**, **PostgreSQL 16 + Drizzle ORM**, and **Valkey 8 (`@valkey/valkey-glide`)**.

---

## Architecture Overview

- **Inter-Service Communication:** High-performance gRPC with Protobuf schema contracts (`libs/contracts/`).
- **Database per Service:** Dedicated PostgreSQL databases (`identity_db`, `accounts_db`) per microservice with independent Drizzle Kit migration lifecycles.
- **Authentication:** Web3 Ethereum wallet signatures via SIWE (EIP-4361, `viem`) with single-use nonce storage in Valkey GLIDE and JWT token pair (access + rotating refresh).
- **Financial Ledger:** Double-entry accounting system with strict concurrency controls (`SELECT ... FOR UPDATE`), protecting against double spending and negative balances.

---

## Monorepo Structure

```text
et-server/
├── apps/
│   ├── api-gateway/         # REST API Gateway / BFF (Milestone M2)
│   ├── identity/            # Identity & Auth microservice (gRPC :50051)
│   └── accounts/            # Ledger & Balances microservice (gRPC :50052)
├── libs/
│   ├── common/              # Shared constants, filters, types, utilities
│   └── contracts/           # Protobuf definitions & generated ts-proto code
├── docker/
│   ├── docker-compose.dev.yml
│   └── init-multiple-databases.sh
└── package.json
```

---

## Local Development Environment

### Prerequisites

- **Node.js**: `22.x` (LTS)
- **pnpm**: `12.x`
- **Docker & Docker Compose**: v2+

### Quick Start (Daily Development)

1. **Start local infrastructure containers:**

   ```bash
   pnpm docker:up
   ```

   *Starts `ether-trade-postgres` (PostgreSQL 16) and `ether-trade-redis` (Valkey 8) with container healthchecks.*

2. **Run database migrations:**

   ```bash
   pnpm db:migrate
   ```

   *Applies pending Drizzle migrations to `identity_db` and `accounts_db` idempotently.*

3. **Start microservices in development watch mode:**

   ```bash
   # Terminal 1: Identity Service
   pnpm start:dev identity

   # Terminal 2: Accounts Service
   pnpm start:dev accounts
   ```

---

## Environment Configuration

Configuration follows a clean separation between **CLI tools** and **Runtime Microservices**:

| Context | Config Source | Details |
| :--- | :--- | :--- |
| **CLI Migrations (`db:migrate`)** | Root `.env` or system env | Reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`. Uses `IDENTITY_DATABASE_URL` and `ACCOUNTS_DATABASE_URL` overrides if provided, otherwise defaults to local Docker databases. |
| **Microservices (`apps/*`)** | `apps/<service>/.env` or root `.env` | Each service reads its isolated database (`DB_NAME=identity_db` or `accounts_db`) and respective gRPC ports (`50051`, `50052`). |

---

## Database Management & Schema Changes

When modifying database schemas in `apps/<service>/src/database/schema/`:

1. **Generate new SQL migration files:**

   ```bash
   pnpm db:generate
   ```

   *Generates schema delta SQL files in `apps/identity/src/database/migrations/` and `apps/accounts/src/database/migrations/`.*

2. **Apply migrations to databases:**

   ```bash
   pnpm db:migrate
   ```

To target an individual microservice:

```bash
pnpm db:generate:identity  # Generate only for identity
pnpm db:generate:accounts  # Generate only for accounts
pnpm db:migrate:identity   # Migrate only identity_db
pnpm db:migrate:accounts   # Migrate only accounts_db
```

---

## Docker Container Management

```bash
pnpm docker:up        # Start containers in background and wait for healthchecks
pnpm docker:down      # Stop containers
pnpm docker:down:v    # Stop containers and remove volumes (clean database reset)
pnpm docker:logs      # Follow container logs
```

---

## Well-Known Test Accounts (Anvil / Hardhat #0–#2)

Standard deterministic accounts for local testing:

| Label | Ethereum Address | Private Key | Default Role |
| :--- | :--- | :--- | :--- |
| **Alice (Trader #0)** | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` | `trader` |
| **Bob (Master #1)** | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` | `trader` |
| **Charlie (Admin #2)** | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` | `admin` |

*(Initial balances and admin roles are credited via the Milestone M2 Dev Faucet API).*

---

## Testing & Quality Assurance

```bash
pnpm lint             # Run ESLint across all apps and libs
pnpm build            # Build all NestJS microservices
pnpm test             # Run Jest unit tests
pnpm test:cov         # Run tests with coverage report
```
