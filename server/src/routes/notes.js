/**
 * Fragrance Note Routes
 * /api/notes
 */
import { Router } from 'express'
import {
  listNotes, getNote, createNote, updateNote, deleteNote,
  listGroups, getGroup, getSubGroupsByGroup
} from '../controllers/noteController.js'

const router = Router()

// Group and Sub-Group endpoints
router.get('/groups', listGroups)
router.get('/groups/:groupId', getGroup)
router.get('/groups/:groupId/subgroups', getSubGroupsByGroup)

// Note CRUD endpoints
router.route('/')
  .get(listNotes)
  .post(createNote)

router.route('/:id')
  .get(getNote)
  .put(updateNote)
  .delete(deleteNote)

export { router as noteRouter }
export default router