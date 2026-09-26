import prisma from '../config/prisma.js'

export async function listAccounts() {
  return prisma.account.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, include: { parent: { select: { code: true, name: true } } } })
}

export async function getTrialBalance({ startDate, endDate } = {}) {
  const where = {}
  if (startDate || endDate) {
    where.journalEntry = { entryDate: {} }
    if (startDate) where.journalEntry.entryDate.gte = new Date(startDate)
    if (endDate) where.journalEntry.entryDate.lte = new Date(`${endDate}T23:59:59.999`)
  }
  const lines = await prisma.journalLine.findMany({ where, include: { account: { select: { code: true, name: true, type: true } } } })
  const byAccount = new Map()
  for (const line of lines) {
    const current = byAccount.get(line.accountId) || { account: line.account, debit: 0, credit: 0 }
    current.debit += Number(line.debit || 0)
    current.credit += Number(line.credit || 0)
    byAccount.set(line.accountId, current)
  }
  const accounts = [...byAccount.values()].map((item) => ({ ...item, balance: item.debit - item.credit }))
  return {
    accounts,
    totals: {
      debit: accounts.reduce((sum, item) => sum + item.debit, 0),
      credit: accounts.reduce((sum, item) => sum + item.credit, 0),
      balance: accounts.reduce((sum, item) => sum + item.balance, 0)
    }
  }
}

export default { listAccounts, getTrialBalance }
