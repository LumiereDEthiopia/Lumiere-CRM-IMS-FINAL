/**
 * Accord Routes
 * /api/accords
 */
import { Router } from 'express'
import {
  listAccords, getAccord, createAccord, updateAccord, deleteAccord
} from '../controllers/accordController.js'

const router = Router()

router.route('/')
  .get(listAccords)
  .post(createAccord)

router.route('/:id')
  .get(getAccord)
  .put(updateAccord)
  .delete(deleteAccord)

export { router as accordRouter }
export default router