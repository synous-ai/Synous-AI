# DevDúo CRM

CRM propio para una agencia de desarrollo web, construido **desde cero** sobre PostgreSQL.
Monorepo con tres aplicaciones: una API (Fastify), un portal de administración (Next.js) y
un portal para clientes (Next.js).

> Sin librerías externas de CRM. Toda la lógica de negocio se construye sobre el stack propio.

---

## Stack

| Capa            | Tecnología                                            |
| --------------- | ----------------------------------------------------- |
| Runtime         | Node.js 20+ · TypeScript estricto                     |
| Monorepo        | pnpm workspaces + Turborepo                           |
| API             | Fastify 5 + Zod                                       |
| ORM             | Drizzle ORM                                           |
| Base de datos   | PostgreSQL 16                                         |
| Auth            | JWT (access 15 min + refresh 7 días en cookie httpOnly) |
| Jobs / Queue    | BullMQ + Redis                                        |
| Emails          | Resend                                                |
| Frontend        | Next.js 14 (App Router) + TypeScript                  |
| Estilos         | Tailwind CSS + shadcn/ui                              |
| Estado / Datos  | Zustand + TanStack Query                              |

---

## Estructura del monorepo

```
apps/
  api/            → Fastify + Drizzle + PostgreSQL
  admin/          → Next.js — portal de administración (equipo interno)
  client-portal/  → Next.js — portal para clientes
packages/
  shared/         → tipos y utilidades compartidas
  api-client/     → cliente tipado para consumir la API
```

---

## Requisitos previos

- **Node.js** ≥ 20
- **pnpm** ≥ 11 (`npm install -g pnpm`)
- **Docker** + Docker Compose (para Postgres y Redis)

---

## Instalación e inicialización

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/jeremiasingla/CRMDev.git
cd CRMDev
pnpm install
```

### 2. Configurar variables de entorno

La API valida sus variables con Zod al arrancar (falla rápido si falta alguna).
Creá el archivo `apps/api/.env` con el siguiente contenido:

```bash
# ── Entorno ───────────────────────────────────────────────
NODE_ENV=development
PORT=3001

# ── Base de datos (REQUERIDO) ─────────────────────────────
# Docker mapea Postgres en el puerto 5433 del host.
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/devduo_crm

# ── Redis (opcional — necesario para jobs/alertas BullMQ) ─
REDIS_URL=redis://localhost:6379

# ── JWT (REQUERIDO — mínimo 32 caracteres cada uno) ───────
# Generá secretos fuertes, por ejemplo: openssl rand -base64 48
ACCESS_TOKEN_SECRET=cambiar_por_un_secreto_de_al_menos_32_caracteres
REFRESH_TOKEN_SECRET=cambiar_por_otro_secreto_de_al_menos_32_caracteres
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d

# ── URLs de las apps (opcional — emails y CORS) ───────────
ADMIN_URL=http://localhost:3000
CLIENT_PORTAL_URL=http://localhost:3002
API_URL=http://localhost:3001
PUBLIC_API_URL=http://localhost:3001

# ── Integraciones (opcionales) ────────────────────────────
RESEND_API_KEY=
FROM_EMAIL=
FATHOM_WEBHOOK_SECRET=
```

> El `.env` está en `.gitignore` y **nunca** debe subirse al repositorio.

### 3. Levantar la infraestructura (Postgres + Redis)

```bash
docker compose -f docker-compose.dev.yml up -d
```

Esto levanta:

| Servicio   | Contenedor       | Puerto host |
| ---------- | ---------------- | ----------- |
| PostgreSQL | `devduo_postgres` | `5433`      |
| Redis      | `devduo_redis`    | `6379`      |

### 4. Correr las migraciones

```bash
pnpm --filter api db:migrate
```

### 5. Cargar el seed inicial

```bash
pnpm --filter api db:seed
```

### 6. Levantar el entorno de desarrollo

```bash
# Las tres apps en paralelo (Turborepo)
pnpm dev

# O cada una por separado:
pnpm --filter api dev            # API
pnpm --filter admin dev          # Portal de administración
pnpm --filter client-portal dev  # Portal de clientes
```

---

## Puertos en desarrollo

| App / Servicio       | URL                     |
| -------------------- | ----------------------- |
| API                  | http://localhost:3001   |
| Portal de admin      | http://localhost:3000   |
| Portal de clientes   | http://localhost:3002   |
| PostgreSQL           | localhost:5433          |
| Redis                | localhost:6379          |

---

## Comandos útiles

### Base de datos (workspace `api`)

```bash
pnpm --filter api db:generate   # Generar migración tras cambiar el schema Drizzle
pnpm --filter api db:migrate    # Aplicar migraciones pendientes
pnpm --filter api db:push       # Push directo del schema (solo dev)
pnpm --filter api db:studio     # Abrir Drizzle Studio
pnpm --filter api db:seed       # Cargar datos iniciales
```

> El schema de Drizzle vive en `apps/api/src/db/schema/`.
> Nunca editar manualmente los archivos en `migrations/`.

### Testing

```bash
pnpm test                       # Todos los tests (Turborepo)
pnpm --filter api test          # Solo la API
pnpm --filter api test:watch    # Watch mode
pnpm --filter api test:coverage # Con cobertura
```

> Los tests usan una base separada (`devduo_crm_test`) para no contaminar la de desarrollo.

### Calidad y build

```bash
pnpm typecheck   # Type-check de todo el monorepo
pnpm lint        # Lint de todo el monorepo
pnpm build       # Build de producción de todas las apps
```

---

## Documentación

- **`CLAUDE.md`** — convenciones de código, reglas de negocio y arquitectura.
- **`CRM_DEVDUO_DOCS.md`** — documentación funcional completa del producto.
- **`docs/schema.sql`** — referencia del esquema de base de datos.
