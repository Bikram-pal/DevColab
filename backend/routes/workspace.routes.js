import { Router } from 'express';
import auth from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import {
  changeMemberRole,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listMembers,
  listWorkspaces,
  removeMember,
  updateWorkspace,
  upgradeWorkspace,
} from '../controllers/workspace.controller.js';

const router = Router();
router.use(auth);
router.post('/', createWorkspace);
router.get('/', listWorkspaces);
router.get('/:workspaceId', requireRole('viewer'), getWorkspace);
router.put('/:workspaceId', requireRole('admin'), updateWorkspace);
router.post('/:workspaceId/upgrade', requireRole('admin'), upgradeWorkspace);
router.delete('/:workspaceId', requireRole('owner'), deleteWorkspace);
router.get('/:workspaceId/members', requireRole('viewer'), listMembers);
router.put('/:workspaceId/members/:userId/role', requireRole('admin'), changeMemberRole);
router.delete('/:workspaceId/members/:userId', requireRole('admin'), removeMember);
export default router;
