/**
 * Fragrance Notes Management Page with Group/Sub-Group Hierarchy
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Modal from '../../components/Modal.jsx'
import './admin-styles.css'

function NotesPage() {
  const [notes, setNotes] = useState([])
  const [groups, setGroups] = useState([])
  const [subGroups, setSubGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedSubGroup, setSelectedSubGroup] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    imageUrl: '',
    groupId: '',
    subGroupId: '',
    examples: '',
    color: '',
    status: 'active',
    keywords: ''
    })

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sortBy: 'name' })
      if (search) params.set('search', search)
      if (selectedGroup) params.set('group', selectedGroup)
      if (selectedSubGroup) params.set('subGroup', selectedSubGroup)
      const res = await api.get(`/api/notes?${params}`)
      setNotes(res.data)
    } catch (e) {
      alert(e.message || 'Failed to fetch notes')
    }
    setLoading(false)
  }, [search, selectedGroup, selectedSubGroup])

  const fetchGroups = useCallback(async () => {
    try {
      const res = await api.get('/api/notes/groups')
      setGroups(res.data)
    } catch (e) {
      console.error('Failed to fetch groups:', e)
    }
  }, [])

  const fetchSubGroups = useCallback(async (groupId) => {
    if (!groupId) {
      setSubGroups([])
      return
    }
    try {
      const res = await api.get(`/api/notes/groups/${groupId}/subgroups`)
      setSubGroups(res.data)
    } catch (e) {
      console.error('Failed to fetch sub-groups:', e)
      setSubGroups([])
    }
  }, [])

  useEffect(() => {
    fetchSubGroups(selectedGroup)
  }, [selectedGroup, fetchSubGroups])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  useEffect(() => {
    fetchGroups()
    }, [fetchGroups])

  const openCreate = () => {
    setEditing(null)
    setForm({
      name: '',
      slug: '',
      description: '',
      imageUrl: '',
      groupId: selectedGroup || '',
      subGroupId: '',
      examples: '',
      color: '',
      status: 'active',
      keywords: ''
    })
    setShowModal(true)
  }

  const openEdit = (n) => {
    setEditing(n)
    setForm({
      name: n.name || '',
      slug: n.slug || '',
      description: n.description || '',
      imageUrl: n.imageUrl || '',
      groupId: n.groupId || '',
      subGroupId: n.subGroupId || '',
      examples: n.examples || '',
      color: n.color || '',
      status: n.status || 'active',
      keywords: n.keywords || ''
    })
    if (n.groupId) {
      setSelectedGroup(n.groupId)
      fetchSubGroups(n.groupId)
    } else {
      setSelectedGroup('')
      setSubGroups([])
    }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.slug) {
      alert('Name and slug are required')
      return
    }
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        description: form.description,
        imageUrl: form.imageUrl,
        groupId: form.groupId || null,
        subGroupId: form.subGroupId || null,
        examples: form.examples,
        color: form.color,
        status: form.status,
        keywords: form.keywords
      }
      if (editing) {
        await api.put(`/api/notes/${editing.id}`, payload)
      } else {
        await api.post('/api/notes', payload)
      }
      setShowModal(false)
      fetchNotes()
      fetchGroups()
    } catch (e) {
      alert(e.message || 'Failed to save note')
    }
  }

  const handleDelete = async (id) => {
    const note = notes.find(n => n.id === id)
    if (note && note._count?.productNotes > 0) {
      if (!confirm(`This note is used in ${note._count.productNotes} product(s). Are you sure you want to delete it?`)) {
        return
      }
    } else {
      if (!confirm('Delete this note?')) return
    }
    try {
      await api.delete(`/api/notes/${id}`)
      fetchNotes()
            fetchGroups()
    } catch (e) {
      alert(e.message || 'Failed to delete note')
    }
  }

  const cols = useMemo(() => [
    {
      key: 'name',
      label: 'Name',
      render: (name, row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 500 }}>{name}</span>
          {row.group && (
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {row.group.groupCode} • {row.subGroup?.subGroupCode}
            </span>
          )}
        </div>
      )
    },
    { key: 'slug', label: 'Slug' },
    { key: 'color', label: 'Color', width: '100px', align: 'center', render: (c) => c ? <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', backgroundColor: c, border: '1px solid #ccc' }}></span> : '-' },
    { key: 'status', label: 'Status', width: '90px', align: 'center', render: (s) => <span className={`badge ${s === 'inactive' ? 'badge-gray' : 'badge-green'}`}>{s || 'active'}</span> },
    { key: 'examples', label: 'Examples' },
    { key: '_count', label: 'Used In', width: '80px', align: 'center', render: (c) => c?.productNotes || 0 },
    {
      key: 'actions',
      label: '',
      width: '100px',
      align: 'center',
      render: (_, row) => (
        <div className="action-buttons">
          <button className="btn-edit" onClick={() => openEdit(row)}>Edit</button>
          <button className="btn-danger-outline" onClick={() => handleDelete(row.id)}>Del</button>
        </div>
      )
    }
    ], [notes])

  return (
    <div>
      <div className="page-toolbar">
        <input type="text" placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <select value={selectedGroup} onChange={(e) => { setSelectedGroup(e.target.value); setSelectedSubGroup('') }} className="filter-select">
          <option value="">All Groups</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.groupCode} - {g.groupName}</option>
          ))}
        </select>
        <select value={selectedSubGroup} onChange={(e) => setSelectedSubGroup(e.target.value)} className="filter-select" disabled={!selectedGroup}>
          <option value="">All Sub-Groups</option>
          {subGroups.map(sg => (
            <option key={sg.id} value={sg.id}>{sg.subGroupCode} - {sg.subGroupName}</option>
          ))}
        </select>
        <button className="btn-primary" onClick={openCreate}>+ Add Note</button>
      </div>
      <DataTable columns={cols} data={notes} loading={loading} emptyMessage="No fragrance notes found" />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Note' : 'Create Note'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-field"><label>Slug *</label><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
            <div className="form-field"><label>Group</label><select value={form.groupId} onChange={(e) => { setForm({ ...form, groupId: e.target.value, subGroupId: '' }); fetchSubGroups(e.target.value) }} className="filter-select">
              <option value="">Select Group</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.groupCode} - {g.groupName}</option>
              ))}
            </select></div>
            <div className="form-field"><label>Sub-Group</label><select value={form.subGroupId} onChange={(e) => setForm({ ...form, subGroupId: e.target.value })} className="filter-select" disabled={!form.groupId}>
              <option value="">Select Sub-Group</option>
              {subGroups.map(sg => (
                <option key={sg.id} value={sg.id}>{sg.subGroupCode} - {sg.subGroupName}</option>
              ))}
            </select></div>
            <div className="form-field full-width"><label>Examples / Aliases</label><input value={form.examples} onChange={(e) => setForm({ ...form, examples: e.target.value })} placeholder="e.g. Bergamot, Citrus aurantium" /></div>
            <div className="form-field"><label>Color</label><input type="color" value={form.color || '#000000'} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
            <div className="form-field"><label>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="filter-select">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select></div>
            <div className="form-field"><label>Keywords</label><input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="comma, separated, keywords" /></div>
            <div className="form-field full-width"><label>Description</label><textarea style={{ minHeight: '60px' }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="form-field full-width"><label>Image URL</label><input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-save" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>
    </div>
  )
}

export default NotesPage