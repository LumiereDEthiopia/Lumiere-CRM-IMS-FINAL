/**
 * Category Routes
 * /api/categories
 */
import { Router } from 'express'
import {
  listCategories, getCategory, createCategory, updateCategory, deleteCategory
} from '../controllers/categoryController.js'

const router = Router()

router.route('/')
  .get(listCategories)
  .post(createCategory)

router.route('/:id')
  .get(getCategory)
  .put(updateCategory)
  .delete(deleteCategory)

export { router as categoryRouter }
export default router