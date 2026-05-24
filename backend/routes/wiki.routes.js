import { Router } from 'express';
import auth from '../middleware/auth.js';
import { requireProjectRole } from '../middleware/role.js';
import { createPage, deletePage, getPage, listPages, listVersions, restoreVersion, updatePage } from '../controllers/wiki.controller.js';

const router = Router();
router.use(auth);

router.post('/', requireProjectRole('member'), createPage);
router.get('/project/:projectId', requireProjectRole('viewer'), listPages);
router.get('/:pageId', requireProjectRole('viewer'), getPage);
router.put('/:pageId', requireProjectRole('member'), updatePage);
router.delete('/:pageId', requireProjectRole('member'), deletePage);
router.get('/:pageId/versions', requireProjectRole('viewer'), listVersions);
router.post('/:pageId/restore', requireProjectRole('member'), restoreVersion);

export default router;
