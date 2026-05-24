import { Router } from 'express';
import auth from '../middleware/auth.js';
import { requireProjectRole } from '../middleware/role.js';
import { createSnippet, deleteSnippet, getSnippet, listSnippets, updateSnippet } from '../controllers/snippet.controller.js';

const router = Router();
router.use(auth);

router.post('/', requireProjectRole('member'), createSnippet);
router.get('/project/:projectId', requireProjectRole('viewer'), listSnippets);
router.get('/:snippetId', requireProjectRole('viewer'), getSnippet);
router.put('/:snippetId', requireProjectRole('member'), updateSnippet);
router.delete('/:snippetId', requireProjectRole('member'), deleteSnippet);

export default router;
