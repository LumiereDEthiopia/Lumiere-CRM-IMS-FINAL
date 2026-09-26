/**
 * Settings Routes
 */
import { Router } from 'express'
import {
  listSettings, getSetting, updateSettings, updateSetting, deleteSetting
} from '../controllers/settingController.js'
import { requirePermission } from '../middleware/authorize.js'

const router = Router()

router.route('/')
  .get(listSettings)
  .put(requirePermission('setting:manage'), updateSettings)

router.route('/:key')
  .get(getSetting)
  .put(requirePermission('setting:manage'), updateSetting)
  .delete(requirePermission('setting:manage'), deleteSetting)

export { router as settingRouter }
export default router
