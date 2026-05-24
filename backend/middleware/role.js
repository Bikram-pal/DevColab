import Workspace from '../models/Workspace.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Snippet from '../models/Snippet.js';
import WikiPage from '../models/WikiPage.js';
import logger from '../utils/logger.js';

const rank = { viewer: 1, member: 2, admin: 3, owner: 4 };

export const getWorkspaceRole = async (userId, workspaceId) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return null;
  const member = workspace.members.find((item) => item.userId.toString() === userId.toString());
  return member?.role || null;
};

export const resolveWorkspaceId = async (req) => {
  if (req.params.workspaceId || req.body.workspaceId) return req.params.workspaceId || req.body.workspaceId;
  const projectId = req.params.projectId || req.body.projectId;
  if (projectId) {
    const project = await Project.findById(projectId).select('workspaceId');
    return project?.workspaceId;
  }
  return null;
};

export const requireRole = (minRole) => async (req, res, next) => {
  try {
    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ success: false, message: 'workspaceId or projectId is required' });
    const role = await getWorkspaceRole(req.user.id, workspaceId);
    if (!role || rank[role] < rank[minRole]) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    req.workspaceRole = role;
    req.workspaceId = workspaceId.toString();
    next();
  } catch (error) {
    next(error);
  }
};

export const requireProjectRole = (minRole) => async (req, res, next) => {
  try {
    let projectId = req.params.projectId || req.body.projectId || req.query.projectId;

    if (!projectId) {
      if (req.params.taskId) {
        const task = await Task.findById(req.params.taskId).select('projectId');
        if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
        projectId = task.projectId;
      } else if (req.params.snippetId) {
        const snippet = await Snippet.findById(req.params.snippetId).select('projectId');
        if (!snippet) return res.status(404).json({ success: false, message: 'Snippet not found' });
        projectId = snippet.projectId;
      } else if (req.params.pageId) {
        const page = await WikiPage.findById(req.params.pageId).select('projectId');
        if (!page) return res.status(404).json({ success: false, message: 'Wiki page not found' });
        projectId = page.projectId;
      }
    }

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required for this action' });
    }

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const workspaceId = project.workspaceId;
    const wsRole = await getWorkspaceRole(req.user.id, workspaceId);

    let resolvedRole = null;

    if (wsRole === 'owner' || wsRole === 'admin') {
      resolvedRole = 'admin'; // Automatically upgrade workspace owners/admins to project admins
    } else {
      const projMember = project.members.find(m => m.userId.toString() === req.user.id.toString());
      if (projMember) {
        resolvedRole = projMember.role;
      }
    }

    if (!resolvedRole || rank[resolvedRole] < rank[minRole]) {
      return res.status(403).json({ success: false, message: 'Insufficient project permissions' });
    }

    req.projectRole = resolvedRole;
    req.projectId = projectId.toString();
    req.workspaceId = workspaceId.toString();
    req.workspaceRole = wsRole;
    next();
  } catch (error) {
    logger.error('requireProjectRole middleware error:', error);
    next(error);
  }
};

export default requireRole;
