import Workspace from '../models/Workspace.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Snippet from '../models/Snippet.js';
import WikiPage from '../models/WikiPage.js';
import ActivityLog from '../models/ActivityLog.js';
import Notification from '../models/Notification.js';
import Invite from '../models/Invite.js';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fail, ok, message, slugify } from '../utils/http.js';
import logActivity from '../utils/logActivity.js';

export const createWorkspace = asyncHandler(async (req, res) => {
  const count = await Workspace.countDocuments({ 'members.userId': req.user.id });
  if (count >= 1) return fail(res, 'Free plan allows one workspace', 403, { upgrade: true });
  const name = req.body.name?.trim();
  if (!name) return fail(res, 'Workspace name is required', 422);
  const baseSlug = slugify(req.body.slug || name);
  const slug = baseSlug || `workspace-${Date.now()}`;
  const existing = await Workspace.findOne({ slug });
  if (existing) return fail(res, 'Workspace slug is already taken', 409);
  const workspace = await Workspace.create({
    name,
    slug,
    avatar: req.body.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff`,
    ownerId: req.user.id,
    members: [{ userId: req.user.id, role: 'owner' }],
  });
  await User.findByIdAndUpdate(req.user.id, { $addToSet: { workspaces: workspace._id } });
  await logActivity({ userId: req.user.id, workspaceId: workspace._id, action: 'member.joined', entityType: 'member', entityId: req.user.id, entityName: req.user.name });
  return ok(res, { workspace }, 201);
});

export const listWorkspaces = asyncHandler(async (req, res) => {
  const workspaces = await Workspace.find({ 'members.userId': req.user.id }).populate('members.userId', 'name email avatar role').populate('projectCount');
  return ok(res, { workspaces });
});

export const getWorkspace = asyncHandler(async (req, res) => {
  const workspace = await Workspace.findById(req.params.workspaceId).populate('members.userId', 'name email avatar bio skills').populate('projectCount');
  if (!workspace) return fail(res, 'Workspace not found', 404);
  return ok(res, { workspace });
});

export const updateWorkspace = asyncHandler(async (req, res) => {
  const update = {};
  ['name', 'avatar'].forEach((key) => { if (req.body[key] !== undefined) update[key] = req.body[key]; });
  if (req.body.slug) update.slug = slugify(req.body.slug);
  const workspace = await Workspace.findByIdAndUpdate(req.params.workspaceId, update, { new: true });
  if (!workspace) return fail(res, 'Workspace not found', 404);
  await logActivity({ userId: req.user.id, workspaceId: workspace._id, action: 'workspace.updated', entityType: 'project', entityId: workspace._id, entityName: workspace.name });
  return ok(res, { workspace });
});

export const upgradeWorkspace = asyncHandler(async (req, res) => {
  const workspace = await Workspace.findById(req.params.workspaceId);
  if (!workspace) return fail(res, 'Workspace not found', 404);
  workspace.plan = 'pro';
  await workspace.save();
  await logActivity({ userId: req.user.id, workspaceId: workspace._id, action: 'workspace.updated', entityType: 'project', entityId: workspace._id, entityName: `${workspace.name} upgraded to Pro` });
  return ok(res, { workspace });
});

export const deleteWorkspace = asyncHandler(async (req, res) => {
  const workspaceId = req.params.workspaceId;
  const projects = await Project.find({ workspaceId }).select('_id');
  const projectIds = projects.map((p) => p._id);
  await Promise.all([
    Task.deleteMany({ workspaceId }),
    Snippet.deleteMany({ projectId: { $in: projectIds } }),
    WikiPage.deleteMany({ projectId: { $in: projectIds } }),
    Project.deleteMany({ workspaceId }),
    ActivityLog.deleteMany({ workspaceId }),
    Notification.deleteMany({ link: new RegExp(workspaceId) }),
    Invite.deleteMany({ workspaceId }),
    User.updateMany({ workspaces: workspaceId }, { $pull: { workspaces: workspaceId } }),
    Workspace.findByIdAndDelete(workspaceId),
  ]);
  return message(res, 'Workspace deleted');
});

export const listMembers = asyncHandler(async (req, res) => {
  const workspace = await Workspace.findById(req.params.workspaceId).populate('members.userId', 'name email avatar bio skills githubUrl');
  if (!workspace) return fail(res, 'Workspace not found', 404);
  return ok(res, { members: workspace.members });
});

export const changeMemberRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member', 'viewer'].includes(role)) return fail(res, 'Invalid role', 422);
  const workspace = await Workspace.findById(req.params.workspaceId);
  const member = workspace?.members.find((item) => item.userId.toString() === req.params.userId);
  if (!member) return fail(res, 'Member not found', 404);
  if (member.role === 'owner') return fail(res, 'Owner role cannot be changed', 403);
  member.role = role;
  await workspace.save();
  await logActivity({ userId: req.user.id, workspaceId: workspace._id, action: 'member.role_changed', entityType: 'member', entityId: req.params.userId, entityName: role });
  return ok(res, { member });
});

export const removeMember = asyncHandler(async (req, res) => {
  const workspace = await Workspace.findById(req.params.workspaceId);
  const member = workspace?.members.find((item) => item.userId.toString() === req.params.userId);
  if (!member) return fail(res, 'Member not found', 404);
  if (member.role === 'owner') return fail(res, 'Owner cannot be removed', 403);
  workspace.members = workspace.members.filter((item) => item.userId.toString() !== req.params.userId);
  await workspace.save();
  await User.findByIdAndUpdate(req.params.userId, { $pull: { workspaces: workspace._id } });
  await logActivity({ userId: req.user.id, workspaceId: workspace._id, action: 'member.removed', entityType: 'member', entityId: req.params.userId });
  return message(res, 'Member removed');
});
