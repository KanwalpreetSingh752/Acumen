# PrepFlow — Full-Stack Technical Interview & CS Preparation Platform

[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Judge0%20CE-blue.svg)](https://judge0.com/)
[![Database](https://img.shields.io/badge/Database-Supabase%20%7C%20PostgreSQL-3ECF8E.svg)](https://supabase.com/)
[![UI Style](https://img.shields.io/badge/Style-Swiss%20Editorial-C66A35.svg)](#design-system--aesthetic)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](#license)

PrepFlow is an all-in-one technical interview preparation platform designed with a warm, distraction-free **Swiss Editorial aesthetic** (`#F0F1EC` background, `#111111` ink, `#C66A35` accent). It integrates self-paced conceptual study for core computer science topics with an in-browser LeetCode-style coding engine powered by sandboxed multi-language remote code execution (Judge0 CE).

---

## 📸 Key Features & Architecture Highlights

### 1. 📊 Mindrift-Inspired Analytics Dashboard
* **Real Activity Heatmap**: 52-week by 7-day contribution matrix mapping verified user actions (submissions, completed modules) with rounded squircle cells and activity intensity shading.
* **Live Progress Metrics**:
  * **Learning Streak & Active Days**: Computed dynamically from consecutive submission days.
  * **Curriculum Completion Gauge**: Calculated from database-backed progress across Operating Systems, Networks, DBMS, and System Design.
  * **Coding Practice Stats**: Displays accepted solutions, total submissions, and accuracy rates.
* **Subject Progress Breakdown**: Circular gauge rings tracking completion percentage per topic.
* **Skill Radar**: Vector polygon visualizing competency across Algorithms, Systems, Networks, Databases, and Architecture.

### 2. 💻 Sandboxed Coding Platform & Problem Judge (Judge0 CE + Monaco)
* **Monaco Code Editor**: Fully configured with custom `prepflow-light` theme (`#FCFCFA` glare-free editor surface, `#C66A35` cursor & syntax accents).
* **Multi-Language Support**:
  * **C++** (GCC 9.2.0)
  * **Java** (OpenJDK 13.0.1) with tuned Metaspace (`-XX:MetaspaceSize=32m -XX:MaxMetaspaceSize=64m`) and Serial GC
  * **Python** (3.8.1)
  * **JavaScript** (Node.js 12.14.0)
* **Dual Execution Modes**:
  * **DSA Problems Catalog**: Filter problems by difficulty (*Easy, Medium, Hard*) and topics (*Arrays, Hash Tables, Trees, DP*). Run code against visible test cases or submit against hidden test cases.
  * **Code Scratchpad**: Free-form isolated playground with arbitrary standard input (`stdin`) and live execution result streaming.

### 3. 📚 Core CS Conceptual Library
* **Study-First Philosophy**: Structured conceptual reading and architectural notes (not an intimidating interview room).
* **Key Takeaway Boxes**: Highlighting algorithmic trade-offs (e.g. CPU scheduling quantum sizing, DB transaction isolation levels, indexing mechanics).
* **Self-Paced Checklists**: Track progress and mark topics studied with persistent Supabase state.

### 4. 🎨 Editorial Swiss Design System
* **Warm Canvas**: Base background `#F0F1EC`, preventing harsh white monitor glare.
* **Typography**: Elegant serifs (`Newsreader`, 500-weight) paired with clean geometric body typography (`Inter`) and technical monospaces (`DM Mono`).
* **Subtle Surfaces**: Cards set to `#FCFCFA` / `#F6F7F2` with soft `#dedfd8` structural hairline borders.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Runtime & Backend** | Node.js (ESM), Express.js 5.x |
| **Code Execution Engine** | Judge0 CE v1.13.1 (Self-hosted via Docker Compose, isolated sandboxing) |
| **Database & Auth** | Supabase (PostgreSQL), Supabase Auth, Row-Level Security (RLS) |
| **Frontend** | Vanilla JS (ES Modules), Custom CSS3 variables, Monaco Editor 0.45.0 |
| **Typography** | Newsreader (Google Fonts), Inter, DM Mono |

---

## 📁 Repository Structure

```
InterviewPrep/
├── docker/
│   └── judge0/
│       ├── docker-compose.yml     # Self-hosted Judge0 CE, Postgres & Redis
│       ├── judge0.conf            # Judge0 environment & execution configs
│       └── init-java.sql          # OpenJDK 13 metaspace and heap bounding
├── public/
│   ├── index.html                 # Editorial landing page
│   ├── dashboard.html             # Mindrift analytics & workspace dashboard
│   ├── dashboard.js               # Analytics, heatmap & section controller
│   ├── mindrift-dashboard.css     # Analytics, cards, squircle cells & radar styles
│   ├── problem.html               # Dedicated two-pane problem solver
│   ├── problem.js                 # Monaco editor, test runner, judge evaluator
│   ├── problem.css                # Problem workspace layout & split panels
│   ├── core-subjects.html         # Standalone Core CS study reader
│   ├── dsa.html                   # DSA topic roadmap tracks
│   ├── development.html           # Career & development hub
│   └── admin/                     # Problem & Subject authoring portals
├── scripts/
│   ├── test-code-execution.js     # Verification suite for Judge0 languages
│   ├── test-phase2-e2e.js         # End-to-end problem submission test
│   └── run-migration.js           # Supabase database schema migrations
├── services/
│   └── judge0.js                  # Judge0 client, polling & payload encoding
├── server.js                      # Express API gateway & authentication middleware
└── package.json                   # Project manifest & scripts
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **Docker Desktop**: Running with WSL2 backend (for Windows users) or native Docker (Linux/macOS)
* **Supabase Project**: Free-tier or self-hosted Supabase database

---

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/<your-username>/InterviewPrep.git
cd InterviewPrep
npm install
```

---

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
NODE_ENV=development

# Supabase Credentials
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Judge0 Execution URL
JUDGE0_URL=http://localhost:2358

# Admin & Test Accounts
ADMIN_API_KEY=your-secure-admin-key
TEST_USER_EMAIL=user@example.com
TEST_USER_PASSWORD=YourSecurePassword123
```

---

### 3. Start Judge0 Code Execution Engine (Docker)
In a separate terminal, start the sandboxed Judge0 cluster:
```bash
cd docker/judge0
docker compose up -d
```

Verify containers are running:
```bash
docker ps
# Expected: judge0-server, judge0-workers, judge0-db, judge0-redis
```

*Note: For Java (OpenJDK 13.0.1) execution within virtual memory bounds, the database update in `init-java.sql` bounds compilation and runtime metaspace.*

---

### 4. Run Verification Suite
Confirm Judge0 executes all supported languages (C++, Python, Java, JavaScript) and handles runtime exceptions:
```bash
npm run test:code
```
Expected output:
```text
======================================================
 Starting Judge0 CE Automated Verification Test Suite
 Target Judge0 URL: http://localhost:2358
======================================================
[Test 1] C++ (GCC) Execution with stdin ... ✓ PASSED
[Test 2] Python Execution with stdin ... ✓ PASSED
[Test 3] Java Execution with stdin ... ✓ PASSED
[Test 4] JavaScript (Node.js) Execution ... ✓ PASSED
[Test 5] C++ Compilation Error Detection ... ✓ PASSED
[Test 6] Python Runtime Error Detection ... ✓ PASSED
[Test 7] Python Time Limit Exceeded Detection ... ✓ PASSED
------------------------------------------------------
 Test Summary: 7 / 7 tests passed.
------------------------------------------------------
```

---

### 5. Start the Application Server
```bash
npm run dev
```

Visit the application in your browser:
* **Landing Page**: [http://localhost:3000](http://localhost:3000)
* **Dashboard & Analytics**: [http://localhost:3000/dashboard.html](http://localhost:3000/dashboard.html)
* **Problem Workspace**: [http://localhost:3000/problems/two-sum](http://localhost:3000/problems/two-sum)

---

## 🧪 Testing Problem Submissions

You can submit solutions programmatically or through the Monaco UI. To test the Two Sum problem against hidden judge cases:
```bash
node scripts/test-two-sum-submit.mjs
```

---

## 🛡 Security & Sandboxing
* **Code Isolation**: All code execution occurs inside ephemeral Docker containers without network access or host file system privileges.
* **Hidden Test Case Protection**: Hidden test cases and expected outputs are evaluated strictly server-side and never sent to client browsers.
* **Resource Quotas**: Wall time (5s), CPU limits, and memory limits are enforced at the container boundary to guard against infinite loops and fork bombs.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).