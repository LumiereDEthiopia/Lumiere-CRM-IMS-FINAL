import { Router } from 'express'
import { createNewBackup, getBackups, getBackupStatus } from '../controllers/backupController.js'
const router = Router()
router.route('/').get(getBackups).post(createNewBackup)
router.get('/health', getBackupStatus)
export { router as backupRouter }
export default router