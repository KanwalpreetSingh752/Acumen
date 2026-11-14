# Acumen

Acumen is a full-stack interview-preparation platform for learning core computer-science concepts and practicing coding problems in a browser-based workspace. It combines structured study roadmaps, progress and activity analytics, problem authoring, and isolated multi-language code execution.

> **Status:** Active development. The application is intended for local development and self-hosted environments.

## What it provides

- **Structured learning:** Roadmaps and reading content for operating systems, computer networks, database systems, distributed systems, and related subjects.
- **Coding practice:** Problem catalog, difficulty and topic metadata, starter code, examples, visible test cases, and hidden test cases.
- **Browser coding workspace:** Monaco Editor integration with C++, Java, Python, and JavaScript support.
- **Safe evaluation flow:** Separate `Run` and `Submit` flows, with hidden tests evaluated server-side through Judge0.
- **Progress and analytics:** Authenticated progress tracking, streaks, activity history, completion metrics, and submission outcomes.
- **Administrative authoring:** Protected interfaces for managing problems, topics, subjects, headings, and subheadings.

## Architecture

```text
Browser
  |
  v
Express application
  |-- Static web client (public/)
  |-- Authentication and application APIs
  |-- Supabase synchronization and authorization
  |-- MongoDB subject-content persistence
  |
  `--> Judge0 CE
         |-- Redis queue
         |-- PostgreSQL
         `-- Isolated execution workers
```

### Main components

| Component | Role |
| --- | --- |
| Node.js + Express 5 | Application server, authentication, APIs, and static-file hosting |
| Vanilla HTML, CSS, and JavaScript | Browser application and administrative interfaces |
| Supabase | Hosted authentication, profiles, progress, problems, topics, and submissions |
| MongoDB | Subject-content persistence used by the server |
| Judge0 CE 1.13.1 | Sandboxed code execution |
| Redis 7.2.4 | Judge0 job queue |
| PostgreSQL 16.2 | Judge0 internal database |
| Monaco Editor | In-browser code editor |

## Repository layout

```text
.
├── docker/judge0/             # Judge0, worker, Redis, and PostgreSQL stack
├── public/                    # Static application pages, scripts, and styles
│   └── admin/                 # Problem and subject authoring interfaces
├── scripts/                   # Migration, administration, and verification scripts
├── services/judge0.js         # Judge0 client, validation, polling, and normalization
├── supabase/migrations/       # Supabase schema and RLS migrations
├── local_*.json               # Local fallback content and user data
├── server.js                  # Express application entry point
├── package.json               # Scripts and runtime dependencies
└── LICENSE
```

## Requirements

- Node.js 18 or newer
- npm
- MongoDB, reachable through `MONGODB_URI`
- A Supabase project for cloud-backed authentication and application data
- Docker Desktop or Docker Engine with Docker Compose v2 for Judge0

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/KanwalpreetSingh752/InterviewPrep.git
cd InterviewPrep
npm install
```

### 2. Configure environment variables

Create a local `.env` file. Do not commit it.

```dotenv
NODE_ENV=development
PORT=3000

# Required by the application server
MONGODB_URI=mongodb://127.0.0.1:27017/acumen

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Code execution
JUDGE0_URL=http://localhost:2358

# Use strong, unique values outside local development
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_API_KEY=replace-with-a-long-random-secret

# Required by the end-to-end submission test
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=replace-with-a-test-password
```

`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, and `ADMIN_API_KEY` are sensitive. Keep them server-side and never expose them in client code or commit them to source control.

### 3. Apply Supabase migrations

Run the SQL files in `supabase/migrations/` in your Supabase project's SQL Editor, in filename order:

1. `20260930_problem_authoring.sql`
2. `20260930_phase2_submissions.sql`

The migrations create the problem-authoring and submission tables, indexes, helper functions, and row-level security policies. They do not seed problems or hidden test cases.

### 4. Start Judge0

From the repository root:

```bash
cd docker/judge0
docker compose up -d
docker compose ps
cd ../..
```

Judge0 is exposed locally at `http://localhost:2358`. Confirm that the `server`, `workers`, `db`, and `redis` services are running before testing code execution.

### 5. Start Acumen

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful pages include:

- `/` - landing page
- `/dashboard.html` - study dashboard and analytics
- `/core-subjects.html` - core-subject reader
- `/dsa.html` - algorithm roadmap
- `/problems/<slug>` - coding workspace
- `/admin/problems.html` - problem authoring
- `/admin/subjects.html` - subject authoring

## npm scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm start` | Start the application server |
| `npm run seed` | Synchronize roadmap data using `scripts/run-migration.js` |
| `npm run test:code` | Verify Judge0 execution across supported languages and failure modes |
| `npm run test:phase2` | Run the authenticated submission-flow end-to-end test |
| `npm run grant:problem-admin -- <email>` | Grant problem-authoring access to a Supabase profile |

The end-to-end submission test requires a running application, a reachable Supabase project, seeded problem data, Judge0, and the `TEST_USER_*` variables.

## Supported languages

The application currently exposes these language keys:

| Language | Judge0 runtime |
| --- | --- |
| C++ | GCC |
| Java | OpenJDK |
| Python | Python |
| JavaScript | Node.js |

Source code and standard input are validated before dispatch. The Judge0 client enforces bounded payload sizes, polls asynchronously for completion, and normalizes execution results for the application API.

## API areas

The Express server exposes APIs for:

- `/api/auth/*` - registration, login, logout, and current-user lookup
- `/api/roadmaps`, `/api/progress`, `/api/analytics` - learning state and dashboard data
- `/api/problems`, `/api/topics` - public problem catalog
- `/api/problems/:id/run` and `/api/problems/:id/submit` - visible execution and hidden-test submission
- `/api/problems/:id/submissions` - authenticated submission history
- `/api/code/languages` and `/api/code/run` - standalone sandbox execution
- `/api/admin/*` - protected problem, topic, and subject authoring operations

Refer to [`server.js`](server.js) for the authoritative route behavior and validation rules.

## Security considerations

- Run Judge0 in an isolated environment and review its resource limits before exposing it beyond localhost.
- Keep Supabase service-role credentials, JWT secrets, and administrative keys out of the browser and source control.
- Hidden test cases are evaluated on the server and should not be returned to clients.
- Supabase submission data is protected with row-level security policies for authenticated users.
- Use strong, environment-specific secrets and set `NODE_ENV=production` only with a production-ready deployment configuration.
- The included Docker Compose file uses privileged Judge0 containers; review the operational and host-isolation implications before production use.

## Troubleshooting

### The server exits immediately

Confirm that `MONGODB_URI` is set and that MongoDB is reachable. The application requires this variable at startup.

### Supabase features are unavailable

Check `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then verify network access from the machine running Node.js. The server can use local fallback files for some development flows, but cloud-backed authentication, progress, and submissions require Supabase.

### Code execution does not complete

Check the Judge0 services and logs:

```bash
cd docker/judge0
docker compose ps
docker compose logs server workers --tail=100
```

Then confirm that `JUDGE0_URL` matches the address exposed by the Judge0 `server` container.

## Contributing

1. Create a focused branch.
2. Keep credentials and local data out of commits.
3. Make the smallest change that addresses the issue.
4. Run the relevant verification script before opening a pull request.
5. Document user-visible or operational changes.

## License

Acumen is available under the [MIT License](LICENSE).
