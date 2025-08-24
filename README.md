# Contact Identity Resolution Service

A Node.js service that identifies and tracks customer identity across multiple purchases for Bitespeed.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- pnpm package manager

### Installation

1. Clone and setup:
```bash
git clone <your-repo>
cd contact-identity-service
pnpm install
```

2. Environment setup:
```bash
cp .env.example .env

```

3. Database setup:
```bash
# Generate Prisma client
pnpm db:generate

# Run migrations (after Milestone 2)
pnpm db:migrate
```

4. Start development server:
```bash
pnpm dev
```

## 📋 API Endpoints

### POST /identify
Identifies and consolidates customer contact information.

**Request:**
```json
{
  "email": "customer@example.com",
  "phoneNumber": "1234567890"
}
```

**Response:**
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["customer@example.com"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": []
  }
}
```

### GET /health
Health check endpoint.

### GET /health/detailed
Health check endpoint with statistics.

### GET /health/database
Health check endpoint with database health, integrity, statistics and seed status.

## 🛠️ Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm test` - Run tests
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open Prisma Studio

## 📁 Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── middleware/      # Express middleware
├── models/          # Database models
├── routes/          # Route definitions
├── services/        # Business logic
├── types/           # TypeScript types
├── app.ts           # Express app setup
└── server.ts        # Server entry point
```

## 🧪 Testing

Run tests:
```bash
pnpm test
pnpm test:watch
```




