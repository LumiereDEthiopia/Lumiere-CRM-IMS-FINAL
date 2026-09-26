/**
 * Reusable Pagination Component
 */
function Pagination({ page, totalPages, onPageChange, total }) {
  if (totalPages <= 1) return null

  const pages = []
  const maxVisible = 5
  let start = Math.max(1, page - Math.floor(maxVisible / 2))
  let end = Math.min(totalPages, start + maxVisible - 1)
  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1)
  }

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  return (
    <div style={styles.container}>
      <span style={styles.info}>
        Page {page} of {totalPages} {total ? `(${total} items)` : ''}
      </span>
      <div style={styles.buttons}>
        <button
          style={styles.btn}
          onClick={() => onPageChange(1)}
          disabled={page === 1}
        >
          First
        </button>
        <button
          style={styles.btn}
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          Prev
        </button>
        {start > 1 && <span style={styles.ellipsis}>...</span>}
        {pages.map((p) => (
          <button
            key={p}
            style={{
              ...styles.btn,
              ...(p === page ? styles.btnActive : {})
            }}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}
        {end < totalPages && <span style={styles.ellipsis}>...</span>}
        <button
          style={styles.btn}
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
        >
          Next
        </button>
        <button
          style={styles.btn}
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
        >
          Last
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 0',
    flexWrap: 'wrap',
    gap: '0.5rem'
  },
  info: {
    fontSize: '0.8rem',
    color: '#9a9a9a'
  },
  buttons: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem'
  },
  btn: {
    padding: '0.4rem 0.75rem',
    border: '1px solid #e8e8e8',
    borderRadius: '6px',
    background: '#ffffff',
    color: '#1a1a1a',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  btnActive: {
    background: '#1a1a2e',
    color: '#ffffff',
    borderColor: '#1a1a2e'
  },
  ellipsis: {
    color: '#9a9a9a',
    padding: '0 0.25rem'
  }
}

export default Pagination