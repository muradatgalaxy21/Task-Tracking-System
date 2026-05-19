// -------------------------------------------------------------------
// Application Types
// Defines the shape of data models and their relationships.
// -------------------------------------------------------------------

// Five roles in ascending privilege order: Guest < Member < Manager < Admin < Owner
export type UserRole = "Owner" | "Admin" | "Manager" | "Member" | "Guest";

export type TaskStatus = "Todo" | "In Progress" | "In Review" | "Completed" | "Discarded";

export type SubTaskStatus = "Todo" | "Completed";

export type AttendanceStatus = "Present" | "Late" | "Absent";

export type TaskPriority = "Urgent" | "High" | "Medium" | "Low";

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
  // Timestamp of when the task was first submitted for review (used for fair multiplier scoring).
  review_submitted_at: string | null;
  // Priority level for the task (optional, null for legacy tasks)
  priority: TaskPriority | null;
  // Workspace association (optional, null for legacy tasks)
  workspace_id: string | null;
  // Agency-specific technical metadata
  ai_model_used: string | null;
  benchmark_score: string | null;
  repo_link: string | null;
  // Deep Dive panel fields
  technical_requirements: string;
  architecture_notes: string;
  estimated_hours: number | null;
  actual_hours: number | null;
  attachments: string; // JSON-serialised TaskAttachment[]
  // Joined fields (optional, populated via queries with select("*, sub_tasks(*)"))
  assignee?: Profile;
  sub_tasks?: SubTask[];
  activities?: TaskActivity[];
}

// 8. TaskActivity: An audit-log entry or threaded comment on a task.
export interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string | null;
  actor_name: string | null;
  type: string; // "comment" | "status_change" | "field_update"
  content: string;
  metadata: string | null; // JSON string
  created_at: string;
}

// 9. TaskAttachment: A named link attached to a task.
export interface TaskAttachment {
  name: string;
  url: string;
}

// 10. Notification: An in-app notification for a user (e.g., mention in a comment).
export interface Notification {
  id: string;
  user_id: string;
  task_id: string | null;
  task_title: string | null;
  from_name: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
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
  // invite_code is nullable for workspaces created before the field was added
  invite_code: string | null;
  created_by: string | null;
  created_at: string;
  // Populated by GET /api/workspaces — the current user's role in this workspace
  member_role?: string | null;
}

// 6. WorkspaceMember: Maps a user to a workspace with a role.
export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
}

export type InvitationStatus = "PENDING_APPROVAL" | "ACTIVE" | "USED" | "EXPIRED";

// 11. Invitation: Single-use workspace invite code.
export interface Invitation {
  id: string;
  code: string;
  email: string | null;
  workspace_id: string;
  invited_by_id: string;
  is_admin_generated: boolean;
  status: InvitationStatus;
  created_at: string;
  expires_at: string | null;
  claimer_id: string | null;
  claimer_email: string | null;
  claimed_at: string | null;
  // Joined fields returned by the API
  invited_by?: { full_name: string | null; email: string | null };
}

// Maps DB status values to human-readable display labels.
// Keeps DB values stable while letting the UI use agency terminology.
export const STATUS_LABELS: Record<string, string> = {
  "Todo": "Backlog",
  "In Progress": "In Progress",
  "In Review": "Review",
  "Completed": "Completed",
  "Discarded": "Discarded",
};

// 7. Page: A content page within a workspace.
export interface Page {
  id: string;
  workspace_id: string;
  title: string;
  page_type: PageType;
  created_at: string;
}


