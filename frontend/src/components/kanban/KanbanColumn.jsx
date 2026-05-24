import { useDroppable } from '@dnd-kit/core';
import { MoreHorizontal, Plus } from 'lucide-react';
import { TaskCard } from './TaskCard';
import { cn } from '../../assets/utils';

export const KanbanColumn = ({ status, title, tasks, onAddTask, onTaskClick, users, isLoading = false }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: status,
        data: { type: 'column', status },
    });

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className={cn(
                'flex items-center justify-between border-t-2 px-2 pt-2',
                title === 'To Do' ? 'border-gray-500' : title === 'In Progress' ? 'border-info' : title === 'In Review' ? 'border-warning' : 'border-success'
            )}>
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">{title}</h3>
                    <span className="text-[10px] bg-dark-border px-1.5 py-0.5 rounded text-gray-500">{tasks.length}</span>
                </div>
                <button className="text-gray-500 hover:text-white"><MoreHorizontal size={14} /></button>
            </div>

            <div
                ref={setNodeRef}
                className={cn(
                    'flex min-h-65 flex-1 flex-col gap-3 rounded-2xl border border-dark-border/60 bg-black/10 p-2 transition-colors dark:bg-white/1',
                    isOver && 'border-primary/70 bg-primary/5',
                )}
            >
                {isLoading ? (
                    <div className="space-y-3 p-1">
                        <div className="h-28 animate-pulse rounded-xl bg-white/5" />
                        <div className="h-24 animate-pulse rounded-xl bg-white/5" />
                        <div className="h-20 animate-pulse rounded-xl bg-white/5" />
                    </div>
                ) : (
                    tasks.map((task) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onClick={() => onTaskClick(task)}
                            assignee={users.find((u) => u.id === task.assignee)}
                            disabled={task.pending}
                        />
                    ))
                )}
                <button
                    type="button"
                    onClick={onAddTask}
                    className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-dark-border px-3 py-2 text-xs text-gray-500 transition-all hover:border-primary hover:text-primary"
                >
                    <Plus size={14} /> Add Task
                </button>
            </div>
        </div>
    );
};
