"use client";

// Dedicated task management page — board and filters only, no stats or welcome header.

import { Suspense } from "react";
import TaskListView from "@/components/tasks/TaskListView";

export default function TasksPage() {
  return (
    <div className="animate-fade-in">
      <Suspense fallback={<div className="skeleton h-96 w-full rounded-xl" />}>
        <TaskListView />
      </Suspense>
    </div>
  );
}
