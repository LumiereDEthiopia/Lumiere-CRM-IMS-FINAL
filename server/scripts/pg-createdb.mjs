import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const exists = await p.$queryRawUnsafe("SELECT 1 FROM pg_database WHERE datname='lumier_crm'")
if (exists.length === 0) { await p.$executeRawUnsafe('CREATE DATABASE lumier_crm'); console.log('DB_CREATED') } else { console.log('DB_EXISTS') }
await p.$disconnect()
