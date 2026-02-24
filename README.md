# XBS (Xoro Billing Service) - API

Universal subscription billing infrastructure built for African SaaS companies.

## 🎯 Overview

XBS is a standalone, production-ready subscription billing platform that provides:
- Multi-tenant subscription management
- Usage-based & tiered pricing
- Multi-currency support (13 African currencies + global)
- Payment provider abstraction (XoroPay, Stripe, Paystack)
- Webhook event delivery with guaranteed delivery (Transactional Outbox pattern)
- Comprehensive analytics & reporting

## 🏗️ Architecture

- **Multi-tenant:** Each SaaS company is an "Application" with isolated data
- **Event-driven:** Transactional outbox pattern for guaranteed webhook delivery
- **ACID Compliant:** PostgreSQL with proper transactions and constraints
- **Provider-agnostic:** Abstract payment layer for multiple providers

## 📦 Technology Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL (with pg driver)
- **Logging:** Winston
- **Security:** Helmet, CORS

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

### Installation

1. **Clone and Install**
   ```bash
   cd xbs-api
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Database Setup**
   ```bash
   # Create database
   createdb xbs_dev

   # Run migrations
   npm run migrate:up

   # Seed sample data (optional)
   npm run seed
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Verify**
   ```bash
   curl http://localhost:3000/health
   ```

## 📁 Project Structure

```
xbs-api/
├── database/
│   ├── migrations/          # 16 migration files
│   ├── seeds/              # Sample data
│   └── rollback/           # Rollback scripts
├── src/
│   ├── config/            # Configuration (env, db, logger)
│   ├── middleware/        # Express middleware
│   ├── routes/           # API routes
│   ├── utils/            # Utilities (logger, errors)
│   ├── types/            # TypeScript types
│   ├── app.ts           # Express app setup
│   └── server.ts        # Entry point
├── logs/                # Application logs
├── .env.example        # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## 🗄️ Database Schema

### Core Tables (20+)

1. **applications** - SaaS companies using XBS
2. **api_keys** - Test/live authentication keys
3. **payment_provider_configs** - Payment provider credentials
4. **subscription_plans** - Pricing tiers with usage pricing
5. **customers** - End-users of SaaS companies
6. **payment_methods** - Stored payment methods
7. **subscriptions** - Active billing relationships
8. **usage_records** - Metered usage tracking (idempotent)
9. **invoices** - Generated bills (immutable after finalization)
10. **payment_transactions** - Payment attempts with full audit
11. **payment_retry_schedules** - Dunning logic
12. **outbox_events** - Guaranteed webhook delivery
13. **webhook_deliveries** - Delivery tracking
14. **exchange_rates** - Multi-currency support
15. **disputes** - Chargeback tracking
16. **xbs_subscriptions** - XBS's own billing (meta)

### Key Features

- **UUID Primary Keys** throughout
- **JSONB Fields** for flexible data (features, metadata, pricing tiers)
- **Multi-tenancy** via application_id scoping
- **Test Mode** flags on transactional tables
- **Soft Deletes** with deleted_at timestamps
- **Audit Logs** for state changes
- **Idempotency** keys on critical operations

## 🔧 NPM Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload

# Build
npm run build           # Compile TypeScript to dist/

# Production
npm start               # Run compiled code

# Database
npm run migrate:up      # Run all migrations
npm run migrate:down    # Rollback all migrations
npm run seed            # Insert sample data

# Testing
npm test                # Run tests (not implemented yet)
```

## 🔐 Environment Variables

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT tokens
- `ENCRYPTION_KEY` - Key for encrypting sensitive data

### Optional
- `PORT` - Server port (default: 3000)
- `LOG_LEVEL` - Logging level (default: info)
- `CORS_ORIGIN` - Allowed origins
- `API_RATE_LIMIT` - Requests per minute

See `.env.example` for full list.

## 📡 API Endpoints

### Health Check
```bash
GET /health         # Comprehensive health check
GET /ready          # Kubernetes readiness probe
GET /live           # Kubernetes liveness probe
```

### Future Endpoints
- `POST /v1/auth/signup` - Register new application
- `POST /v1/customers` - Create customer
- `POST /v1/subscriptions` - Create subscription
- `POST /v1/usage` - Record usage
- And more...

## 🎯 Key Design Decisions

### 1. Idempotency
All critical operations (usage recording, payments) use idempotency keys to prevent duplicates.

### 2. Test Mode
Separate test/live modes with API key prefixes:
- Test: `xbs_pk_test_`, `xbs_sk_test_`
- Live: `xbs_pk_live_`, `xbs_sk_live_`

### 3. Transactional Outbox
Webhooks use outbox pattern for guaranteed delivery:
1. Event inserted in same transaction as domain change
2. Background worker processes outbox
3. Retries with exponential backoff

### 4. Invoice Immutability
Finalized invoices cannot be modified (enforced by trigger). Use credit notes for adjustments.

### 5. Multi-Currency
- All amounts stored in cents (integers)
- Daily exchange rate updates
- Analytics converted to preferred currency

## 📊 Sample Applications

### Included Test Data

1. **TaskFlow** (USD) - Project management SaaS
   - Plans: Free, Starter ($20), Pro ($50)
   - Usage metric: Storage GB

2. **PayServe** (NGN) - Fintech platform
   - Plans: Basic (₦15k), Business (₦50k), Enterprise (₦150k)
   - Usage metric: Transactions

3. **EduPro** (KES) - Education platform
   - Plans: Educator (KSh 2k), Institution (KSh 10k)
   - Usage metric: Students

## 🔍 Database Queries

### Test Connection
```sql
SELECT NOW() as current_time;
```

### Check Applications
```sql
SELECT id, name, email, active FROM applications;
```

### Check API Keys
```sql
SELECT key_prefix, key_type, key_role, active 
FROM api_keys 
WHERE application_id = 'YOUR_APP_ID';
```

### Check Subscription Plans
```sql
SELECT plan_code, name, price_cents, currency, billing_interval
FROM subscription_plans
WHERE application_id = 'YOUR_APP_ID';
```

## 🚨 Production Checklist

Before deploying to production:

- [ ] Change all default secrets in `.env`
- [ ] Set `NODE_ENV=production`
- [ ] Enable SSL/TLS on database
- [ ] Set up proper CORS origins
- [ ] Configure rate limiting
- [ ] Set up error tracking (Sentry)
- [ ] Configure log rotation
- [ ] Set up database backups
- [ ] Review and adjust connection pool sizes
- [ ] Enable database query logging
- [ ] Set up monitoring/alerting
- [ ] Configure firewall rules

## 🐛 Troubleshooting

### Database Connection Fails
```bash
# Check PostgreSQL is running
pg_isready

# Verify DATABASE_URL format
postgresql://user:password@localhost:5432/database_name
```

### Migration Errors
```bash
# Check current database state
psql $DATABASE_URL -c "\dt"

# Rollback and retry
npm run migrate:down
npm run migrate:up
```

### Port Already in Use
```bash
# Change PORT in .env or kill existing process
lsof -ti:3000 | xargs kill -9
```

## 📝 Development Notes

### Code Style
- TypeScript strict mode enabled
- ESLint recommended (not included)
- Consistent async/await usage
- Proper error handling with custom error classes

### Database Conventions
- Table names: plural, lowercase, snake_case
- Column names: lowercase, snake_case
- Enums: lowercase values
- Timestamps: Always include created_at, updated_at where applicable

### Logging
- Use structured logging (JSON in production)
- Include correlation IDs
- Log levels: error, warn, info, debug

## 🤝 Contributing

This is a production-grade foundation. Future contributions should:
1. Maintain TypeScript strict mode
2. Follow existing patterns
3. Add proper error handling
4. Include database migrations
5. Update documentation

## 📄 License

MIT License

## 🔗 Related Projects

- XBS Dashboard (Future)
- XBS SDKs (Node, Python, Ruby - Future)
- XBS Documentation Site (Future)

---

**Built with ❤️ for African SaaS companies**
