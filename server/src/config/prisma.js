/**
 * Prisma Client Singleton
 * Ensures a single instance across the application
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
})

export default prisma
