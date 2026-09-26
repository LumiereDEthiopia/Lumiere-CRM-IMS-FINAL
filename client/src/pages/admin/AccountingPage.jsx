/**
 * Accounting Reports — 4 standard reports inside Admin → Reports.
 * All totals are computed server-side; the frontend only renders.
 * Matches the existing Lumière admin UI (admin-styles.css classes).
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../services/api.js'
import { etb } from '../../lib/currency.js'
import './admin-styles.css'
import './accounting-styles.css'

const REPORTS = {
  'trial-balance': { name: 'Trial Balance', description: 'Verify debit and credit balances', icon: '⚖️' },
  'income-statement': { name: 'Income Statement', description: 'View revenue, expenses and profit', icon: '📈' },
  'balance-sheet': { name: 'Balance Sheet', description: 'View assets, liabilities and equity', icon: '🏛️' },
  'cash-flow': { name: 'Cash Flow Statement', description: 'View cash inflows and outflows', icon: '💵' }
}

const QUICK_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' }
]

const iso = (d) => d.toISOString().slice(0, 10)

function rangeFor(key) {
  const now = new Date()
  const to = iso(now)
  switch (key) {
    case 'today': return { dateFrom: to, dateTo: to }
    case 'week': {
      const start = new Date(now)
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      return { dateFrom: iso(start), dateTo: to }
    }
    case 'month': return { dateFrom: iso(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: to }
    case 'lastMonth': return { dateFrom: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), dateTo: iso(new Date(now.getFullYear(), now.getMonth(), 0)) }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      return { dateFrom: iso(new Date(now.getFullYear(), q * 3, 1)), dateTo: to }
    }
    case 'year': return { dateFrom: iso(new Date(now.getFullYear(), 0, 1)), dateTo: to }
    default: return null
  }
}

const defaults = rangeFor('month')

function fmtDate(v) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function AccountingPage() {
  const { report } = useParams()
  const navigate = useNavigate()
  const active = report && REPORTS[report] ? report : null

  const [filters, setFilters] = useState({ dateFrom: defaults.dateFrom, dateTo: defaults.dateTo, accountType: '', accountId: '' })
  const [data, setData] = useState(null)
  const [company, setCompany] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/reports/accounting/company').then((r) => setCompany(r.data?.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (active === 'trial-balance') {
      api.get('/api/reports/accounting/accounts').then((r) => setAccounts(r.data?.data || [])).catch(() => {})
    }
  }, [active])

  const load = useCallback(async () => {
    if (!active) return
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams()
      if (filters.dateFrom) q.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) q.set('dateTo', filters.dateTo)
      if (filters.accountType) q.set('accountType', filters.accountType)
      if (filters.accountId) q.set('accountId', filters.accountId)
      const r = await api.get(`/api/reports/accounting/${active}?${q}`)
      setData(r.data?.data)
    } catch (e) {
      setError(e.message || 'Failed to load report')
      setData(null)
    }
    setLoading(false)
  }, [active, filters])

  useEffect(() => {
    if (!active) { setData(null); return }
    load()
  }, [active, load])

  function applyQuick(key) {
    const range = rangeFor(key)
    if (range) setFilters((f) => ({ ...f, ...range }))
  }

  function exportExcel() {
    const q = new URLSearchParams()
    if (filters.dateFrom) q.set('dateFrom', filters.dateFrom)
    if (filters.dateTo) q.set('dateTo', filters.dateTo)
    if (filters.accountType) q.set('accountType', filters.accountType)
    if (filters.accountId) q.set('accountId', filters.accountId)
    const token = localStorage.getItem('auth_token')
    fetch(`${api.url('/api')}/reports/accounting/${active}/export?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error('Export failed')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${active}-${filters.dateFrom || 'all'}-to-${filters.dateTo || 'today'}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch((e) => setError(e.message))
  }

  if (!active) return <AccountingHome />

  const meta = REPORTS[active]
  return (
    <div className="dashboard-container accounting-print-area">
      <div className="page-header-row">
        <div>
          <Link to="/admin/reports/accounting" className="back-link">← Reports</Link>
          <h2 className="page-title">{meta.name}</h2>
          <p className="page-subtitle">{meta.description}</p>
        </div>
        <div className="header-actions no-print">
          <button type="button" className="btn btn-secondary" onClick={load}>Refresh</button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print / PDF</button>
          <button type="button" className="btn btn-primary" onClick={exportExcel}>Export Excel</button>
        </div>
      </div>

      <div className="card no-print">
        <div className="filter-row">
          <div className="form-field">
            <label htmlFor="acc-from">Date From</label>
            <input id="acc-from" type="date" value={filters.dateFrom || ''} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          </div>
          <div className="form-field">
            <label htmlFor="acc-to">Date To</label>
            <input id="acc-to" type="date" value={filters.dateTo || ''} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          </div>
          <div className="quick-filters">
            {QUICK_RANGES.map((r) => (
              <button key={r.key} type="button" className="btn-quick" onClick={() => applyQuick(r.key)}>{r.label}</button>
            ))}
          </div>
          {active === 'trial-balance' && (
            <>
              <div className="form-field">
                <label htmlFor="acc-type">Account Type</label>
                <select id="acc-type" value={filters.accountType} onChange={(e) => setFilters((f) => ({ ...f, accountType: e.target.value, accountId: '' }))}>
                  <option value="">All Types</option>
                  {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((t) => (
                    <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="acc-account">Account</label>
                <select id="acc-account" value={filters.accountId} onChange={(e) => setFilters((f) => ({ ...f, accountId: e.target.value }))}>
                  <option value="">All Accounts</option>
                  {accounts
                    .filter((a) => !filters.accountType || a.type === filters.accountType)
                    .map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {company && (
        <div className="report-header">
          <h3 className="report-company">{company.name}</h3>
          <p className="report-meta">Accounting Report — {meta.name}</p>
          <p className="report-meta">Period: {fmtDate(filters.dateFrom)} – {fmtDate(filters.dateTo)}</p>
          <p className="report-meta">Generated: {new Date().toLocaleString()} · Currency: {company.currency || 'ETB'}</p>
        </div>
      )}

      {loading && <div className="loading-container"><div className="spinner" /><span>Loading report…</span></div>}
      {error && <div className="card"><p className="empty-text" style={{ color: '#c0392b' }}>{error}</p></div>}

      {!loading && !error && data && (
        <>
          {active === 'trial-balance' && <TrialBalance data={data} />}
          {active === 'income-statement' && <IncomeStatement data={data} />}
          {active === 'balance-sheet' && <BalanceSheet data={data} />}
          {active === 'cash-flow' && <CashFlow data={data} />}
        </>
      )}

      {!loading && !error && !data && active && <p className="empty-text">No data for the selected period.</p>}
    </div>
  )
}

/* ---------------- Report renderers ---------------- */

function Table({ columns, rows, footer }) {
  if (!rows?.length) return <p className="empty-text">No data for the selected period.</p>
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead><tr>{columns.map((c) => <th key={c.label} className={`th ${c.align === 'right' ? 'num' : ''}`}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`tr ${row.className || ''}`}>
              {columns.map((c) => (
                <td key={c.label} className={`td ${c.align === 'right' ? 'num' : ''}`}>{c.render ? c.render(row) : row[c.key] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot><tr>{footer.map((cell, i) => <td key={i} className={`td footer-cell ${i > 0 ? 'num' : ''}`}>{cell}</td>)}</tr></tfoot>}
      </table>
    </div>
  )
}

function TotalRow({ label, value, strong }) {
  return (
    <div className={`total-row ${strong ? 'grand' : ''}`}>
      <span>{label}</span>
      <span className="num">{etb(value, { withCode: true })}</span>
    </div>
  )
}

function TrialBalance({ data }) {
  const rows = data.rows.map((r) => ({ ...r, typeName: r.type.charAt(0) + r.type.slice(1).toLowerCase() }))
  const imbalanced = Math.abs(data.totals.difference) >= 0.01
  return (
    <div className="card">
      <h3 className="card-title">Trial Balance</h3>
      <Table
        columns={[
          { label: 'Account Code', key: 'code' },
          { label: 'Name', key: 'name' },
          { label: 'Type', key: 'typeName' },
          { label: 'Opening', align: 'right', render: (r) => etb(r.opening) },
          { label: 'Debit', align: 'right', render: (r) => etb(r.debit) },
          { label: 'Credit', align: 'right', render: (r) => etb(r.credit) },
          { label: 'Closing Debit', align: 'right', render: (r) => etb(r.closingDebit) },
          { label: 'Closing Credit', align: 'right', render: (r) => etb(r.closingCredit) }
        ]}
        rows={rows}
        footer={['Totals', '', '', etb(data.totals.openingDebit || 0), etb(data.totals.debit), etb(data.totals.credit), etb(data.totals.closingDebit), etb(data.totals.closingCredit)]}
      />
      <div className={`balance-check ${imbalanced ? 'bad' : 'good'}`}>
        Total Debit: {etb(data.totals.debit, { withCode: true })} · Total Credit: {etb(data.totals.credit, { withCode: true })} · Difference: {etb(data.totals.difference, { withCode: true })}
        {imbalanced ? ' — IMBALANCED, investigate the ledger' : ' — Balanced ✓'}
      </div>
    </div>
  )
}

function SectionList({ title, items, totalLabel }) {
  return (
    <>
      {title && <h4 className="section-title">{title}</h4>}
      <Table
        columns={[{ label: 'Account', key: 'name' }, { label: 'Code', key: 'code' }, { label: 'Amount', align: 'right', render: (r) => etb(r.amount) }]}
        rows={items || []}
      />
      {totalLabel !== undefined && <TotalRow label={totalLabel} value={items?.reduce((s, x) => s + Number(x.amount || 0), 0) || 0} strong />}
    </>
  )
}

function IncomeStatement({ data }) {
  const t = data.totals
  return (
    <div className="card">
      <h3 className="card-title">Income Statement</h3>
      <SectionList title="Revenue" items={data.revenue} totalLabel="Total Revenue" />
      <SectionList title="Cost of Goods Sold" items={data.cogs} totalLabel="Total COGS" />
      <TotalRow label="Gross Profit" value={t.grossProfit} />
      <SectionList title="Operating Expenses" items={data.opex} totalLabel="Total Operating Expenses" />
      <TotalRow label="Operating Profit" value={t.operatingProfit} strong />
      <SectionList title="Other Income" items={data.otherIncome} />
      <SectionList title="Other Expenses" items={data.otherExpenses} totalLabel="Total Other Expenses" />
      <TotalRow label="Profit Before Tax" value={t.profitBeforeTax} />
      <SectionList items={[{ name: 'Income Tax', amount: t.tax }]} />
      <TotalRow label={t.netProfit >= 0 ? 'Net Profit' : 'Net Loss'} value={t.netProfit} strong />
      <div className="balance-check good">
        Revenue ({etb(t.totalRevenue, { withCode: true })}) − COGS ({etb(t.totalCogs, { withCode: true })}) − Expenses ({etb(t.totalOpex + t.totalOtherExpenses, { withCode: true })}) − Tax ({etb(t.tax, { withCode: true })}) = Net Profit {etb(t.netProfit, { withCode: true })}
      </div>
    </div>
  )
}

function BalanceSheet({ data }) {
  const t = data.totals
  const ok = Math.abs(t.balanceDifference) < 0.01
  const line = (x) => ({ name: x.name, code: x.code, amount: x.amount })
  return (
    <div className="card">
      <h3 className="card-title">Balance Sheet — as of {fmtDate(data.asOf)}</h3>
      <h4 className="section-title">Assets</h4>
      <SectionList title="Current Assets" items={[
        ...data.assets.cashAndBank.map(line), ...data.assets.accountsReceivable.map(line), ...data.assets.inventory.map(line), ...data.assets.otherCurrent.map(line)
      ]} />
      <SectionList title="Non-Current Assets" items={data.assets.fixedAssets.map(line)} />
      <TotalRow label="Total Assets" value={t.totalAssets} strong />
      <h4 className="section-title">Liabilities</h4>
      <SectionList title="Current Liabilities" items={[
        ...data.liabilities.accountsPayable.map(line), ...data.liabilities.taxesPayable.map(line), ...data.liabilities.otherCurrent.map(line)
      ]} />
      <SectionList title="Non-Current Liabilities" items={data.liabilities.loans.map(line)} />
      <TotalRow label="Total Liabilities" value={t.totalLiabilities} strong />
      <h4 className="section-title">Equity</h4>
      <SectionList items={[
        ...data.equity.baseEquity.map(line), ...data.equity.ownerCapital.map(line),
        ...data.equity.ownerDrawings.map((x) => ({ ...line(x), amount: -x.amount })),
        ...data.equity.retainedEarnings.map(line),
        { name: 'Current Year Profit / (Loss)', code: '', amount: data.equity.currentYearProfit }
      ]} />
      <TotalRow label="Total Equity" value={t.totalEquity} strong />
      <TotalRow label="Total Liabilities + Equity" value={t.totalLiabilitiesEquity} strong />
      <div className={`balance-check ${ok ? 'good' : 'bad'}`}>
        Assets ({etb(t.totalAssets, { withCode: true })}) = Liabilities ({etb(t.totalLiabilities, { withCode: true })}) + Equity ({etb(t.totalEquity, { withCode: true })})
        {ok ? ' — Balanced ✓' : ` — Difference: ${etb(t.balanceDifference, { withCode: true })}`}
      </div>
    </div>
  )
}

function CashFlow({ data }) {
  const t = data.totals
  return (
    <div className="card">
      <h3 className="card-title">Cash Flow Statement</h3>
      <SectionList title="Operating Activities" items={data.operating} totalLabel="Net Operating" />
      <SectionList title="Investing Activities" items={data.investing} totalLabel="Net Investing" />
      <SectionList title="Financing Activities" items={data.financing} totalLabel="Net Financing" />
      <TotalRow label="Net Change in Cash" value={t.netChange} strong />
      <TotalRow label="Opening Cash" value={t.openingCash} />
      <TotalRow label="Closing Cash" value={t.closingCash} strong />
      <div className={`balance-check ${Math.abs(t.openingCash + t.netChange - t.closingCash) < 0.01 ? 'good' : 'bad'}`}>
        Opening ({etb(t.openingCash, { withCode: true })}) + Net Change ({etb(t.netChange, { withCode: true })}) = Closing ({etb(t.closingCash, { withCode: true })})
      </div>
    </div>
  )
}

/* ---------------- Landing (4 cards) ---------------- */

function AccountingHome() {
  const navigate = useNavigate()
  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 className="page-title">Accounting</h2>
          <p className="page-subtitle">Standard accounting reports built from the Lumière ledger</p>
        </div>
      </div>
      <div className="card-grid">
        {Object.entries(REPORTS).map(([key, r]) => (
          <div key={key} className="card accounting-card">
            <div className="accounting-icon" aria-hidden="true">{r.icon}</div>
            <h3 className="card-title">{r.name}</h3>
            <p className="page-subtitle">{r.description}</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate(`/admin/reports/accounting/${key}`)}>View Report</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AccountingPage

