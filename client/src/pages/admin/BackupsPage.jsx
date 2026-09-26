/**
 * Backups Management Page
 */
import { useEffect, useState } from 'react'
import api from '../../services/api.js'
import './admin-styles.css'

function BackupsPage() {
  const [backups, setBackups] = useState([])
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [backupsRes, healthRes] = await Promise.all([api.get('/api/backups'), api.get('/api/backups/health')])
      setBackups(backupsRes.data); setHealth(healthRes.data)
    } catch (e) { alert(e.message) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleCreateBackup = async () => {
    setCreating(true)
    try { await api.post('/api/backups'); fetchData() }
    catch (e) { alert(e.message) }
    setCreating(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Health Status */}
      <div className="card">
        <h3 className="card-title">Backup Health</h3>
        {health && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
            <div><strong>R2 Available:</strong> <span style={{ color: health.r2Available ? '#2E7D32' : '#C62828' }}>{health.r2Available ? 'Yes' : 'No'}</span></div>
            <div><strong>Encryption:</strong> <span style={{ color: health.encryptionConfigured ? '#2E7D32' : '#C62828' }}>{health.encryptionConfigured ? 'Configured' : 'Missing'}</span></div>
            <div><strong>Enabled:</strong> <span>{health.backupEnabled ? 'Yes' : 'No'}</span></div>
            <div><strong>Total Backups:</strong> <span>{health.totalBackups}</span></div>
            <div><strong>Last Success:</strong> <span>{health.lastSuccessfulBackup ? new Date(health.lastSuccessfulBackup).toLocaleString() : 'Never'}</span></div>
            <div><strong>Last Failed:</strong> <span style={{ color: health.lastFailedBackup ? '#C62828' : '#6b6b6b' }}>{health.lastFailedBackup ? new Date(health.lastFailedBackup).toLocaleString() : 'None'}</span></div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button className="btn-primary" onClick={handleCreateBackup} disabled={creating}>{creating ? 'Creating...' : 'Create Backup Now'}</button>
        <span style={{ color: '#6b6b6b', fontSize: '0.85rem' }}>Backups are encrypted with AES-256-GCM and stored in Cloudflare R2</span>
      </div>

      {/* Backup List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead><tr><th className="th">Backup ID</th><th className="th">Status</th><th className="th">Size</th><th className="th">SHA-256</th><th className="th">Date</th></tr></thead>
          <tbody>
            {loading ? (<tr><td colSpan={5} className="td"><div className="spinner" style={{ margin: '1rem auto' }}></div></td></tr>) :
              backups.length === 0 ? (<tr><td colSpan={5} className="td"><p className="empty-text">No backups yet</p></td></tr>) :
              backups.map(b => (
                <tr key={b.id} className="tr">
                  <td className="td"><code style={{ fontSize: '0.7rem' }}>{b.backupId?.substring(0, 20)}...</code></td>
                  <td className="td"><span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: b.status === 'SUCCESS' ? '#E8F5E9' : '#FFEBEE', color: b.status === 'SUCCESS' ? '#2E7D32' : '#C62828' }}>{b.status}</span></td>
                  <td className="td">{b.encryptedSize ? `${(b.encryptedSize / 1024 / 1024).toFixed(2)} MB` : '-'}</td>
                  <td className="td"><code style={{ fontSize: '0.65rem' }}>{b.sha256?.substring(0, 12)}...</code></td>
                  <td className="td">{new Date(b.timestamp).toLocaleString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default BackupsPage