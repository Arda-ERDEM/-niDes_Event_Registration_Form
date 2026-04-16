# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Email**: nodemailer (Gmail SMTP)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

### GDG On Campus Samsun University - Etkinlik Kayıt (gdg-form)
- React + Vite frontend at `/`
- Team registration form for Google Developer Groups On Campus Samsun University event
- 15 teams, 2-4 participants per team, team captain submits the form
- Sends registration data to gdscsamsununiversitesi@gmail.com via Gmail SMTP
- Required environment variables: `EMAIL_USER`, `EMAIL_PASS`, `TARGET_EMAIL`

## Email Configuration

To enable email sending, set these environment variables:
- `EMAIL_USER`: Gmail address to send from (e.g., your Gmail address)
- `EMAIL_PASS`: Gmail App Password (NOT your regular password — generate from Google Account settings)
- `TARGET_EMAIL`: Destination email (defaults to gdscsamsununiversitesi@gmail.com)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
