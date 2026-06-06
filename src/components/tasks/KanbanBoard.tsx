"use client";

// Kanban board: one column per status in the task pipeline.
// "Todo" displays as "Backlog", "In Review" as "Review" per agency convention.

import type { TaskLedger, Profile, TaskStatus } from "@/lib/types";
import TaskCard from "@/components/tasks/TaskCard";

interface KanbanBoardProps {
  tasks: TaskLedger[];
  members: Profile[];
  onUpdate: () => void;
  onOpenPanel: (task: TaskLedger) => void;
}

const COLUMNS: {
  status: TaskStatus;
  label: string;
  dotColor: string;
  headerColor: string;
  bgColor: string;
}[] = [
  {
    status: "Todo",
    label: "Backlog",
    dotColor: "#91918e",
    headerColor: "text-neutral-500",
    bgColor: "bg-neutral-50/60",
  },
  {
    status: "In Progress",
    label: "In Progress",
    dotColor: "#337ea9",
    headerColor: "text-blue-600",
    bgColor: "bg-blue-50/30",
  },
  {
    status: "In Review",
    label: "Review",
    dotColor: "#cb912f",
    headerColor: "text-amber-600",
    bgColor: "bg-amber-50/30",
  },
  {
    status: "Completed",
    label: "Completed",
    dotColor: "#448361",
    headerColor: "text-green-700",
    bgColor: "bg-green-50/30",
  },
  {
    status: "Not Done",
    label: "Not Done",
    dotColor: "#dc2626",
    headerColor: "text-red-600",
    bgColor: "bg-red-50/20",
  },
  {
    status: "Discarded",
    label: "Discarded",
    dotColor: "#b0a9a2",
    headerColor: "text-neutral-400",
    bgColor: "bg-neutral-100/50",
  },
];

export default function KanbanBoard({ tasks, members, onUpdate, onOpenPanel }: KanbanBoardProps) {
  return (
    // 6-column grid on extra-large screens, collapsing on smaller viewports
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 items-start">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);

        return (
          <div key={col.status} className={`kanban-column flex flex-col ${col.bgColor}`}>
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-100/80">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: col.dotColor }}
                />
                <span className={`text-xs font-semibold uppercase tracking-wider ${col.headerColor}`}>
                  {col.label}
                </span>
              </div>
              <span className="text-[10px] font-medium text-neutral-400 bg-neutral-100 rounded-full px-2 py-0.5 tabular-nums">
                {colTasks.length}
              </span>
            </div>

            {/* Task cards */}
            <div className="p-2 space-y-2 flex-1 overflow-y-auto">
              {colTasks.length === 0 ? (
                <div className="h-16 flex items-center justify-center">
                  <span className="text-xs text-neutral-300 italic">No tasks</span>
                </div>
              ) : (
                colTasks.map((task) => (
                  <TaskCard
                    key={task.task_id}
                    task={task}
                    members={members}
                    onUpdate={onUpdate}
                    onOpenPanel={onOpenPanel}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
