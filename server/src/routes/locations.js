import { Router } from 'express'
import { getLocations, createNewLocation, updateExistingLocation, deleteExistingLocation } from '../controllers/locationController.js'
const router = Router()
router.route('/').get(getLocations).post(createNewLocation)
router.route('/:id').put(updateExistingLocation).delete(deleteExistingLocation)
export { router as locationRouter }
export default router