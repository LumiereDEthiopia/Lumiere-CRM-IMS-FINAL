/**
 * Brand Routes
 * /api/brands
 */
import { Router } from 'express'
import {
  listBrands, getBrand, createBrand, updateBrand, deleteBrand
} from '../controllers/brandController.js'

const router = Router()

router.route('/')
  .get(listBrands)
  .post(createBrand)

router.route('/:id')
  .get(getBrand)
  .put(updateBrand)
  .delete(deleteBrand)

export { router as brandRouter }
export default router