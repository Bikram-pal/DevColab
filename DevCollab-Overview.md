# DevCollab Overview

## What DevCollab Is
DevCollab is a collaborative project workspace app for teams. It combines authentication, workspace management, project boards, task tracking, wiki pages, code snippets, activity history, notifications, invites, and AI-assisted workflows in a single full-stack product.

## High-Level Architecture
- Backend: Node.js, Express, MongoDB, Socket.IO.
- Frontend: React, Vite, Tailwind CSS, React Router, Socket.IO client.
- Shared pattern: REST APIs for persistence plus real-time socket events for collaboration.

The backend boots an Express app, connects to MongoDB, exposes REST endpoints under `/api`, serves uploads, and registers Socket.IO namespaces for live board, presence, and notification events.

The frontend uses route guards for authentication and workspace onboarding, then renders feature pages for the dashboard, kanban board, snippets, wiki, activity, AI, settings, and pricing.

## Backend Breakdown
### Core entry points
- `backend/server.js`: Express + HTTP server + Socket.IO bootstrap.
- `backend/config/db.js`: database connection.
- `backend/config/socket.js`: Socket.IO instance management and helpers for emitting into projects, workspaces, and users.

### API surface
- `auth.routes.js`: authentication flows.
- `user.routes.js`: user profile and account access.
- `workspace.routes.js`: workspace creation and management.
- `project.routes.js`: project-level operations.
- `task.routes.js`: task CRUD, move, comments, and attachments.
- `snippet.routes.js`: code snippet storage and retrieval.
- `wiki.routes.js`: collaborative wiki pages.
- `activity.routes.js`: activity timeline.
- `notification.routes.js`: notifications.
- `invite.routes.js`: workspace or project invites.
- `ai.routes.js`: AI-related actions.

### Backend features
- Authentication and authorization middleware.
- Role-based access control for members, viewers, and admins.
- File upload support through Multer.
- Activity logging and notifications.
- Comment mentions and task assignment notifications.
- Real-time board broadcasts for task create, update, move, delete, and comment activity.

### Data models
- `User`, `Workspace`, `Project`.
- `Task`, `Snippet`, `WikiPage`.
- `Invite`, `Notification`, `ActivityLog`.

## Frontend Breakdown
### App structure
- `src/main.jsx`: React root.
- `src/App.jsx`: route definitions and context providers.
- `src/context/*`: auth, theme, and workspace state.
- `src/lib/api.js`: Axios client with auth headers and response handling.
- `src/lib/socket.js`: Socket.IO client instances for board, presence, and notifications.

### Main routes
- `/login`, `/signup`: authentication.
- `/onboarding/workspace`: initial workspace setup.
- `/dashboard`: workspace overview.
- `/project/:id/board`: kanban board.
- `/project/:id/snippets`: snippets.
- `/project/:id/wiki`: wiki.
- `/project/:id/activity`: activity feed.
- `/project/:id/ai`: AI page.
- `/settings/workspace`, `/settings/profile`: settings.
- `/upgrade`: pricing and upgrade page.

### Frontend feature areas
- Layout primitives in `components/layout`.
- Kanban UI in `components/kanban`.
- Shared UI primitives in `components/ui`.
- Page-level feature screens in `pages/`.

## Real-Time Collaboration
DevCollab uses Socket.IO for live collaboration.

- Board namespace: task updates are broadcast per project.
- Presence namespace: viewer and presence state is shared in real time.
- Notification namespace: user notifications can be pushed instantly.

The kanban board now supports drag-and-drop with optimistic updates, local state reconciliation, and socket cleanup so repeated events do not duplicate tasks.

## Kanban Board Behavior
- Tasks are grouped by status: todo, in_progress, in_review, done.
- Moving a task updates the UI immediately and then syncs to the backend.
- Task details are shown in a sidebar with live comment updates.
- The board is responsive for smaller screens and uses loading skeletons while data is loading.
- Drag-and-drop uses `@dnd-kit/core` and `@dnd-kit/utilities`.

## Runtime Flow
1. The frontend loads the authenticated app shell.
2. The workspace gate redirects users who still need onboarding.
3. The kanban page fetches tasks grouped by status.
4. Socket listeners join the board and presence rooms.
5. Local changes are applied optimistically.
6. Backend persistence and socket broadcasts keep other clients in sync.

## Environment Notes
- Backend dev command: `npm run dev` from `backend/`.
- Frontend dev command: `npm run dev` from `frontend/`.
- Frontend production build currently succeeds.
- Key env variables used by the codebase include `CLIENT_URL`, `PORT`, `VITE_API_URL`, and `VITE_SOCKET_URL`.

## Current Implementation Focus
The current codebase is centered on team collaboration, task execution, and live multi-user synchronization. The most important product surfaces are the kanban board, workspaces, project content areas, and the notification/presence layer that keeps users connected while they work.