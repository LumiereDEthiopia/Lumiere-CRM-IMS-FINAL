/**
 * Reusable Data Table Component
 */
function DataTable({
  columns,
  data,
  keyField = 'id',
  onRowClick,
  selectedIds = [],
  onSelectAll,
  onSelectRow,
  loading = false,
  emptyMessage = 'No data found'
}) {
  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <span style={styles.loadingText}>Loading...</span>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div style={styles.emptyContainer}>
        <span style={styles.emptyText}>{emptyMessage}</span>
      </div>
    )
  }

  const allSelected = selectedIds.length === data.length && data.length > 0

  return (
    <div style={styles.tableWrapper}>
      <table style={styles.table}>
        <thead>
          <tr style={styles.headerRow}>
            {onSelectRow && (
              <th style={{ ...styles.th, width: '40px' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectAll?.(e.target.checked, data)}
                  style={styles.checkbox}
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  ...styles.th,
                  width: col.width,
                  textAlign: col.align || 'left'
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={row[keyField] || rowIndex}
              style={{
                ...styles.tr,
                ...(onRowClick ? styles.trClickable : {})
              }}
              onClick={() => onRowClick?.(row)}
            >
              {onSelectRow && (
                <td style={styles.td}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row[keyField])}
                    onChange={(e) => onSelectRow(row[keyField], e.target.checked)}
                    style={styles.checkbox}
                  />
                </td>
              )}
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    ...styles.td,
                    textAlign: col.align || 'left'
                  }}
                >
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const styles = {
  tableWrapper: {
    background: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e8e8e8',
    overflow: 'hidden'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem'
  },
  headerRow: {
    background: '#fafafa',
    borderBottom: '1px solid #e8e8e8'
  },
  th: {
    padding: '0.75rem 1rem',
    fontWeight: 600,
    color: '#6b6b6b',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #e8e8e8'
  },
  tr: {
    borderBottom: '1px solid #f0f0f0',
    transition: 'background 0.1s ease'
  },
  trClickable: {
    cursor: 'pointer'
  },
  td: {
    padding: '0.75rem 1rem',
    color: '#1a1a1a',
    verticalAlign: 'middle'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem',
    gap: '1rem'
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e8e8e8',
    borderTopColor: '#c9a96e',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  loadingText: {
    color: '#9a9a9a',
    fontSize: '0.875rem'
  },
  emptyContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem',
    background: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e8e8e8'
  },
  emptyText: {
    color: '#9a9a9a',
    fontSize: '0.9rem'
  }
}

export default DataTable