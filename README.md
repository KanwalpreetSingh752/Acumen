# Acumen

Acumen is an engineering interview preparation and computer science education platform. It provides a structured, self-paced study environment for core systems topics alongside a sandboxed, multi-language code execution engine and an activity analytics dashboard.

---

## Architecture Overview

```
                      +-----------------------------------+
                      |         Web Client                |
                      |  (Monaco Editor, Modular Views)   |
                      +-----------------+-----------------+
                                        | HTTP / JSON
                                        v
                      +-----------------+-----------------+
                      |     Express.js API Gateway        |
                      |   (Auth, Routing, Rate Limits)    |
                      +--------+------------------+-------+
                               |                  |
           +-------------------+                  +-------------------+
           v                                                          v
+----------------------+                                   +-----------------------+
|  Supabase (Postgres) |                                   | Judge0 CE (Sandbox)   |
|  - Users & Sessions  |                                   | - Worker Instances    |
|  - Progress State    |                                   | - Redis Job Queue     |
|  - Submissions Audit |                                   | - Isolated Runtimes   |
+----------------------+                                   +-----------------------+
```

The system comprises three primary layers:

1. **Client Layer**: Modular web interface incorporating Monaco Editor (`0.45.0`), customized with the `acumen-light` color palette, synchronized state, and an SVG-based analytics timeline.
2. **Application Gateway**: Node.js and Express 5 backend managing authentication tokens, request validation, problem metadata distribution, and evaluation pipelines.
3. **Execution Sandbox**: Multi-container Judge0 CE deployment running isolated workers against an internal Redis queue with configured time, memory, and thread ceilings.

---

## Core Systems

### 1. Sandboxed Code Execution Engine
Remote code evaluation is delegated to an isolated Judge0 CE cluster. Source payloads and standard inputs are encoded in Base64 for transport safety, submitted asynchronously, and polled with exponential backoff until completion.

* **Supported Languages**:
  * C++ (GCC 9.2.0)
  * Java (OpenJDK 13.0.1)
  * Python (3.8.1)
  * JavaScript (Node.js 12.14.0)
* **JVM Sandbox Tuning**: OpenJDK 13 includes bounded virtual memory reservations (`-XX:MetaspaceSize=32m -XX:MaxMetaspaceSize=64m -Xms32m -Xmx128m -XX:+UseSerialGC`) to avoid virtual memory allocation failures under container process limits.
* **Evaluation Pipeline**:
  * **Run**: Compiles and executes code against visible test vectors for immediate debugging.
  * **Submit**: Runs full validation against hidden database-backed test cases without exposing inputs, expected outputs, or test count metadata to the client.

### 2. User Analytics & Progress Tracking
The overview dashboard presents verified, database-derived metrics without client-side mock data:
* **Activity Heatmap**: 52-week by 7-day contribution matrix generated from timestamped submissions and completed modules.
* **Streak Computation**: Sequential activity tracking calculated from continuous active calendar dates.
* **Curriculum Completion**: Aggregated progress computed across Operating Systems, Computer Networks, Database Management Systems, and System Design.
* **Evaluation Accuracy**: Success-to-failure ratio derived from recorded submission outcomes in PostgreSQL.

### 3. Core Computer Science Library
Designed around conceptual retention rather than algorithmic drilling:
* Comprehensive notes covering Operating Systems, Networks, DBMS, and Distributed Systems.
* Algorithmic and architectural trade-off analyses (e.g., CPU scheduling quantum sizing, isolation levels, buffer cache replacement strategies).
* Independent progress toggling synchronized per authenticated account.

---

## Technical Specifications

| Component | Implementation |
|---|---|
| Runtime | Node.js (ES Modules, v18+) |
| HTTP Framework | Express.js 5.x |
| Database & Identity | PostgreSQL via Supabase, Row-Level Security (RLS) |
| Remote Code Execution | Judge0 CE v1.13.1 (Docker Compose) |
| Task Queue (Judge0) | Redis 7.2.4 |
| Code Editor | Monaco Editor 0.45.0 |
| Styling & Typography | Vanilla CSS3, Newsreader (Serif), Inter, DM Mono |

---

## Project Structure

```
.
├── docker/
│   └── judge0/
│       ├── docker-compose.yml       # Judge0 server, workers, Redis, and internal DB
│       ├── judge0.conf              # Sandbox quotas, network configs, and runtime settings
│       └── init-java.sql            # Database bootstrap configuring JVM memory constraints
├── public/
│   ├── index.html                   # Landing page
│   ├── dashboard.html               # Main workspace and analytics interface
│   ├── dashboard.js                 # Workspace orchestration and analytics renderer
│   ├── mindrift-dashboard.css       # Layout and widget stylesheets
│   ├── problem.html                 # Coding workspace interface
│   ├── problem.js                   # Monaco editor integration and evaluation runner
│   ├── problem.css                  # Dual-pane code layout styles
│   ├── core-subjects.html           # Systems and architecture reader
│   ├── dsa.html                     # Algorithm roadmaps
│   └── admin/                       # Content authoring tools
├── scripts/
│   ├── test-code-execution.js       # Automated end-to-end sandbox test suite
│   ├── test-phase2-e2e.js           # Problem submission verification script
│   └── run-migration.js             # Schema migration utility
├── services/
│   └── judge0.js                    # Judge0 client and output normalization
├── server.js                        # API Gateway and middleware configuration
└── package.json                     # Project manifest and command scripts
```

---

## Setup and Deployment

### Prerequisites
* **Node.js**: Version 18.0.0 or higher
* **Docker Engine & Docker Compose**: v2.0+ (Docker Desktop with WSL2 on Windows, or native Docker on Linux/macOS)
* **Supabase Project**: Active PostgreSQL instance with migration schemas applied

### 1. Clone Repository and Install Dependencies
```bash
git clone https://github.com/<your-organization>/Acumen.git
cd Acumen
npm install
```

### 2. Environment Configuration
Create a `.env` file in the project root:
```env
PORT=3000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Judge0 Execution URL
JUDGE0_URL=http://localhost:2358

# Administration
ADMIN_API_KEY=your-admin-api-key
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=YourSecurePassword123
```

### 3. Initialize Sandboxed Execution Engine
Deploy the Judge0 service stack:
```bash
cd docker/judge0
docker compose up -d
```

Verify that all service containers are healthy:
```bash
docker compose ps
```
The stack should list:
* `judge0-server` (Port 2358)
* `judge0-workers`
* `judge0-db` (Postgres)
* `judge0-redis`

### 4. Execute Sandbox Verification Suite
Run the test harness to confirm compiler configurations, execution sandboxing, and output evaluation across all runtimes:
```bash
npm run test:code
```

Expected output:
```text
======================================================
 Starting Judge0 CE Automated Verification Test Suite
 Target Judge0 URL: http://localhost:2358
======================================================
[Test 1] C++ (GCC) Execution with stdin ... PASSED
[Test 2] Python Execution with stdin ... PASSED
[Test 3] Java Execution with stdin ... PASSED
[Test 4] JavaScript (Node.js) Execution ... PASSED
[Test 5] C++ Compilation Error Detection ... PASSED
[Test 6] Python Runtime Error Detection ... PASSED
[Test 7] Python Time Limit Exceeded Detection ... PASSED
------------------------------------------------------
 Test Summary: 7 / 7 tests passed.
------------------------------------------------------
```

### 5. Start Application Gateway
Start the local Express server:
```bash
npm run dev
```

Application endpoints:
* Platform Landing Page: `http://localhost:3000`
* Analytics & Study Dashboard: `http://localhost:3000/dashboard.html`
* Problem Practice Workspace: `http://localhost:3000/problems/two-sum`

---

## Verification & Testing

### Submission API Verification
To programmatically test the full submission loop, token authentication, and hidden test validation:
```bash
node scripts/test-phase2-e2e.js
```

### Manual Test Run
To test submission directly against the active Judge0 worker with both Java and Python payloads:
```bash
node scripts/test-two-sum-submit.mjs
```

---

## Security Model

* **Runtime Sandboxing**: User-submitted code executes in unprivileged containers with dropped capabilities, non-root user execution, and no outbound host network access.
* **Process and Resource Quotas**: Hard process constraints enforce a 5-second CPU time ceiling, restricted thread counts, and memory boundaries to prevent denial-of-service via infinite recursion or fork attacks.
* **Hidden Test Protection**: Production test suites and assertion parameters are isolated within the database tier and evaluated server-side. Clients receive aggregate pass/fail results and execution metrics without exposed test inputs.
* **Input Sanitization**: Source code and standard input buffers are subject to size limits (64 KB and 32 KB respectively) prior to submission dispatch.

---

## License

This software is distributed under the MIT License. See [LICENSE](LICENSE) for details.
