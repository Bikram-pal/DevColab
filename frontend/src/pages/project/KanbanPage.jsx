import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Loader2, Plus, MoreHorizontal, X, UserPlus, Flag, Calendar, Hash, Clock, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { PageShell } from '../../components/layout/PageShell';
import { Badge, Avatar, Button, Input } from '../../components/ui';
import { cn } from '../../assets/utils';
import { KanbanColumn } from '../../components/kanban/KanbanColumn';
import api, { unwrap } from '../../lib/api';
import { boardSocket, presenceSocket, refreshSocketAuth } from '../../lib/socket';
import { formatDate, statusLabels, statusOrder } from '../../lib/format';
import { useAuth } from '../../context/useAuth';

const emptyGrouped = () => ({ todo: [], in_progress: [], in_review: [], done: [] });

const getTaskId = (task) => task?._id || task?.id;

const makeTempId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getErrorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

const normalizeTask = (task) => {
  if (!task) return task;
  return {
    ...task,
    id: getTaskId(task),
    labels: task.labels || [],
    comments: task.comments || [],
    attachments: task.attachments || [],
  };
};

const sortTasks = (tasks = []) => [...tasks].map(normalizeTask).sort((left, right) => (
  (left.position || 0) - (right.position || 0)
  || new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()
  || String(left.title || '').localeCompare(String(right.title || ''))
));

const buildGroupedTasks = (groupedTasks = {}) => {
  const next = emptyGrouped();
  statusOrder.forEach((status) => {
    next[status] = sortTasks(groupedTasks[status] || []);
  });
  return next;
};

// Keep the board normalized so socket echoes and optimistic updates merge by id instead of duplicating tasks.
const findTaskInGrouped = (groupedTasks, taskId) => {
  for (const status of statusOrder) {
    const task = (groupedTasks[status] || []).find((item) => getTaskId(item) === taskId);
    if (task) return task;
  }
  return null;
};

const removeTaskFromGrouped = (groupedTasks, taskId) => {
  const next = emptyGrouped();
  statusOrder.forEach((status) => {
    next[status] = sortTasks((groupedTasks[status] || []).filter((task) => getTaskId(task) !== taskId));
  });
  return next;
};

const updateTaskInGrouped = (groupedTasks, taskId, updater) => {
  const next = emptyGrouped();
  statusOrder.forEach((status) => {
    next[status] = sortTasks((groupedTasks[status] || []).map((task) => {
      if (getTaskId(task) !== taskId) return task;
      return normalizeTask(updater(normalizeTask(task)));
    }));
  });
  return next;
};

const upsertTaskInGrouped = (groupedTasks, task) => {
  const normalizedTask = normalizeTask(task);
  const taskId = getTaskId(normalizedTask);
  const next = removeTaskFromGrouped(groupedTasks, taskId);
  next[normalizedTask.status] = sortTasks([...(next[normalizedTask.status] || []), normalizedTask]);
  return next;
};

const moveTaskInGrouped = (groupedTasks, taskId, targetStatus) => {
  const task = findTaskInGrouped(groupedTasks, taskId);
  if (!task || task.status === targetStatus) return groupedTasks;

  const withoutTask = removeTaskFromGrouped(groupedTasks, taskId);
  const targetPosition = (withoutTask[targetStatus] || []).length + 1;
  return upsertTaskInGrouped(withoutTask, { ...task, status: targetStatus, position: targetPosition });
};

const reconcileCommentList = (comments = [], optimisticId, savedComment) => {
  const commentId = savedComment?._id || savedComment?.id;
  const hasSavedComment = comments.some((comment) => (comment?._id || comment?.id) === commentId);
  const withoutOptimistic = comments.filter((comment) => (comment?._id || comment?.id) !== optimisticId);

  if (hasSavedComment) {
    return withoutOptimistic.map((comment) => ((comment?._id || comment?.id) === commentId ? savedComment : comment));
  }

  return withoutOptimistic.map((comment) => ((comment?._id || comment?.id) === optimisticId ? savedComment : comment));
};

const removeCommentFromList = (comments = [], commentId) => comments.filter((comment) => (comment?._id || comment?.id) !== commentId);

const KanbanSkeleton = () => (
  <div className="grid gap-4 xl:grid-cols-4">
    {statusOrder.map((status) => (
      <div key={status} className="flex flex-col gap-4">
        <div className="h-5 w-32 rounded-full bg-white/10 animate-pulse" />
        <div className="rounded-2xl border border-dark-border/60 bg-black/10 p-3 space-y-3">
          <div className="h-28 rounded-xl bg-white/5 animate-pulse" />
          <div className="h-24 rounded-xl bg-white/5 animate-pulse" />
          <div className="h-20 rounded-xl bg-white/5 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const KanbanPage = () => {
  const { id: projectId } = useParams();
  const { user } = useAuth();
  const [grouped, setGrouped] = useState(emptyGrouped);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewers, setViewers] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [boardError, setBoardError] = useState('');
  const [isLoadingBoard, setIsLoadingBoard] = useState(true);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [pendingMoveId, setPendingMoveId] = useState(null);
  const [activeDragId, setActiveDragId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef(new Map());
  const newTaskInputRef = useRef(null);
  const latestGroupedRef = useRef(grouped);
  const selectedTaskIdRef = useRef(null);

  useEffect(() => {
    latestGroupedRef.current = grouped;
  }, [grouped]);

  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId;
  }, [selectedTaskId]);

  const taskIndex = useMemo(() => {
    const next = new Map();
    statusOrder.forEach((status) => {
      (grouped[status] || []).forEach((task) => {
        next.set(getTaskId(task), task);
      });
    });
    return next;
  }, [grouped]);

  const activeTask = activeDragId ? taskIndex.get(activeDragId) : null;
  const selectedTaskFromBoard = selectedTaskId ? taskIndex.get(selectedTaskId) : null;

  const pushToast = useCallback((type, title, message) => {
    const id = makeTempId('toast');
    setToasts((current) => [...current.slice(-3), { id, type, title, message }]);
    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      toastTimersRef.current.delete(id);
    }, 3200);
    toastTimersRef.current.set(id, timeoutId);
  }, []);

  const dismissToast = useCallback((id) => {
    const timeoutId = toastTimersRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      toastTimersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const loadTasks = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoadingBoard(true);
    setBoardError('');
    try {
      const response = unwrap(await api.get(`/tasks/project/${projectId}?grouped=true`));
      setGrouped(buildGroupedTasks(response.tasks || {}));
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to load the board.');
      setBoardError(message);
      pushToast('error', 'Board load failed', message);
    } finally {
      setIsLoadingBoard(false);
    }
  }, [projectId, pushToast]);

  useEffect(() => {
    loadTasks();
    setSelectedTaskId(null);
    setSelectedTask(null);
  }, [loadTasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      return;
    }
    setSelectedTask(selectedTaskFromBoard || null);
  }, [selectedTaskId, selectedTaskFromBoard]);

  useEffect(() => {
    refreshSocketAuth();

    if (!projectId) return undefined;

    const boardJoinPayload = { projectId };
    const presenceJoinPayload = {
      projectId,
      userId: user?._id || user?.id,
      userName: user?.name,
      avatar: user?.avatar,
    };

    const syncTask = (task) => {
      if (!task) return;
      setGrouped((current) => upsertTaskInGrouped(current, task));
      const taskId = getTaskId(task);
      if (selectedTaskIdRef.current === taskId) {
        setSelectedTask(normalizeTask(task));
      }
    };

    const handleTaskCreated = (task) => syncTask(task);
    const handleTaskUpdated = (task) => syncTask(task);
    const handleTaskMoved = ({ task }) => syncTask(task);
    const handleTaskDeleted = ({ taskId }) => {
      if (!taskId) return;
      setGrouped((current) => removeTaskFromGrouped(current, taskId));
      if (selectedTaskIdRef.current === taskId) {
        setSelectedTaskId(null);
        setSelectedTask(null);
      }
    };
    const handleTaskComment = ({ taskId, comment }) => {
      if (!taskId || !comment) return;
      setGrouped((current) => updateTaskInGrouped(current, taskId, (task) => ({
        ...task,
        comments: reconcileCommentList(task.comments || [], comment._id || comment.id, comment),
      })));
      if (selectedTaskIdRef.current === taskId) {
        setSelectedTask((current) => (current ? {
          ...current,
          comments: reconcileCommentList(current.comments || [], comment._id || comment.id, comment),
        } : current));
      }
    };

    const handlePresenceUpdate = (nextViewers) => {
      setViewers(Array.isArray(nextViewers) ? nextViewers : []);
    };

    boardSocket.connect();
    presenceSocket.connect();
    boardSocket.emit('join_board', boardJoinPayload);
    presenceSocket.emit('join_board', presenceJoinPayload);

    boardSocket.on('task:created', handleTaskCreated);
    boardSocket.on('task:updated', handleTaskUpdated);
    boardSocket.on('task:moved', handleTaskMoved);
    boardSocket.on('task:deleted', handleTaskDeleted);
    boardSocket.on('task:comment', handleTaskComment);
    presenceSocket.on('presence:update', handlePresenceUpdate);

    return () => {
      boardSocket.emit('leave_board', { projectId });
      presenceSocket.emit('leave_board', { projectId });
      boardSocket.off('task:created', handleTaskCreated);
      boardSocket.off('task:updated', handleTaskUpdated);
      boardSocket.off('task:moved', handleTaskMoved);
      boardSocket.off('task:deleted', handleTaskDeleted);
      boardSocket.off('task:comment', handleTaskComment);
      presenceSocket.off('presence:update', handlePresenceUpdate);
      boardSocket.off();
      presenceSocket.off();
      boardSocket.disconnect();
      presenceSocket.disconnect();
    };
  }, [projectId, user?.avatar, user?._id, user?.id, user?.name]);

  useEffect(() => () => {
    toastTimersRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    toastTimersRef.current.clear();
  }, []);

  const handleTaskClick = useCallback((task) => {
    const taskId = getTaskId(task);
    setSelectedTaskId(taskId);
    setSelectedTask(normalizeTask(task));
  }, []);

  const handleCreateTask = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) {
      newTaskInputRef.current?.focus();
      return;
    }

    const tempId = makeTempId('task');
    const optimisticTask = normalizeTask({
      id: tempId,
      _id: tempId,
      title,
      description: '',
      status: 'todo',
      priority: 'P1',
      labels: [],
      comments: [],
      attachments: [],
      createdBy: user ? { _id: user._id || user.id, name: user.name, avatar: user.avatar } : undefined,
      projectId,
      pending: true,
    });

    setIsCreatingTask(true);
    setBoardError('');
    setGrouped((current) => upsertTaskInGrouped(current, optimisticTask));
    setNewTitle('');

    try {
      const response = unwrap(await api.post('/tasks', { title, projectId, status: 'todo' }));
      const serverTask = response.task;
      setGrouped((current) => upsertTaskInGrouped(removeTaskFromGrouped(current, tempId), serverTask));
      pushToast('success', 'Task created', title);
    } catch (error) {
      setGrouped((current) => removeTaskFromGrouped(current, tempId));
      setNewTitle(title);
      const message = getErrorMessage(error, 'Unable to create the task.');
      setBoardError(message);
      pushToast('error', 'Create failed', message);
    } finally {
      setIsCreatingTask(false);
      newTaskInputRef.current?.focus();
    }
  }, [newTitle, projectId, pushToast, user]);

  const handleMoveTask = useCallback(async (task, targetStatus) => {
    const taskId = getTaskId(task);
    if (!taskId || !targetStatus || task.status === targetStatus) return;

    const snapshot = latestGroupedRef.current;
    const optimisticPosition = (snapshot[targetStatus] || []).length + 1;
    setPendingMoveId(taskId);
    setGrouped((current) => moveTaskInGrouped(current, taskId, targetStatus));
    if (selectedTaskIdRef.current === taskId) {
      setSelectedTask((current) => (current ? { ...current, status: targetStatus, position: optimisticPosition } : current));
    }

    try {
      const response = unwrap(await api.put(`/tasks/${taskId}/move`, { status: targetStatus, position: optimisticPosition }));
      const serverTask = response.task;
      setGrouped((current) => upsertTaskInGrouped(current, serverTask));
      if (selectedTaskIdRef.current === taskId) {
        setSelectedTask(normalizeTask(serverTask));
      }
      pushToast('success', 'Task moved', `${task.title} moved to ${statusLabels[targetStatus]}`);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to move the task.');
      setGrouped(snapshot);
      if (selectedTaskIdRef.current === taskId) {
        setSelectedTask(findTaskInGrouped(snapshot, taskId));
      }
      setBoardError(message);
      pushToast('error', 'Move failed', message);
    } finally {
      setPendingMoveId((current) => (current === taskId ? null : current));
    }
  }, [pushToast]);

  const handleDragStart = useCallback(({ active }) => {
    setActiveDragId(String(active.id));
  }, []);

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveDragId(null);
    if (!over) return;

    const draggedTask = taskIndex.get(String(active.id));
    if (!draggedTask) return;

    const dropStatus = over.data.current?.status || (statusOrder.includes(String(over.id)) ? String(over.id) : null);
    if (!dropStatus) return;

    handleMoveTask(draggedTask, dropStatus);
  }, [handleMoveTask, taskIndex]);

  const handleAddComment = useCallback(async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const commentInput = form.elements.comment;
    const text = commentInput.value.trim();
    if (!text || !selectedTask) return;

    const taskId = getTaskId(selectedTask);
    const tempCommentId = makeTempId('comment');
    const optimisticComment = {
      _id: tempCommentId,
      id: tempCommentId,
      text,
      author: user ? { _id: user._id || user.id, name: user.name, avatar: user.avatar } : null,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    commentInput.value = '';
    setIsCommentSubmitting(true);
    setSelectedTask((current) => (current && getTaskId(current) === taskId ? {
      ...current,
      comments: [...(current.comments || []), optimisticComment],
    } : current));
    setGrouped((current) => updateTaskInGrouped(current, taskId, (task) => ({
      ...task,
      comments: [...(task.comments || []), optimisticComment],
    })));

    try {
      const response = unwrap(await api.post(`/tasks/${taskId}/comments`, { text }));
      const savedComment = response.comment;
      setSelectedTask((current) => (current && getTaskId(current) === taskId ? {
        ...current,
        comments: reconcileCommentList(current.comments || [], tempCommentId, savedComment),
      } : current));
      setGrouped((current) => updateTaskInGrouped(current, taskId, (task) => ({
        ...task,
        comments: reconcileCommentList(task.comments || [], tempCommentId, savedComment),
      })));
      pushToast('success', 'Comment posted', 'Your update is live for everyone watching.');
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to post the comment.');
      setSelectedTask((current) => (current && getTaskId(current) === taskId ? {
        ...current,
        comments: removeCommentFromList(current.comments || [], tempCommentId),
      } : current));
      setGrouped((current) => updateTaskInGrouped(current, taskId, (task) => ({
        ...task,
        comments: removeCommentFromList(task.comments || [], tempCommentId),
      })));
      setBoardError(message);
      pushToast('error', 'Comment failed', message);
      commentInput.value = text;
    } finally {
      setIsCommentSubmitting(false);
    }
  }, [pushToast, selectedTask, user]);

  const getPriorityBadge = (priority) => <Badge variant={priority === 'P0' ? 'danger' : priority === 'P1' ? 'warning' : 'info'}>{priority}</Badge>;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const boardUsers = useMemo(() => Array.from(taskIndex.values())
    .flatMap((task) => [task.assigneeId, task.createdBy])
    .filter(Boolean)
    .map((person) => ({ ...person, id: person._id || person.id }))
    .filter((person, index, collection) => collection.findIndex((entry) => entry.id === person.id) === index), [taskIndex]);

  return (
    <PageShell breadcrumbs={['Projects', 'Board']}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="h-full flex flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-dark-border/60 bg-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">Project Board</h1>
                {isLoadingBoard && <Loader2 size={16} className="animate-spin text-gray-500" />}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex -space-x-2">
                  {viewers.slice(0, 5).map((viewer) => (
                    <Avatar key={viewer.socketId} src={viewer.avatar} name={viewer.userName} size="xs" className="ring-2 ring-dark-bg" />
                  ))}
                </div>
                <span className="text-xs text-gray-500">{viewers.length || 1} people viewing</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                ref={newTaskInputRef}
                placeholder="New task title"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleCreateTask();
                  }
                }}
                className="min-w-0 sm:w-80"
              />
              <Button size="sm" className="gap-2 whitespace-nowrap" onClick={handleCreateTask} disabled={isCreatingTask || isLoadingBoard}>
                {isCreatingTask ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {isCreatingTask ? 'Creating...' : 'New Task'}
              </Button>
            </div>
          </div>

          {boardError && !isLoadingBoard && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{boardError}</span>
              </div>
              <button type="button" onClick={() => loadTasks()} className="flex items-center gap-2 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-danger/10">
                <RotateCcw size={12} /> Retry
              </button>
            </div>
          )}

          {isLoadingBoard ? (
            <KanbanSkeleton />
          ) : (
            <div className="grid gap-4 xl:grid-cols-4">
              {statusOrder.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  title={statusLabels[status]}
                  tasks={grouped[status] || []}
                  onTaskClick={handleTaskClick}
                  onAddTask={() => newTaskInputRef.current?.focus()}
                  users={boardUsers}
                  isLoading={isLoadingBoard}
                />
              ))}
            </div>
          )}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="w-[320px] -rotate-1 scale-[1.02] shadow-2xl">
              <div className="pointer-events-none">
                <TaskCard
                  task={activeTask}
                  assignee={activeTask.assigneeId?._id ? activeTask.assigneeId : activeTask.assignee}
                  disabled
                />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className={cn(
        'fixed inset-y-0 right-0 z-50 w-full max-w-full transform border-l border-dark-border bg-[#0b0d12] shadow-2xl transition-transform duration-300 ease-out sm:max-w-lg',
        selectedTask ? 'translate-x-0' : 'translate-x-full',
      )}>
        {selectedTask && (
          <div className="flex h-full flex-col overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-dark-border/70 pb-4">
              <div className="space-y-2">
                <Badge variant="primary">DC-{getTaskId(selectedTask).slice(-6).toUpperCase()}</Badge>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {selectedTaskFromBoard?.pending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} className="text-success" />}
                  <span>{selectedTaskFromBoard?.pending ? 'Syncing change...' : 'Live task details'}</span>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedTask(null)} className="rounded-full p-2 text-gray-500 transition-colors hover:bg-white/5 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 py-5">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold leading-tight">{selectedTask.title}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 rounded-2xl border border-dark-border/60 bg-white/5 p-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-500"><Flag size={14} /> Priority</div>
                    <div>{getPriorityBadge(selectedTask.priority)}</div>
                  </div>
                  <div className="space-y-1.5 rounded-2xl border border-dark-border/60 bg-white/5 p-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-500"><Calendar size={14} /> Due Date</div>
                    <div className="flex items-center gap-2 text-sm"><Clock size={14} /> {formatDate(selectedTask.dueDate)}</div>
                  </div>
                  <div className="space-y-1.5 rounded-2xl border border-dark-border/60 bg-white/5 p-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-500"><UserPlus size={14} /> Assignee</div>
                    <div>{selectedTask.assigneeId?.name || 'Unassigned'}</div>
                  </div>
                  <div className="space-y-1.5 rounded-2xl border border-dark-border/60 bg-white/5 p-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-500"><Hash size={14} /> Status</div>
                    <select
                      className="w-full rounded-lg border border-dark-border bg-dark-bg px-2 py-1"
                      value={selectedTask.status}
                      onChange={(event) => handleMoveTask(selectedTask, event.target.value)}
                      disabled={pendingMoveId === getTaskId(selectedTask)}
                    >
                      {statusOrder.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-400">{selectedTask.description || 'No description yet.'}</p>

              <form onSubmit={handleAddComment} className="space-y-3 border-t border-dark-border/70 pt-5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold">Comments <span className="text-xs text-gray-500">{selectedTask.comments?.length || 0}</span></h4>
                  {isCommentSubmitting && <Loader2 size={14} className="animate-spin text-gray-500" />}
                </div>
                <textarea
                  name="comment"
                  placeholder="Add a comment... Use @Full Name to mention"
                  className="h-24 w-full resize-none rounded-2xl border border-dark-border bg-black/10 p-3 text-sm outline-none transition-shadow focus:ring-1 focus:ring-primary"
                  disabled={isCommentSubmitting}
                />
                <Button size="sm" disabled={isCommentSubmitting} className="gap-2">
                  {isCommentSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
                  Post Comment
                </Button>
                <div className="space-y-2">
                  {(selectedTask.comments || []).map((comment) => (
                    <div key={comment._id || comment.id} className={cn('rounded-xl border border-dark-border/50 bg-white/5 p-3 text-xs', comment.pending && 'opacity-60')}>
                      <strong>{comment.author?.name || 'User'}:</strong> {comment.text}
                    </div>
                  ))}
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {selectedTask && <div onClick={() => setSelectedTask(null)} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />}

      <div className="pointer-events-none fixed right-4 top-4 z-60 flex w-[min(100vw-2rem,24rem)] flex-col gap-3">
        {toasts.map((toast) => (
          <div key={toast.id} className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl transition-all',
            toast.type === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-success/30 bg-success/10 text-success',
          )}>
            <div className="mt-0.5">
              {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{toast.title}</div>
              {toast.message && <div className="mt-0.5 text-xs opacity-80">{toast.message}</div>}
            </div>
            <button type="button" onClick={() => dismissToast(toast.id)} className="text-current/70 transition-colors hover:text-current">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  );
};

export default KanbanPage;