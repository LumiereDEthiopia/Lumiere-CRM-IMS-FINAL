/**
 * TinVerifier — reusable Ethiopian TIN verification widget.
 *
 * Calls the app's own backend (POST /api/tin/verify); the backend talks to
 * the official eTrade Business License Checker. The browser never contacts
 * eTrade directly and sees no implementation details.
 *
 * Props:
 *  - tin            current TIN string (owned by the parent form)
 *  - onResult       (result | null) => void — fires with the API result when
 *                   verification succeeds/fails, or null when the state resets
 *  - customerId     optional customer id to attach the verification to
 *  - autoVerify     verify automatically once the TIN has 10 digits (default true)
 *  - disabled       disable the whole widget (e.g. while saving)
 */
import { useEffect, useState } from 'react'
import api from '../services/api.js'

const TIN_PATTERN = /^\d{10}$/

export default function TinVerifier({ tin, onResult, customerId, autoVerify = true, disabled = false }) {
  const [status, setStatus] = useState('idle') // idle | verifying | verified | not_found | unavailable | invalid
  const [result, setResult] = useState(null)
  const [message, setMessage] = useState('')

  const digits = String(tin || '').replace(/\D/g, '')
  const formatOk = TIN_PATTERN.test(digits)

  const verify = async (isRetry = false) => {
    if (status === 'verifying' || disabled) return
    if (!digits) { setStatus('invalid'); setMessage('Enter a TIN to verify'); onResult?.(null); return }
    if (!formatOk) { setStatus('invalid'); setMessage('Invalid TIN format — an Ethiopian TIN must be exactly 10 digits'); onResult?.(null); return }

    setStatus('verifying')
    setMessage(isRetry ? 'Retrying…' : 'Verifying TIN…')
    try {
      const body = { tin: digits }
      if (customerId) body.customerId = customerId
      const res = await api.post('/api/tin/verify', body)
      setResult(res)
      if (res.success && res.verified) {
        setStatus('verified')
        setMessage(res.cached ? `✓ TIN Verified — ${res.name} (from cache)` : `✓ TIN Verified — ${res.name}`)
        onResult?.(res)
      } else if (res.success && !res.verified) {
        setStatus('not_found')
        setMessage(res.message || 'TIN not found')
        onResult?.(res)
      } else {
        setStatus('unavailable')
        setMessage(res.message || 'Unable to verify TIN right now. Please try again.')
        onResult?.(null)
      }
    } catch (e) {
      setResult(null)
      onResult?.(null)
      // Friendly, non-technical messages only — never raw backend/upstream errors
      // (every signed-in role may verify — the API has no permission gate)
      if (e.status === 429) {
        setStatus('unavailable')
        setMessage('Too many verification attempts — please wait a minute and try again.')
      } else if (e.status === 400) {
        setStatus('invalid')
        setMessage(e.message || 'Invalid TIN format — an Ethiopian TIN must be exactly 10 digits')
      } else {
        setStatus('unavailable')
        setMessage('Unable to verify TIN right now. Please try again.')
      }
    }
  }

  // Optional auto-verification once 10 digits are entered
  useEffect(() => {
    if (!autoVerify || disabled) return
    if (TIN_PATTERN.test(digits) && status === 'idle') verify()
    if (!digits && status !== 'idle' && status !== 'verifying') { setStatus('idle'); setMessage(''); setResult(null); onResult?.(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, autoVerify, disabled])

  const reset = () => {
    setStatus('idle'); setMessage(''); setResult(null); onResult?.(null)
  }

  const busy = status === 'verifying'
  const buttonDisabled = disabled || busy || !formatOk
  const statusColor = { verified: '#2E7D32', unavailable: '#E65100', not_found: '#C62828', invalid: '#C62828' }
  const isColor = statusColor[status] || '#C62828'
  // 'not_found' cannot be retried into success — only an upstream outage gets a
  // Retry button.
  const showRetry = status === 'unavailable'
  const showClear = status === 'verified' || status === 'not_found' || status === 'unavailable' || status === 'invalid'

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => verify()}
          disabled={buttonDisabled}
          style={{ whiteSpace: 'nowrap', padding: '0.45rem 0.9rem' }}
          title={formatOk || !digits ? 'Verify TIN with eTrade' : 'TIN must be exactly 10 digits'}
        >
          {busy ? 'Verifying…' : status === 'verified' ? 'Re-verify' : 'Verify TIN'}
        </button>
        {showClear && (
          <button type="button" onClick={reset} style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', fontSize: '0.8rem' }}>Clear</button>
        )}
      </div>
      {status !== 'idle' && message && (
        <div role="status" style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: isColor, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {busy && <span className="spinner" style={{ width: '12px', height: '12px' }} />}
          <span>{message}</span>
          {showRetry && (
            <button type="button" onClick={() => verify(true)} disabled={busy} style={{ background: '#FFF3E0', border: '1px solid #FFB74D', color: '#E65100', borderRadius: '4px', padding: '0.15rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}>Retry</button>
          )}
        </div>
      )}
    </div>
  )
}
