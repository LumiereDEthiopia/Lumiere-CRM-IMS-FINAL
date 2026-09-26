const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

// Full Ethiopian chart of accounts for the Accounting reports module.
// The original 12 accounts from seed-finance.cjs are kept unchanged; these
// additions give the reports the standard account structure they need.
const accounts = [
  // Assets
  ['1000', 'Cash and Bank', 'ASSET', 'Total cash and bank (parent)'],
  ['1010', 'Cash on Hand', 'ASSET', null],
  ['1020', 'Bank Account', 'ASSET', null],
  ['1100', 'Accounts Receivable', 'ASSET', null],
  ['1200', 'Inventory - Perfumes and Oils', 'ASSET', null],
  ['1300', 'Input VAT Receivable', 'ASSET', null],
  ['1400', 'Property and Equipment', 'ASSET', 'Fixed assets'],
  ['1410', 'Furniture and Fixtures', 'ASSET', null],
  ['1490', 'Other Fixed Assets', 'ASSET', null],
  // Liabilities
  ['2000', 'Accounts Payable', 'LIABILITY', null],
  ['2100', 'VAT Payable', 'LIABILITY', null],
  ['2200', 'Withholding Tax Payable', 'LIABILITY', null],
  ['2300', 'Taxes Payable', 'LIABILITY', 'Income / other taxes payable'],
  ['2400', 'Other Payables', 'LIABILITY', null],
  ['2500', 'Loans Payable', 'LIABILITY', 'Loans and long-term liabilities'],
  // Equity
  ['3000', 'Owner Equity', 'EQUITY', null],
  ['3100', "Owner's Capital", 'EQUITY', null],
  ['3200', 'Owner Drawings', 'EQUITY', null],
  ['3300', 'Retained Earnings', 'EQUITY', null],
  // Revenue
  ['4000', 'Sales Revenue - Perfumes', 'REVENUE', null],
  ['4010', 'Sales Revenue - Perfume Oils', 'REVENUE', null],
  ['4020', 'Other Income', 'REVENUE', null],
  // Expenses
  ['5000', 'Cost of Goods Sold', 'EXPENSE', null],
  ['5100', 'Operating Expenses', 'EXPENSE', 'Parent of operating expense accounts'],
  ['5110', 'Salaries Expense', 'EXPENSE', null],
  ['5120', 'Rent Expense', 'EXPENSE', null],
  ['5130', 'Marketing Expense', 'EXPENSE', null],
  ['5140', 'Utilities Expense', 'EXPENSE', null],
  ['5150', 'Transport Expense', 'EXPENSE', null],
  ['5160', 'Office Supplies Expense', 'EXPENSE', null],
  ['5190', 'Other Operating Expense', 'EXPENSE', null],
  ['6010', 'Interest and Bank Charges', 'EXPENSE', 'Other expenses'],
  ['6020', 'Other Expenses', 'EXPENSE', null],
  ['9900', 'Income Tax Expense', 'EXPENSE', null]
]

async function seed() {
  for (const [code, name, type, description] of accounts) {
    await p.account.upsert({ where: { code }, update: { name, type, isActive: true }, create: { code, name, type, description } })
  }
  // Link child accounts to parents
  const all = await p.account.findMany()
  const idBy = Object.fromEntries(all.map((a) => [a.code, a.id]))
  const parents = { 1010: '1000', 1020: '1000', 1400: '1000', 1410: '1000', 1490: '1000', 2300: '2000', 2400: '2000', 2500: '2000', 3100: '3000', 3200: '3000', 3300: '3000', 5110: '5100', 5120: '5100', 5130: '5100', 5140: '5100', 5150: '5100', 5160: '5100', 5190: '5100' }
  for (const [child, parent] of Object.entries(parents)) {
    if (idBy[child] && idBy[parent]) await p.account.update({ where: { id: idBy[child] }, data: { parentId: idBy[parent] } })
  }
  byCode.accountCount = all.length
  console.log(`Seeded ${accounts.length} accounting accounts (parent hierarchy applied).`)
}

seed().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => p.$disconnect())

