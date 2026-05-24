import WikiPage from '../models/WikiPage.js';
import Project from '../models/Project.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fail, ok, message } from '../utils/http.js';
import logActivity from '../utils/logActivity.js';

const buildTree = (pages) => {
  const nodes = pages.map((page) => ({ ...page.toJSON(), children: [] }));
  const byId = new Map(nodes.map((node) => [node._id.toString(), node]));
  const roots = [];
  nodes.forEach((node) => {
    const parentId = node.parentId?.toString();
    if (parentId && byId.has(parentId)) byId.get(parentId).children.push(node);
    else roots.push(node);
  });
  return roots;
};

export const createPage = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.body.projectId);
  if (!project) return fail(res, 'Project not found', 404);
  const page = await WikiPage.create({ ...req.body, createdBy: req.user.id, versionHistory: [{ content: req.body.content || '', editedBy: req.user.id }] });
  await logActivity({ userId: req.user.id, workspaceId: project.workspaceId, projectId: project._id, action: 'doc.created', entityType: 'wiki', entityId: page._id, entityName: page.title });
  return ok(res, { page }, 201);
});

export const listPages = asyncHandler(async (req, res) => {
  const pages = await WikiPage.find({ projectId: req.params.projectId }).sort({ order: 1, createdAt: 1 }).populate('createdBy', 'name avatar email');
  return ok(res, { pages, tree: buildTree(pages) });
});

export const getPage = asyncHandler(async (req, res) => {
  const page = await WikiPage.findById(req.params.pageId).populate('createdBy', 'name avatar email').populate('versionHistory.editedBy', 'name avatar email');
  if (!page) return fail(res, 'Wiki page not found', 404);
  return ok(res, { page });
});

export const updatePage = asyncHandler(async (req, res) => {
  const page = await WikiPage.findById(req.params.pageId);
  if (!page) return fail(res, 'Wiki page not found', 404);
  page.versionHistory.push({ content: page.content, editedBy: req.user.id });
  ['title', 'content', 'parentId', 'order'].forEach((key) => { if (req.body[key] !== undefined) page[key] = req.body[key]; });
  await page.save();
  const project = await Project.findById(page.projectId);
  await logActivity({ userId: req.user.id, workspaceId: project.workspaceId, projectId: project._id, action: 'doc.updated', entityType: 'wiki', entityId: page._id, entityName: page.title });
  return ok(res, { page });
});

export const deletePage = asyncHandler(async (req, res) => {
  const page = await WikiPage.findByIdAndDelete(req.params.pageId);
  if (!page) return fail(res, 'Wiki page not found', 404);
  await WikiPage.updateMany({ parentId: page._id }, { parentId: null });
  const project = await Project.findById(page.projectId);
  await logActivity({ userId: req.user.id, workspaceId: project.workspaceId, projectId: project._id, action: 'doc.deleted', entityType: 'wiki', entityId: page._id, entityName: page.title });
  return message(res, 'Wiki page deleted');
});

export const listVersions = asyncHandler(async (req, res) => {
  const page = await WikiPage.findById(req.params.pageId).populate('versionHistory.editedBy', 'name avatar email');
  if (!page) return fail(res, 'Wiki page not found', 404);
  return ok(res, { versions: page.versionHistory });
});

export const restoreVersion = asyncHandler(async (req, res) => {
  const page = await WikiPage.findById(req.params.pageId);
  if (!page) return fail(res, 'Wiki page not found', 404);

  const { versionId, versionIndex } = req.body;
  const index = versionId
    ? page.versionHistory.findIndex((version) => version._id.toString() === versionId)
    : Number.isInteger(versionIndex)
      ? versionIndex
      : Number.parseInt(versionIndex, 10);

  if (!Number.isInteger(index) || index < 0 || index >= page.versionHistory.length) {
    return fail(res, 'Version not found', 404);
  }

  const version = page.versionHistory[index];
  page.versionHistory.push({ content: page.content, editedBy: req.user.id });
  page.content = version.content || '';
  await page.save();

  const project = await Project.findById(page.projectId);
  if (project) {
    await logActivity({
      userId: req.user.id,
      workspaceId: project.workspaceId,
      projectId: project._id,
      action: 'doc.restored',
      entityType: 'wiki',
      entityId: page._id,
      entityName: page.title,
      metadata: { versionId: version._id, versionIndex: index },
    });
  }

  return ok(res, { page });
});
