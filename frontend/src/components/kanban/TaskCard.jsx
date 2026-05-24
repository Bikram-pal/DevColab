import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Badge, Avatar } from '../ui';
import { GripVertical, Paperclip, MessageSquare, MoreHorizontal } from 'lucide-react';
import { cn } from '../../assets/utils';

export const TaskCard = ({ task, onClick, assignee, disabled = false }) => {
  const taskId = task.id || task._id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useDraggable({
    id: taskId,
    data: { type: 'task', task, status: task.status },
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  const getPriorityBadge = (p) => {
    if (p === "P0")
      return (
        <Badge
          variant="danger"
          className="bg-danger/20 text-danger border-none"
        >
          P0
        </Badge>
      );
    if (p === "P1")
      return (
        <Badge
          variant="warning"
          className="bg-amber-500/20 text-amber-400 border-none"
        >
          P1
        </Badge>
      );
    return (
      <Badge
        variant="info"
        className="bg-blue-500/20 text-blue-400 border-none"
      >
        P2
      </Badge>
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onClick={onClick}
      className={cn(
        'surface p-4 rounded-xl space-y-4 hover:-translate-y-0.5 transition-all cursor-pointer group shadow-sm border dark:border-dark-border/50 will-change-transform',
        isDragging && 'opacity-60 scale-[0.98] shadow-xl ring-1 ring-primary/40',
        task.pending && 'opacity-70',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {getPriorityBadge(task.priority)}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            className="text-gray-500 hover:text-white cursor-grab active:cursor-grabbing"
            aria-label={`Drag ${task.title}`}
          >
            <GripVertical size={14} />
          </button>
          <button type="button" onClick={(event) => event.stopPropagation()} className="text-gray-500 hover:text-white">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>
      <h4 className="font-bold text-sm leading-snug group-hover:text-primary transition-colors">
        {task.title}
      </h4>
      <div className="flex flex-wrap gap-1">
        {(task.labels || []).map((l) => (
          <span
            key={l}
            className="text-[10px] text-gray-500 bg-dark-border px-1.5 py-0.5 rounded font-medium"
          >
            #{l}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-dark-border/50">
        <div className="flex items-center gap-3 text-gray-500">
          {task.attachments > 0 && (
            <span className="text-[10px] flex items-center gap-1">
              <Paperclip size={10} /> {task.attachments}
            </span>
          )}
          <span className="text-[10px] flex items-center gap-1">
            <MessageSquare size={10} /> {task.comments?.length || 0}
          </span>
        </div>
        <Avatar src={assignee?.avatar} name={assignee?.name} size="xs" />
      </div>
    </div>
  );
};
