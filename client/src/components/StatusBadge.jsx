/**
 * Status Badge Component
 * Displays colored status indicators
 */
function StatusBadge({ status, type = 'order' }) {
  const getStyle = () => {
    if (type === 'order') {
      switch (status?.toUpperCase()) {
        case 'PENDING': return { background: '#FFF3E0', color: '#E65100' }
        case 'CONFIRMED': return { background: '#E3F2FD', color: '#1565C0' }
        case 'PROCESSING': return { background: '#F3E5F5', color: '#7B1FA2' }
        case 'SHIPPED': return { background: '#E8F5E9', color: '#2E7D32' }
        case 'DELIVERED': return { background: '#E8F5E9', color: '#1B5E20' }
        case 'CANCELLED': return { background: '#FFEBEE', color: '#C62828' }
        case 'REFUNDED': return { background: '#FFEBEE', color: '#B71C1C' }
        default: return { background: '#F5F5F5', color: '#616161' }
      }
    }
    if (type === 'payment') {
      switch (status?.toUpperCase()) {
        case 'PAID': return { background: '#E8F5E9', color: '#2E7D32' }
        case 'UNPAID': return { background: '#FFF3E0', color: '#E65100' }
        case 'PARTIAL': return { background: '#E3F2FD', color: '#1565C0' }
        case 'REFUNDED': return { background: '#FFEBEE', color: '#C62828' }
        default: return { background: '#F5F5F5', color: '#616161' }
      }
    }
    if (type === 'boolean') {
      return status
        ? { background: '#E8F5E9', color: '#2E7D32' }
        : { background: '#FFEBEE', color: '#C62828' }
    }
    return { background: '#F5F5F5', color: '#616161' }
  }

  const style = getStyle()

  return (
    <span style={{
      display: 'inline-block',
      padding: '0.2rem 0.6rem',
      borderRadius: '12px',
      fontSize: '0.7rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      ...style
    }}>
      {status || 'Unknown'}
    </span>
  )
}

export default StatusBadge