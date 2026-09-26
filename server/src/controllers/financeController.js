import { listAccounts, getTrialBalance } from '../services/financeService.js'

export async function accounts(req, res, next) {
  try { res.json({ success: true, data: await listAccounts() }) } catch (error) { next(error) }
}

export async function trialBalance(req, res, next) {
  try { res.json({ success: true, data: await getTrialBalance(req.query) }) } catch (error) { next(error) }
}

export default { accounts, trialBalance }
