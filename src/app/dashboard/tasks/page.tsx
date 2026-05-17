"use client";

// Dedicated task management page — board and filters only, no stats or welcome header.

import TaskListView from "@/components/tasks/TaskListView";

export default function TasksPage() {
  return (
    <div className="animate-fade-in">
      <TaskListView />
    </div>
  );
}
