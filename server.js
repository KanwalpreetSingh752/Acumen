import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { executeCodeSubmission, SUPPORTED_LANGUAGES, normalizeOutput, getSupportedLanguageByIdOrKey } from './services/judge0.js';

const app = express();
const dirname = path.dirname(fileURLToPath(import.meta.url));
const { MONGODB_URI, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET = 'prepflow-local-secret-key-2026', ADMIN_API_KEY = 'prepflow-admin-secret-2026', NODE_ENV = 'development', PORT = 3000 } = process.env;

if (!MONGODB_URI) throw new Error('MONGODB_URI is required. Add it to your .env file.');

const supabase = createClient(SUPABASE_URL || 'https://localhost.supabase.co', SUPABASE_ANON_KEY || 'dummy-anon-key');
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL || 'https://localhost.supabase.co', SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : supabase;

// ── Supabase availability gate ────────────────────────────────────────────────
// Probe Supabase once at startup. If DNS/network fails, set flag to false so
// every route skips the Supabase call immediately instead of waiting ~7s to timeout.
let supabaseAvailable = false;
async function probeSupabase() {
  if (!SUPABASE_URL || SUPABASE_URL.includes('localhost')) {
    console.warn('[supabase] No real SUPABASE_URL set — running fully local.');
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000); // 3s max
    await fetch(`${SUPABASE_URL}/rest/v1/`, { signal: controller.signal, headers: { apikey: SUPABASE_ANON_KEY || '' } });
    clearTimeout(timer);
    supabaseAvailable = true;
    console.log('[supabase] ✓ Reachable — cloud sync enabled.');
  } catch {
    supabaseAvailable = false;
    console.warn('[supabase] ✗ Unreachable — running in local-only mode (fast local fallback active).');
  }
}

// MongoDB Subject Schema & Model (subjects ONLY in MongoDB)
const subheadingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  text: { type: String, default: '' }
}, { _id: false });

const headingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  text: { type: String, default: '' },
  subheadings: [subheadingSchema]
}, { _id: false });

const subjectSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '◫' },
  order: { type: Number, default: 0 },
  headings: [headingSchema]
});
const Subject = mongoose.models.Subject || mongoose.model('Subject', subjectSchema);

const SUBJECTS_FILE = path.join(dirname, 'local_subjects.json');

function loadLocalSubjects() {
  try {
    if (fs.existsSync(SUBJECTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SUBJECTS_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.error('Error loading local_subjects.json:', e);
  }
  return [];
}

function saveLocalSubjects(subjects) {
  try {
    fs.writeFileSync(SUBJECTS_FILE, JSON.stringify(subjects, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving local_subjects.json:', e);
  }
}

app.use(express.json());

function getSessionToken(req) {
  return (req.headers.cookie || '').split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith('prepflow_token='))?.slice('prepflow_token='.length);
}

function sendAuthCookie(res, accessToken) {
  res.cookie('prepflow_token', accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

const USERS_FILE = path.join(dirname, 'local_users.json');

function loadLocalUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (e) { console.error('Error loading local_users.json:', e); }
  return [];
}

function saveLocalUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) { console.error('Error saving local_users.json:', e); }
}

(async () => {
  const users = loadLocalUsers();
  const defaultAdminEmail = 'kanwalpreetsingh807@gmail.com';
  let adminUser = users.find(u => u.email.toLowerCase() === defaultAdminEmail);
  if (!adminUser) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('Kanwal@2026', salt);
    users.push({
      id: 'local-admin-807',
      name: 'Kanwalpreet Singh',
      email: defaultAdminEmail,
      passwordHash: hash,
      isAdmin: true,
      createdAt: new Date().toISOString()
    });
    saveLocalUsers(users);
  }
})();

async function getAuthUser(req) {
  const token = getSessionToken(req);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.id) {
      const users = loadLocalUsers();
      const localUser = users.find(u => u.id === decoded.id || u.email.toLowerCase() === decoded.email?.toLowerCase());
      if (localUser) {
        return { id: localUser.id, email: localUser.email, user_metadata: { name: localUser.name }, name: localUser.name, isAdmin: Boolean(localUser.isAdmin) };
      }
      return { id: decoded.id, email: decoded.email, user_metadata: { name: decoded.name }, name: decoded.name, isAdmin: Boolean(decoded.isAdmin) };
    }
  } catch (_) {}

  if (supabaseAvailable) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) return user;
    } catch (_) {}
  }

  return null;
}

async function requireProblemAdmin(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to access Problem Management.' });
    let isAdmin = Boolean(user.isAdmin);
    if (!isAdmin && user.id) {
      try {
        const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single();
        isAdmin = Boolean(profile?.is_admin);
      } catch (_) {}
    }
    if (!isAdmin) return res.status(403).json({ error: 'You are not authorized to manage problems.' });
    req.adminUser = user;
    next();
  } catch (error) { next(error); }
}

const SUPPORTED_PROBLEM_LANGUAGES = new Set(['cpp', 'java', 'python', 'javascript']);
const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
function validateProblemPayload(body, id) {
  const problem = {
    id: id || undefined,
    title: String(body.title || '').trim(), slug: String(body.slug || '').trim(), difficulty: String(body.difficulty || ''),
    description: String(body.description || ''), constraints: String(body.constraints || ''), input_format: String(body.input_format || ''), output_format: String(body.output_format || ''),
    topic_ids: Array.isArray(body.topic_ids) ? body.topic_ids : [], examples: Array.isArray(body.examples) ? body.examples : [],
    test_cases: Array.isArray(body.test_cases) ? body.test_cases : [], starter_code: Array.isArray(body.starter_code) ? body.starter_code : []
  };
  if (!problem.title || !problem.description) return { error: 'Title and description are required.' };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(problem.slug)) return { error: 'Slug must use lowercase letters, numbers, and single hyphens.' };
  if (!DIFFICULTIES.has(problem.difficulty)) return { error: 'Difficulty must be Easy, Medium, or Hard.' };
  if (new Set(problem.topic_ids).size !== problem.topic_ids.length) return { error: 'Topics cannot be repeated.' };
  for (const example of problem.examples) if (typeof example.input !== 'string' || typeof example.output !== 'string') return { error: 'Every example needs input and output.' };
  for (const testCase of problem.test_cases) if (typeof testCase.input !== 'string' || typeof testCase.expected_output !== 'string' || typeof testCase.is_hidden !== 'boolean') return { error: 'Every test case needs input, expected output, and visibility.' };
  for (const code of problem.starter_code) if (!SUPPORTED_PROBLEM_LANGUAGES.has(code.language) || typeof code.code !== 'string' || Buffer.byteLength(code.code, 'utf8') > 65536) return { error: 'Starter code is invalid or exceeds 64 KB.' };
  if (new Set(problem.starter_code.map((item) => item.language)).size !== problem.starter_code.length) return { error: 'Starter code languages cannot be repeated.' };
  return { problem };
}

// ── Auth Routes ──
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Enter a name between 2 and 80 characters.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Use a password with at least 8 characters.' });

    const users = loadLocalUsers();
    let localUser = users.find(u => u.email.toLowerCase() === email);
    if (localUser) {
      return res.status(400).json({ error: 'User already exists with this email address.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const isAdmin = email === 'kanwalpreetsingh807@gmail.com' || email === 'kanwalpreetsingh927@gmail.com';

    localUser = { id: userId, name, email, passwordHash, isAdmin, createdAt: new Date().toISOString() };
    users.push(localUser);
    saveLocalUsers(users);

    const token = jwt.sign(
      { id: localUser.id, email: localUser.email, name: localUser.name, isAdmin: localUser.isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    sendAuthCookie(res, token);
    return res.status(201).json({ user: { id: localUser.id, name: localUser.name, email: localUser.email, isAdmin } });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
    
    const users = loadLocalUsers();
    const localUser = users.find(u => u.email.toLowerCase() === email);
    if (localUser) {
      const match = await bcrypt.compare(password, localUser.passwordHash);
      if (match) {
        const token = jwt.sign(
          { id: localUser.id, email: localUser.email, name: localUser.name, isAdmin: localUser.isAdmin },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        sendAuthCookie(res, token);
        return res.json({ user: { id: localUser.id, name: localUser.name, email: localUser.email, isAdmin: Boolean(localUser.isAdmin) } });
      }
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        const user = data.user;
        let profile = null;
        try {
          const { data: prof } = await supabaseAdmin.from('profiles').select('name, email, is_admin').eq('id', user.id).single();
          profile = prof;
        } catch (_) {}
        const name = profile?.name || user.user_metadata?.name || 'User';
        sendAuthCookie(res, data.session.access_token);
        return res.json({ user: { id: user.id, name, email: user.email, isAdmin: Boolean(profile?.is_admin) } });
      }
    } catch (_) {}

    return res.status(401).json({ error: 'Email or password is incorrect.' });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('prepflow_token');
  res.status(204).end();
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });

    res.json({ user: { id: user.id, name: user.user_metadata?.name || user.name || 'User', email: user.email, isAdmin: Boolean(user.isAdmin) } });
  } catch (error) { next(error); }
});

const PROBLEMS_FILE = path.join(dirname, 'local_problems.json');

const DEFAULT_TOPICS = [
  { id: 'topic-arrays', name: 'Arrays' },
  { id: 'topic-strings', name: 'Strings' },
  { id: 'topic-hash-table', name: 'Hash Table' },
  { id: 'topic-dp', name: 'Dynamic Programming' },
  { id: 'topic-graphs', name: 'Graphs' },
  { id: 'topic-two-pointers', name: 'Two Pointers' }
];

const SEED_PROBLEMS = [
  {
    id: 'prob-two-sum',
    title: 'Two Sum',
    slug: 'two-sum',
    difficulty: 'Easy',
    description: 'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.',
    constraints: '2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9',
    input_format: 'First line contains element count N and target integer.\nSecond line contains N space-separated integers.',
    output_format: 'Print the 0-indexed indices of the two numbers separated by a space.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    topic_ids: ['topic-arrays', 'topic-hash-table'],
    topics: [
      { id: 'topic-arrays', name: 'Arrays' },
      { id: 'topic-hash-table', name: 'Hash Table' }
    ],
    examples: [
      {
        input: '4 9\n2 7 11 15',
        output: '0 1',
        explanation: 'Because nums[0] + nums[1] == 9, we return 0 1.'
      }
    ],
    test_cases: [
      {
        id: 'tc-1',
        input: '4 9\n2 7 11 15',
        expected_output: '0 1',
        is_hidden: false,
        display_order: 0
      },
      {
        id: 'tc-2',
        input: '3 6\n3 2 4',
        expected_output: '1 2',
        is_hidden: false,
        display_order: 1
      },
      {
        id: 'tc-3',
        input: '2 6\n3 3',
        expected_output: '0 1',
        is_hidden: true,
        display_order: 2
      }
    ],
    starter_code: [
      {
        language: 'cpp',
        code: `#include <iostream>\n#include <vector>\n#include <unordered_map>\nusing namespace std;\n\nint main() {\n    int n, target;\n    if (cin >> n >> target) {\n        vector<int> nums(n);\n        for (int i = 0; i < n; i++) cin >> nums[i];\n        unordered_map<int, int> mp;\n        for (int i = 0; i < n; i++) {\n            int diff = target - nums[i];\n            if (mp.count(diff)) {\n                cout << mp[diff] << " " << i << endl;\n                return 0;\n            }\n            mp[nums[i]] = i;\n        }\n    }\n    return 0;\n}`
      },
      {
        language: 'python',
        code: `import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data: return\n    n = int(data[0])\n    target = int(data[1])\n    nums = [int(x) for x in data[2:2+n]]\n    mp = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in mp:\n            print(f"{mp[diff]} {i}")\n            return\n        mp[num] = i\n\nif __name__ == '__main__':\n    main()`
      },
      {
        language: 'java',
        code: `import java.util.Scanner;\nimport java.util.HashMap;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            int target = sc.nextInt();\n            int[] nums = new int[n];\n            for (int i = 0; i < n; i++) nums[i] = sc.nextInt();\n            HashMap<Integer, Integer> map = new HashMap<>();\n            for (int i = 0; i < n; i++) {\n                int diff = target - nums[i];\n                if (map.containsKey(diff)) {\n                    System.out.println(map.get(diff) + " " + i);\n                    return;\n                }\n                map.put(nums[i], i);\n            }\n        }\n    }\n}`
      },
      {
        language: 'javascript',
        code: `const fs = require('fs');\n\nfunction main() {\n    const data = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n    if (data.length < 2) return;\n    const n = Number(data[0]);\n    const target = Number(data[1]);\n    const nums = data.slice(2, 2 + n).map(Number);\n    const map = new Map();\n    for (let i = 0; i < nums.length; i++) {\n        const diff = target - nums[i];\n        if (map.has(diff)) {\n            console.log(\`\${map.get(diff)} \${i}\`);\n            return;\n        }\n        map.set(nums[i], i);\n    }\n}\nmain();`
      }
    ]
  }
];

function loadLocalProblems() {
  try {
    if (fs.existsSync(PROBLEMS_FILE)) {
      return JSON.parse(fs.readFileSync(PROBLEMS_FILE, 'utf8'));
    }
  } catch (e) { console.error('Error loading local_problems.json:', e); }
  saveLocalProblems(SEED_PROBLEMS);
  return SEED_PROBLEMS;
}

function saveLocalProblems(probs) {
  try {
    fs.writeFileSync(PROBLEMS_FILE, JSON.stringify(probs, null, 2), 'utf8');
  } catch (e) { console.error('Error saving local_problems.json:', e); }
}

// ── Problem Management ──
app.get('/api/admin/topics', requireProblemAdmin, async (_req, res, next) => {
  try {
    try {
      const { data, error } = await supabaseAdmin.from('topics').select('id,name').order('name');
      if (!error && data) return res.json({ topics: data });
    } catch (_) {}
    res.json({ topics: DEFAULT_TOPICS });
  } catch (error) { next(error); }
});

app.get('/api/admin/problems', requireProblemAdmin, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const difficulty = String(req.query.difficulty || '');

    try {
      let query = supabaseAdmin.from('problems').select('id,title,slug,difficulty,created_at,problem_topics(topics(id,name))').order('updated_at', { ascending: false });
      if (search) query = query.ilike('title', `%${search}%`);
      if (difficulty) { if (!DIFFICULTIES.has(difficulty)) return res.status(400).json({ error: 'Invalid difficulty.' }); query = query.eq('difficulty', difficulty); }
      const { data, error } = await query;
      if (!error && data) {
        return res.json({ problems: data.map((problem) => ({ ...problem, topics: problem.problem_topics.map((link) => link.topics).filter(Boolean) })) });
      }
    } catch (_) {}

    let problems = loadLocalProblems();
    if (search) problems = problems.filter(p => p.title.toLowerCase().includes(search));
    if (difficulty) problems = problems.filter(p => p.difficulty === difficulty);

    res.json({ problems: problems.map(p => ({ id: p.id, title: p.title, slug: p.slug, difficulty: p.difficulty, created_at: p.created_at, topics: p.topics || [] })) });
  } catch (error) { next(error); }
});

app.get('/api/admin/problems/:id', requireProblemAdmin, async (req, res, next) => {
  try {
    try {
      const { data, error } = await supabaseAdmin.from('problems').select('*,problem_examples(*),problem_test_cases(*),problem_topics(topic_id,topics(id,name)),problem_starter_code(*)').eq('id', req.params.id).single();
      if (!error && data) {
        data.examples = data.problem_examples.sort((a,b) => a.display_order - b.display_order);
        data.test_cases = data.problem_test_cases.sort((a,b) => a.display_order - b.display_order);
        data.topic_ids = data.problem_topics.map((link) => link.topic_id);
        data.starter_code = data.problem_starter_code;
        delete data.problem_examples; delete data.problem_test_cases; delete data.problem_topics; delete data.problem_starter_code;
        return res.json({ problem: data });
      }
    } catch (_) {}

    const problems = loadLocalProblems();
    const problem = problems.find(p => p.id === req.params.id || p.slug === req.params.id);
    if (!problem) return res.status(404).json({ error: 'Problem not found.' });
    res.json({ problem });
  } catch (error) { next(error); }
});

async function saveProblem(req, res, next, id) {
  try {
    const { error: validationError, problem } = validateProblemPayload(req.body, id);
    if (validationError) return res.status(400).json({ error: validationError });

    const probs = loadLocalProblems();
    const existingIndex = probs.findIndex(p => (id && p.id === id) || p.slug === problem.slug);
    if (existingIndex !== -1 && (!id || probs[existingIndex].id !== id)) {
      return res.status(409).json({ error: 'This slug is already in use.' });
    }

    const topicsMap = new Map(DEFAULT_TOPICS.map(t => [t.id, t]));
    const assignedTopics = (problem.topic_ids || []).map(tid => topicsMap.get(tid)).filter(Boolean);

    const targetId = id || ('prob-' + Date.now());
    const fullProblem = {
      id: targetId,
      title: problem.title,
      slug: problem.slug,
      difficulty: problem.difficulty,
      description: problem.description,
      constraints: problem.constraints || '',
      input_format: problem.input_format || '',
      output_format: problem.output_format || '',
      topic_ids: problem.topic_ids || [],
      topics: assignedTopics,
      examples: (problem.examples || []).map((ex, idx) => ({ id: 'ex-' + idx, input: ex.input, output: ex.output, explanation: ex.explanation || '', display_order: idx })),
      test_cases: (problem.test_cases || []).map((tc, idx) => ({ id: tc.id || ('tc-' + idx), input: tc.input, expected_output: tc.expected_output, is_hidden: Boolean(tc.is_hidden), display_order: idx })),
      starter_code: problem.starter_code || [],
      created_at: existingIndex !== -1 ? probs[existingIndex].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (existingIndex !== -1) {
      probs[existingIndex] = fullProblem;
    } else {
      probs.push(fullProblem);
    }
    saveLocalProblems(probs);

    try {
      await supabaseAdmin.rpc('prepflow_admin_save_problem_v1', { payload: problem });
    } catch (_) {}

    res.status(id ? 200 : 201).json({ id: targetId });
  } catch (error) { next(error); }
}

app.post('/api/admin/problems', requireProblemAdmin, (req, res, next) => saveProblem(req, res, next));
app.put('/api/admin/problems/:id', requireProblemAdmin, (req, res, next) => saveProblem(req, res, next, req.params.id));
app.delete('/api/admin/problems/:id', requireProblemAdmin, async (req, res, next) => {
  try {
    let probs = loadLocalProblems();
    const initialLen = probs.length;
    probs = probs.filter(p => p.id !== req.params.id);
    if (probs.length === initialLen) return res.status(404).json({ error: 'Problem not found.' });
    saveLocalProblems(probs);
    try { await supabaseAdmin.from('problems').delete().eq('id', req.params.id); } catch (_) {}
    res.status(204).end();
  } catch (error) { next(error); }
});

// ── Student Coding Platform Routes (Phase 2) ──

// Helper: Get set of problem IDs solved by the user (verdict = 'Accepted')
async function getSolvedProblemIdsForUser(userId) {
  if (!userId || !supabaseAvailable) return new Set();
  try {
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .select('problem_id')
      .eq('user_id', userId)
      .eq('verdict', 'Accepted');
    if (error) return new Set();
    return new Set((data || []).map((row) => row.problem_id));
  } catch {
    return new Set();
  }
}

// Helper: Save submission record to Supabase
async function recordSubmission({ userId, problemId, language, code, verdict, executionTime, memoryUsed }) {
  if (!supabaseAvailable) return { id: null, error: 'Supabase unavailable' };
  try {
    const { data, error } = await supabaseAdmin.from('submissions').insert({
      user_id: userId,
      problem_id: problemId,
      language,
      code,
      verdict,
      execution_time: executionTime || null,
      memory_used: memoryUsed !== null && memoryUsed !== undefined ? Number(memoryUsed) : null,
      created_at: new Date().toISOString()
    }).select('id, created_at').single();
    if (error) {
      console.warn('[submissions] Insert error:', error.message);
      return { id: null, error: error.message };
    }
    return { id: data?.id, error: null };
  } catch (err) {
    console.warn('[submissions] Insert exception:', err.message);
    return { id: null, error: err.message };
  }
}

// Helper: Retrieve user submissions for a problem
async function getUserSubmissions(problemId, userId) {
  if (!supabaseAvailable) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .select('id, verdict, language, execution_time, memory_used, created_at')
      .eq('problem_id', problemId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  } catch (err) {
    console.warn('[submissions] Fetch error:', err.message);
    return [];
  }
}

// Public/student topics endpoint (for topic filters)
app.get('/api/topics', async (_req, res, next) => {
  try {
    if (supabaseAvailable) {
      try {
        const { data, error } = await supabaseAdmin.from('topics').select('id, name').order('name');
        if (!error && data?.length) return res.json({ topics: data });
      } catch (_) {}
    }
    res.json({ topics: DEFAULT_TOPICS });
  } catch (error) { next(error); }
});

// 1. Student Problem List with filters and solved status
app.get('/api/problems', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const difficulty = String(req.query.difficulty || '').trim();
    const topic = String(req.query.topic || '').trim();

    let problems = [];
    if (supabaseAvailable) {
      try {
        let query = supabaseAdmin
          .from('problems')
          .select('id, title, slug, difficulty, created_at, updated_at, problem_topics(topics(id, name))')
          .order('created_at', { ascending: false });

        if (search) query = query.ilike('title', `%${search}%`);
        if (difficulty) {
          if (!DIFFICULTIES.has(difficulty)) return res.status(400).json({ error: 'Invalid difficulty.' });
          query = query.eq('difficulty', difficulty);
        }
        const { data, error } = await query;
        if (!error && data) {
          problems = data.map((problem) => ({
            id: problem.id,
            title: problem.title,
            slug: problem.slug,
            difficulty: problem.difficulty,
            topics: (problem.problem_topics || []).map((link) => link.topics).filter(Boolean)
          }));
        }
      } catch (_) {}
    }

    if (!problems.length) {
      problems = loadLocalProblems().map(p => ({
        id: p.id, title: p.title, slug: p.slug, difficulty: p.difficulty, topics: p.topics || []
      }));
      if (search) problems = problems.filter(p => p.title.toLowerCase().includes(search));
      if (difficulty) problems = problems.filter(p => p.difficulty === difficulty);
    }

    const user = await getAuthUser(req);
    const solvedSet = user ? await getSolvedProblemIdsForUser(user.id) : new Set();

    let results = problems.map((problem) => ({
      ...problem,
      isSolved: solvedSet.has(problem.id)
    }));

    if (topic) {
      results = results.filter((p) =>
        p.topics.some((t) => t.id === topic || t.name.toLowerCase() === topic.toLowerCase())
      );
    }

    res.json({ problems: results });
  } catch (error) { next(error); }
});

// 2. Student Problem Detail (by slug or id) - NEVER returns hidden test cases
app.get('/api/problems/:slug', async (req, res, next) => {
  try {
    const slugOrId = req.params.slug;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

    let problem = null;
    if (supabaseAvailable) {
      try {
        let query = supabaseAdmin
          .from('problems')
          .select('id, title, slug, difficulty, description, constraints, input_format, output_format, problem_examples(id, input, output, explanation, display_order), problem_topics(topics(id, name)), problem_starter_code(language, code)');

        if (isUuid) query = query.eq('id', slugOrId);
        else query = query.eq('slug', slugOrId);

        const { data, error } = await query.single();
        if (!error && data) {
          problem = {
            id: data.id,
            title: data.title,
            slug: data.slug,
            difficulty: data.difficulty,
            description: data.description,
            constraints: data.constraints,
            input_format: data.input_format,
            output_format: data.output_format,
            examples: (data.problem_examples || []).sort((a, b) => a.display_order - b.display_order),
            starter_code: data.problem_starter_code || [],
            topics: (data.problem_topics || []).map((t) => t.topics).filter(Boolean)
          };
        }
      } catch (_) {}
    }

    if (!problem) {
      const localProbs = loadLocalProblems();
      const found = localProbs.find(p => p.id === slugOrId || p.slug === slugOrId);
      if (found) {
        problem = {
          id: found.id,
          title: found.title,
          slug: found.slug,
          difficulty: found.difficulty,
          description: found.description,
          constraints: found.constraints,
          input_format: found.input_format,
          output_format: found.output_format,
          examples: found.examples || [],
          starter_code: found.starter_code || [],
          topics: found.topics || []
        };
      }
    }

    if (!problem) {
      return res.status(404).json({ error: 'Problem not found.' });
    }

    const user = await getAuthUser(req);
    let isSolved = false;
    if (user) {
      const solved = await getSolvedProblemIdsForUser(user.id);
      isSolved = solved.has(problem.id);
    }

    res.json({
      problem: {
        ...problem,
        isSolved
      }
    });
  } catch (error) { next(error); }
});

// 4. Run Code Flow: executes against VISIBLE test cases only (is_hidden = false)
app.post('/api/problems/:id/run', async (req, res, next) => {
  try {
    const problemId = req.params.id;
    const { sourceCode, languageId, language } = req.body || {};

    const langObj = getSupportedLanguageByIdOrKey(languageId || language);
    if (!langObj) {
      return res.status(400).json({ error: 'Valid language is required (cpp, java, python, javascript).' });
    }
    if (!sourceCode || typeof sourceCode !== 'string' || !sourceCode.trim()) {
      return res.status(400).json({ error: 'sourceCode is required.' });
    }

    // Retrieve visible test cases — local_problems.json first, Supabase as optional enhancement
    let testCases = [];
    const localProbs = loadLocalProblems();
    const localProb = localProbs.find(p => p.id === problemId || p.slug === problemId);
    if (localProb && localProb.test_cases && localProb.test_cases.length) {
      testCases = localProb.test_cases
        .filter(tc => !tc.is_hidden)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    }

    // Try Supabase if local has no test cases
    if (!testCases.length) {
      try {
        const { data, error } = await supabaseAdmin
          .from('problem_test_cases')
          .select('id, input, expected_output, display_order')
          .eq('problem_id', problemId)
          .eq('is_hidden', false)
          .order('display_order', { ascending: true });
        if (!error && data && data.length) testCases = data;
      } catch (_) {}
    }

    // Last resort: use examples as visible test cases
    if (!testCases.length && localProb && localProb.examples && localProb.examples.length) {
      testCases = localProb.examples.map((ex, i) => ({
        id: `ex-${i}`, input: ex.input, expected_output: ex.output, display_order: i
      }));
    }

    if (!testCases.length) {
      return res.status(400).json({ error: 'No visible test cases available for this problem.' });
    }

    const results = [];
    let compileOutput = null;
    let generalStderr = null;
    let hasCompilationError = false;

    // Controlled sequential execution
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const execResult = await executeCodeSubmission({
        sourceCode,
        languageId: langObj.id,
        stdin: tc.input || ''
      });

      const isCompileErr = execResult.status === 'Compilation Error' || Boolean(execResult.compileOutput && !execResult.stdout);
      if (isCompileErr) {
        compileOutput = execResult.compileOutput || execResult.stderr || 'Compilation failed.';
        hasCompilationError = true;
        results.push({
          testCase: i + 1,
          passed: false,
          status: 'Compilation Error',
          input: tc.input,
          expectedOutput: tc.expected_output,
          actualOutput: '',
          compileOutput,
          time: execResult.time,
          memory: execResult.memory
        });
        break; // Stop remaining tests on compilation error
      }

      const isTimeLimit = execResult.status === 'Time Limit Exceeded';
      const isMemoryLimit = execResult.status.includes('Memory Limit Exceeded');
      const isRuntimeErr = execResult.status.includes('Runtime Error') || execResult.status.includes('SIG') || execResult.status.includes('NZEC');

      const normalizedActual = normalizeOutput(execResult.stdout || '');
      const normalizedExpected = normalizeOutput(tc.expected_output || '');
      const passed = !isTimeLimit && !isRuntimeErr && !isMemoryLimit && (normalizedActual === normalizedExpected);

      let testStatus = 'Accepted';
      if (isTimeLimit) testStatus = 'Time Limit Exceeded';
      else if (isMemoryLimit) testStatus = 'Memory Limit Exceeded';
      else if (isRuntimeErr) testStatus = 'Runtime Error';
      else if (!passed) testStatus = 'Wrong Answer';

      if (execResult.stderr && !generalStderr) generalStderr = execResult.stderr;

      results.push({
        testCase: i + 1,
        passed,
        status: testStatus,
        input: tc.input,
        expectedOutput: tc.expected_output,
        actualOutput: execResult.stdout || '',
        stderr: execResult.stderr || null,
        time: execResult.time,
        memory: execResult.memory
      });
    }

    const passedCount = results.filter((r) => r.passed).length;
    res.json({
      allPassed: passedCount === testCases.length,
      total: testCases.length,
      passed: passedCount,
      hasCompilationError,
      compileOutput,
      stderr: generalStderr,
      results
    });
  } catch (error) { next(error); }
});

// 5. Submit Flow: executes against HIDDEN test cases (is_hidden = true)
app.post('/api/problems/:id/submit', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please sign in to submit your solution.' });
    }

    const problemId = req.params.id;
    const { sourceCode, languageId, language } = req.body || {};

    const langObj = getSupportedLanguageByIdOrKey(languageId || language);
    if (!langObj) {
      return res.status(400).json({ error: 'Valid language is required (cpp, java, python, javascript).' });
    }
    if (!sourceCode || typeof sourceCode !== 'string' || !sourceCode.trim()) {
      return res.status(400).json({ error: 'sourceCode is required.' });
    }

    // Retrieve test cases — local_problems.json first (hidden for submit), Supabase as optional
    let testCases = [];
    const localProbsSub = loadLocalProblems();
    const localProbSub = localProbsSub.find(p => p.id === problemId || p.slug === problemId);
    if (localProbSub && localProbSub.test_cases && localProbSub.test_cases.length) {
      // Prefer hidden test cases for submit; fall back to all if none are hidden
      const hidden = localProbSub.test_cases.filter(tc => tc.is_hidden);
      testCases = (hidden.length ? hidden : localProbSub.test_cases)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    }

    // Try Supabase if local has no test cases
    if (!testCases.length) {
      try {
        // Try hidden first
        const { data: hiddenData, error: hiddenErr } = await supabaseAdmin
          .from('problem_test_cases')
          .select('id, input, expected_output, display_order')
          .eq('problem_id', problemId)
          .eq('is_hidden', true)
          .order('display_order', { ascending: true });
        if (!hiddenErr && hiddenData && hiddenData.length) {
          testCases = hiddenData;
        } else {
          // Fall back to all test cases
          const { data: allData, error: allErr } = await supabaseAdmin
            .from('problem_test_cases')
            .select('id, input, expected_output, display_order')
            .eq('problem_id', problemId)
            .order('display_order', { ascending: true });
          if (!allErr && allData) testCases = allData;
        }
      } catch (_) {}
    }

    if (!testCases.length) {
      return res.status(400).json({ error: 'No test cases are configured for this problem.' });
    }

    let verdict = 'Accepted';
    let passedCount = 0;
    let failedIndex = null;
    let maxTimeSeconds = 0;
    let maxMemoryKb = 0;
    let compileOutput = null;
    let stderrOutput = null;

    // Controlled sequential execution with early exit on failure
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const execResult = await executeCodeSubmission({
        sourceCode,
        languageId: langObj.id,
        stdin: tc.input || ''
      });

      if (execResult.time) {
        const t = parseFloat(execResult.time);
        if (!isNaN(t) && t > maxTimeSeconds) maxTimeSeconds = t;
      }
      if (execResult.memory) {
        const m = Number(execResult.memory);
        if (!isNaN(m) && m > maxMemoryKb) maxMemoryKb = m;
      }

      const isCompileErr = execResult.status === 'Compilation Error' || Boolean(execResult.compileOutput && !execResult.stdout);
      if (isCompileErr) {
        verdict = 'Compilation Error';
        failedIndex = i + 1;
        compileOutput = execResult.compileOutput || execResult.stderr || 'Compilation failed.';
        break;
      }

      if (execResult.status === 'Time Limit Exceeded') {
        verdict = 'Time Limit Exceeded';
        failedIndex = i + 1;
        break;
      }

      if (execResult.status.includes('Memory Limit Exceeded')) {
        verdict = 'Memory Limit Exceeded';
        failedIndex = i + 1;
        break;
      }

      if (execResult.status.includes('Runtime Error') || execResult.status.includes('SIG') || execResult.status.includes('NZEC')) {
        verdict = 'Runtime Error';
        failedIndex = i + 1;
        stderrOutput = execResult.stderr || null;
        break;
      }

      const normalizedActual = normalizeOutput(execResult.stdout || '');
      const normalizedExpected = normalizeOutput(tc.expected_output || '');

      if (normalizedActual !== normalizedExpected) {
        verdict = 'Wrong Answer';
        failedIndex = i + 1;
        break;
      }

      passedCount++;
    }

    const executionTimeStr = maxTimeSeconds > 0 ? `${Math.round(maxTimeSeconds * 1000)} ms` : null;
    const memoryUsedNumber = maxMemoryKb > 0 ? maxMemoryKb : null;

    // Save submission to database (user_id derived securely from session)
    const { id: submissionId } = await recordSubmission({
      userId: user.id,
      problemId,
      language: langObj.key,
      code: sourceCode,
      verdict,
      executionTime: executionTimeStr,
      memoryUsed: memoryUsedNumber
    });

    // Return result without exposing any hidden test cases
    res.status(201).json({
      submissionId,
      verdict,
      totalTestCases: testCases.length,
      testCasesPassed: passedCount,
      failedTestCase: verdict === 'Accepted' ? null : failedIndex,
      executionTime: executionTimeStr,
      memoryUsed: memoryUsedNumber ? `${Math.round(memoryUsedNumber / 1024)} MB` : null,
      compileOutput,
      stderr: stderrOutput
    });
  } catch (error) { next(error); }
});

// 8. Submission History for a Problem
app.get('/api/problems/:id/submissions', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to view your submissions.' });

    const submissions = await getUserSubmissions(req.params.id, user.id);
    res.json({ submissions });
  } catch (error) { next(error); }
});

// Single Submission Details
app.get('/api/submissions/:id', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to view submission details.' });

    const { data: submission, error } = await supabaseAdmin
      .from('submissions')
      .select('id, user_id, problem_id, language, code, verdict, execution_time, memory_used, created_at')
      .eq('id', req.params.id)
      .single();

    if (error?.code === 'PGRST116' || !submission) {
      return res.status(404).json({ error: 'Submission not found.' });
    }
    if (error) throw error;

    // Security check: only author can view their submission
    if (submission.user_id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized to view this submission.' });
    }

    res.json({ submission });
  } catch (error) { next(error); }
});

// Student problem page route
app.get('/problems/:slug', (_req, res) => {
  res.sendFile(path.join(dirname, 'public', 'problem.html'));
});

app.get('/admin/problems.html', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.redirect('/');
    let isAdmin = Boolean(user.isAdmin);
    if (!isAdmin && user.id) {
      try {
        const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single();
        isAdmin = Boolean(profile?.is_admin);
      } catch (_) {}
    }
    if (!isAdmin) return res.status(403).send('Problem Management is available only to administrators.');
    res.sendFile(path.join(dirname, 'public', 'admin', 'problems.html'));
  } catch (error) { next(error); }
});

app.get('/admin/subjects.html', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.redirect('/');
    let isAdmin = Boolean(user.isAdmin);
    if (!isAdmin && user.id) {
      try {
        const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single();
        isAdmin = Boolean(profile?.is_admin);
      } catch (_) {}
    }
    if (!isAdmin) return res.status(403).send('Core CS Material Management is available only to administrators.');
    res.sendFile(path.join(dirname, 'public', 'admin', 'subjects.html'));
  } catch (error) { next(error); }
});

// ── Subject Route (MongoDB primary with local_subjects.json fallback) ──
app.get('/api/roadmaps', async (req, res, next) => {
  try {
    let subjects = [];
    try {
      if (mongoose.connection.readyState === 1) {
        subjects = await Subject.find().sort({ order: 1 });
      }
    } catch (dbErr) {
      console.warn('[subjects] MongoDB query failed, using local storage fallback:', dbErr.message);
    }

    if (!subjects || !subjects.length) {
      subjects = loadLocalSubjects();
    }

    const roadmaps = {};
    for (const s of subjects) {
      roadmaps[s.key] = {
        name: s.name,
        subtitle: s.subtitle,
        icon: s.icon,
        headings: s.headings
      };
    }
    res.json(roadmaps);
  } catch (error) { next(error); }
});

// ── Supabase PostgreSQL Progress Routes ──
app.get('/api/progress', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });

    const { data } = await supabaseAdmin.from('progress').select('completed').eq('user_id', user.id).single();
    res.json({ completed: data?.completed ?? [] });
  } catch (error) { next(error); }
});

// Real User Analytics Endpoint (Submissions + Progress Timeline)
app.get('/api/analytics', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to view analytics.' });

    // 1. Fetch user's submissions
    let submissions = [];
    if (supabaseAvailable) {
      const { data, error } = await supabaseAdmin
        .from('submissions')
        .select('id, problem_id, verdict, language, execution_time, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!error && data) submissions = data;
    }

    // 2. Fetch user's completed study units
    let completedLessons = [];
    if (supabaseAvailable) {
      const { data } = await supabaseAdmin
        .from('progress')
        .select('completed, updated_at')
        .eq('user_id', user.id)
        .single();
      if (data?.completed) completedLessons = data.completed;
    }

    res.json({
      submissions,
      completedLessons
    });
  } catch (error) { next(error); }
});

app.post('/api/progress/toggle', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });

    const key = String(req.body.key || '').trim();
    if (!key) return res.status(400).json({ error: 'key is required.' });

    const { data: prog } = await supabaseAdmin.from('progress').select('completed').eq('user_id', user.id).single();
    let completedList = prog?.completed ?? [];

    if (completedList.includes(key)) {
      completedList = completedList.filter(k => k !== key);
    } else {
      completedList = [...completedList, key];
    }

    const { data: updatedProg, error } = await supabaseAdmin
      .from('progress')
      .upsert({ user_id: user.id, completed: completedList, updated_at: new Date() })
      .select('completed')
      .single();

    if (error) return res.status(500).json({ error: 'Failed to update progress.' });

    res.json({ completed: updatedProg.completed });
  } catch (error) { next(error); }
});

// ── Admin Routes for Core CS Subjects (Supports both Web Admin Auth and API Key) ──
async function requireSubjectAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey;
  if (key && key === ADMIN_API_KEY) {
    return next();
  }
  return requireProblemAdmin(req, res, next);
}

// 0. Get single subject by key
app.get('/api/admin/subjects/:key', requireSubjectAdmin, async (req, res, next) => {
  try {
    const key = req.params.key.trim().toLowerCase();
    if (mongoose.connection.readyState === 1) {
      try {
        const subject = await Subject.findOne({ key });
        if (subject) return res.json({ subject });
      } catch (_) {}
    }
    const localSubs = loadLocalSubjects();
    const found = localSubs.find(s => s.key === key);
    if (!found) return res.status(404).json({ error: `Subject '${key}' not found.` });
    res.json({ subject: found });
  } catch (error) { next(error); }
});

// 1. Upsert a whole Subject (create new or replace existing)
app.post('/api/admin/subjects', requireSubjectAdmin, async (req, res, next) => {
  try {
    const { key, name, subtitle, icon, order, headings } = req.body;
    if (!key || !name) return res.status(400).json({ error: 'key and name are required.' });

    const keyClean = String(key).trim().toLowerCase();
    const subjectData = {
      key: keyClean,
      name: String(name).trim(),
      subtitle: subtitle ?? '',
      icon: icon ?? '◫',
      order: typeof order === 'number' ? order : 0,
      headings: Array.isArray(headings) ? headings : []
    };

    // Save to local JSON first
    const localSubs = loadLocalSubjects();
    const idx = localSubs.findIndex(s => s.key === keyClean);
    if (idx !== -1) {
      localSubs[idx] = subjectData;
    } else {
      localSubs.push(subjectData);
    }
    saveLocalSubjects(localSubs);

    // Save to Mongo if available
    let updated = subjectData;
    if (mongoose.connection.readyState === 1) {
      try {
        updated = await Subject.findOneAndUpdate(
          { key: keyClean },
          subjectData,
          { upsert: true, returnDocument: 'after' }
        );
      } catch (dbErr) {
        console.warn('[subjects] MongoDB upsert warning:', dbErr.message);
      }
    }

    res.status(200).json({ message: 'Subject saved successfully', subject: updated });
  } catch (error) { next(error); }
});

// 2. Append a new Heading (with subheadings) to an existing Subject
app.post('/api/admin/subjects/:key/headings', requireSubjectAdmin, async (req, res, next) => {
  try {
    const key = req.params.key.trim().toLowerCase();
    const { title, text = '', subheadings = [] } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required.' });

    const localSubs = loadLocalSubjects();
    const subject = localSubs.find(s => s.key === key);
    if (!subject) return res.status(404).json({ error: `Subject '${key}' not found.` });

    if (!Array.isArray(subject.headings)) subject.headings = [];
    subject.headings.push({ title, text, subheadings });
    saveLocalSubjects(localSubs);

    if (mongoose.connection.readyState === 1) {
      try {
        const mongoSub = await Subject.findOne({ key });
        if (mongoSub) {
          mongoSub.headings.push({ title, text, subheadings });
          await mongoSub.save();
        }
      } catch (_) {}
    }

    res.status(200).json({
      message: `Heading added to '${key}' successfully`,
      headingIndex: subject.headings.length - 1,
      subject
    });
  } catch (error) { next(error); }
});

// 3. Append a Subheading/Topic to a specific Heading
app.post('/api/admin/subjects/:key/headings/:headingIndex/subheadings', requireSubjectAdmin, async (req, res, next) => {
  try {
    const key = req.params.key.trim().toLowerCase();
    const headingIndex = parseInt(req.params.headingIndex, 10);
    const { title, text = '' } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required.' });

    const localSubs = loadLocalSubjects();
    const subject = localSubs.find(s => s.key === key);
    if (!subject) return res.status(404).json({ error: `Subject '${key}' not found.` });
    if (!subject.headings || !subject.headings[headingIndex]) return res.status(404).json({ error: `Heading index ${headingIndex} not found.` });

    if (!Array.isArray(subject.headings[headingIndex].subheadings)) {
      subject.headings[headingIndex].subheadings = [];
    }
    subject.headings[headingIndex].subheadings.push({ title, text });
    saveLocalSubjects(localSubs);

    if (mongoose.connection.readyState === 1) {
      try {
        const mongoSub = await Subject.findOne({ key });
        if (mongoSub && mongoSub.headings[headingIndex]) {
          mongoSub.headings[headingIndex].subheadings.push({ title, text });
          await mongoSub.save();
        }
      } catch (_) {}
    }

    res.status(200).json({
      message: `Subheading added to '${key}' heading ${headingIndex} successfully`,
      subheadingIndex: subject.headings[headingIndex].subheadings.length - 1,
      subject
    });
  } catch (error) { next(error); }
});

// 4. Delete a Subject
app.delete('/api/admin/subjects/:key', requireSubjectAdmin, async (req, res, next) => {
  try {
    const key = req.params.key.trim().toLowerCase();
    let localSubs = loadLocalSubjects();
    const initialLen = localSubs.length;
    localSubs = localSubs.filter(s => s.key !== key);
    if (localSubs.length === initialLen) return res.status(404).json({ error: `Subject '${key}' not found.` });
    saveLocalSubjects(localSubs);

    if (mongoose.connection.readyState === 1) {
      try {
        await Subject.findOneAndDelete({ key });
      } catch (_) {}
    }
    res.json({ message: `Subject '${key}' deleted successfully.` });
  } catch (error) { next(error); }
});

// ── Code Execution Routes (Judge0 CE Integration) ──
app.get('/api/code/languages', (_req, res) => {
  res.json({
    languages: Object.values(SUPPORTED_LANGUAGES).map(({ id, key, name, monaco, defaultCode }) => ({
      id,
      key,
      name,
      monaco,
      defaultCode
    }))
  });
});

app.post('/api/code/run', async (req, res, next) => {
  try {
    const { sourceCode, languageId, stdin } = req.body || {};
    const result = await executeCodeSubmission({ sourceCode, languageId, stdin });
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
});

app.use(express.static(path.join(dirname, 'public')));
app.use((error, _req, res, _next) => { console.error('[ERROR]', error); res.status(500).json({ error: NODE_ENV === 'development' ? (error.message || 'Something went wrong.') : 'Something went wrong. Please try again.' }); });

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB.'))
  .catch((error) => console.warn('[WARNING] MongoDB connection failed (Core CS Subjects may be unavailable):', error.message));

// Probe Supabase availability once at startup (max 3s wait)
probeSupabase();

app.listen(PORT, () => console.log(`PrepFlow is running at http://localhost:${PORT}`));

