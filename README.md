# AI & Beyond Evaluator

## Project Overview

**Application Name:** AI & Beyond Evaluator
**Purpose:** Internal team performance evaluation and task tracking system built for the AI & Beyond agency. It tracks tasks, attendance, calculates performance scores, and distributes payouts based on individual contributions.

**Core Business Logic:**
- Assign tasks to team members with deadlines
- Track task completion against deadlines using a multiplier penalty system
- Record daily attendance (Present / Late / Absent)
- Calculate composite scores: Task Performance Score (80%) + Attendance Score (20%)
- Distribute monthly payouts proportionally based on scores

## Getting Started

First, install the dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Tech Stack & Architecture

- **Frontend:** Next.js + React 19
- **Styling:** Tailwind CSS 4
- **Auth:** NextAuth.js (v4)
- **Database:** SQLite via Prisma ORM
- **Email:** Nodemailer (SMTP)

## Documentation

For a comprehensive breakdown of every feature, its working mechanism, structural flow, access control, and implementation details, please refer to the [info.md](./info.md) file included in this repository.

## Environment Variables

Make sure to configure your environment variables based on `.env.example`.

- `DATABASE_URL` (Required)
- `NEXTAUTH_SECRET` (Required)
- `NEXTAUTH_URL` (Required)
- Other optional keys for OAuth, SMTP, etc.
