/**
 * Activate Ethiopian VAT (15%) + Withholding (3%) switches in the Setting
 * table so the New Sale summary, receipts and the backend calculate them for
 * real. Equivalent to Settings → Ethiopian Finance →
 *   VAT Registered = Enabled, Withholding Enabled = Enabled
 * (you can also toggle them in the UI instead of running this script).
 *
 * SAFETY: writes only the two Setting rows. No schema change, no migration,
 * no business data touched. Rates (15 / 3) are left exactly as configured.
 *
 * Revert: set both values back to 'false'.
 * Run from server/:  node scripts/activate-tax-settings.mjs --direct
 */
import prisma from '../src/config/prisma.js'

const TARGETS = [
  { key: 'ethiopia_vat_registered', value: 'true', type: 'boolean' },
  { key: 'ethiopia_withholding_enabled', value: 'true', type: 'boolean' }
]

async function readTaxSettings() {
  const keys = [
    'ethiopia_vat_registered', 'ethiopia_vat_rate', 'ethiopia_vat_inclusive',
    'ethiopia_withholding_enabled', 'ethiopia_withholding_rate'
  ]
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

try {
  console.log('before:', JSON.stringify(await readTaxSettings()))

  for (const t of TARGETS) {
    await prisma.setting.upsert({
      where: { key: t.key },
      update: { value: t.value, type: t.type },
      create: { key: t.key, value: t.value, type: t.type }
    })
  }

  const after = await readTaxSettings()
  console.log('after: ', JSON.stringify(after))
  console.log('VAT active:', after.ethiopia_vat_registered === 'true' && Number(after.ethiopia_vat_rate) > 0)
  console.log('Withholding active:', after.ethiopia_withholding_enabled === 'true' && Number(after.ethiopia_withholding_rate) > 0)
  console.log('(rates unchanged — VAT', after.ethiopia_vat_rate + '%, withholding', after.ethiopia_withholding_rate + '%)')
} finally {
  await prisma.$disconnect()
}
