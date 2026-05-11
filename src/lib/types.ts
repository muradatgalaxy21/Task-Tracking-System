// -------------------------------------------------------------------
// Application Types
// Defines the shape of data models and their relationships.
// -------------------------------------------------------------------

export type UserRole = "Admin" | "Member";

export type TaskStatus = "Todo" | "In Progress" | "In Review" | "Completed";

export type SubTaskStatus = "Todo" | "Completed";

export type AttendanceStatus = "Present" | "Late" | "Absent";

export type TaskPriority = "High" | "Medium" | "Low";

export type PageType = "tasks" | "notes" | "attendance";

// 1. Profile: Represents a team member in the system.
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  // sessions_attended removed - attendance is now tracked via daily_attendance table.
  created_at: string;
}

// 2. TaskLedger: Represents a main task assigned to a member.
export interface TaskLedger {
  task_id: string;
  title: string;
  description: string;
  assignee_id: string;
  estimated_days: number;
  // points_value removed - scoring is now time-multiplier based, not points based.
  // multiplier_earned is written to DB at the moment a task is marked Completed.
  multiplier_earned: number | null;
  status: TaskStatus;
  max_deadline: string;
  created_at: string;
  completed_at: string | null;
  // Priority level for the task (optional, null for legacy tasks)
  priority: TaskPriority | null;
  // Workspace association (optional, null for legacy tasks)
  workspace_id: string | null;
  // Joined fields (optional, populated via queries with select("*, sub_tasks(*)"))
  assignee?: Profile;
  sub_tasks?: SubTask[];
}

// 3. SubTask: A sub-item of a main task.
export interface SubTask {
  id: string;
  parent_task_id: string;
  title: string;
  description: string;
  status: SubTaskStatus;
  created_at: string;
}

// 4. DailyAttendance: One record per member per calendar date.
export interface DailyAttendance {
  id: string;
  user_id: string;
  date: string; // ISO date string: YYYY-MM-DD
  status: AttendanceStatus;
  created_at: string;
}

// 5. Workspace: An isolated project or team container.
export interface Workspace {
  id: string;
  name: string;
  description: string;
  created_by: string | null;
  created_at: string;
}

// 6. WorkspaceMember: Maps a user to a workspace with a role.
export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
}

// 7. Page: A content page within a workspace.
export interface Page {
  id: string;
  workspace_id: string;
  title: string;
  page_type: PageType;
  created_at: string;
}


