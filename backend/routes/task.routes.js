import { Router } from 'express';
import auth from '../middleware/auth.js';
import { requireProjectRole } from '../middleware/role.js';
import { uploadSingle } from '../middleware/upload.js';
import {
  addAttachment,
  addComment,
  createTask,
  deleteTask,
  getTask,
  listProjectTasks,
  moveTask,
  updateTask,
} from '../controllers/task.controller.js';

const router = Router();
router.use(auth);

router.post('/', requireProjectRole('member'), createTask);
router.get('/project/:projectId', requireProjectRole('viewer'), listProjectTasks);
router.get('/:taskId', requireProjectRole('viewer'), getTask);
router.put('/:taskId', requireProjectRole('member'), updateTask);
router.put('/:taskId/move', requireProjectRole('member'), moveTask);
router.delete('/:taskId', requireProjectRole('member'), deleteTask);
router.post('/:taskId/comments', requireProjectRole('member'), addComment);
router.post('/:taskId/attachments', requireProjectRole('member'), uploadSingle, addAttachment);

export default router;
