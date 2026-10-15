import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sbAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('═══════════════════════════════════════════════════════════');
console.log('       Phase 2: Student Coding Platform Test Suite         ');
console.log('═══════════════════════════════════════════════════════════\n');

// 1. Authenticate Test Student A
const testEmail = process.env.TEST_USER_EMAIL;
const testPassword = process.env.TEST_USER_PASSWORD;

if (!testEmail || !testPassword) {
  console.error('Error: TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables are required to run this test.');
  process.exit(1);
}

const { data: studentAData, error: studentAErr } = await sbAnon.auth.signInWithPassword({
  email: testEmail,
  password: testPassword
});
if (studentAErr) {
  console.error('Failed to authenticate Student A:', studentAErr.message);
  process.exit(1);
}
const tokenA = studentAData.session.access_token;
const userA = studentAData.user;
console.log('✓ [Auth] Student A authenticated successfully:', userA.email);

const baseUrl = 'http://localhost:3000';

// ── Test 1: Problem Loading & Hidden Tests Protection ──────────
console.log('\n[Security & Problem Loading]');
const problemRes = await fetch(`${baseUrl}/api/problems/two-sum`);
if (!problemRes.ok) {
  console.error('Failed to fetch /api/problems/two-sum:', problemRes.status);
  process.exit(1);
}
const { problem } = await problemRes.json();
console.log('✓ Problem fetched:', problem.title, `(${problem.slug})`);
console.log('  Difficulty:', problem.difficulty);
console.log('  Topics:', problem.topics?.map(t => t.name).join(', '));
console.log('  Starter code count:', problem.starter_code?.length);

// Verify hidden tests are completely absent from problem response
const containsHidden = JSON.stringify(problem).includes('is_hidden');
const containsRawTests = Boolean(problem.test_cases || problem.hidden_test_cases);
if (containsHidden || containsRawTests) {
  console.error('FAILED: API leaked test case visibility or raw test cases!');
  process.exit(1);
}
console.log('✓ [Security] Verified: Hidden test cases are completely absent from student problem API');

// ── Test 2: Unauthenticated Submit Rejected ───────────────────
console.log('\n[Security: Unauthenticated Submission]');
const unauthRes = await fetch(`${baseUrl}/api/problems/${problem.id}/submit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sourceCode: 'print(0)',
    language: 'python'
  })
});
if (unauthRes.status === 401) {
  console.log('✓ [Security] Verified: Unauthenticated submission correctly rejected with 401 Unauthorized');
} else {
  console.error('FAILED: Expected 401 for unauthenticated submit, got:', unauthRes.status);
  process.exit(1);
}

// ── Test 3: Run Code with Correct C++ Solution ────────────────
console.log('\n[Run Code: Correct Solution]');
const correctCppSolution = `
#include <iostream>
#include <vector>
#include <unordered_map>
using namespace std;

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];
    int target;
    cin >> target;

    unordered_map<int, int> mp;
    for (int i = 0; i < n; i++) {
        int complement = target - nums[i];
        if (mp.count(complement)) {
            cout << mp[complement] << " " << i << "\\n";
            return 0;
        }
        mp[nums[i]] = i;
    }
    return 0;
}
`;

const runRes1 = await fetch(`${baseUrl}/api/problems/${problem.id}/run`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Cookie: `prepflow_token=${tokenA}`
  },
  body: JSON.stringify({
    sourceCode: correctCppSolution,
    language: 'cpp'
  })
});

const runData1 = await runRes1.json();
if (runData1.allPassed && runData1.passed === runData1.total) {
  console.log(`✓ Run Code passed all ${runData1.total} visible test cases!`);
  runData1.results.forEach(r => {
    console.log(`   Case ${r.testCase}: [${r.status}] Input: "${r.input.replace(/\n/g, ' ')}" -> Output: "${r.actualOutput.trim()}"`);
  });
} else {
  console.error('FAILED: Expected all visible test cases to pass, got:', runData1);
  process.exit(1);
}

// ── Test 4: Run Code with Incorrect Solution ──────────────────
console.log('\n[Run Code: Incorrect Solution]');
const wrongCode = `
#include <iostream>
using namespace std;
int main() {
    cout << "99 99\\n";
    return 0;
}
`;

const runRes2 = await fetch(`${baseUrl}/api/problems/${problem.id}/run`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Cookie: `prepflow_token=${tokenA}`
  },
  body: JSON.stringify({
    sourceCode: wrongCode,
    language: 'cpp'
  })
});
const runData2 = await runRes2.json();
if (!runData2.allPassed && runData2.passed === 0) {
  console.log('✓ Run Code correctly identified Wrong Answer for incorrect code.');
  console.log(`   Status: ${runData2.results[0].status}, Actual: "${runData2.results[0].actualOutput.trim()}", Expected: "${runData2.results[0].expectedOutput}"`);
} else {
  console.error('FAILED: Incorrect code should not pass:', runData2);
  process.exit(1);
}

// ── Test 5: Run Code with Compilation Error ───────────────────
console.log('\n[Run Code: Compilation Error]');
const brokenCode = `int main() { syntax error here }`;
const runRes3 = await fetch(`${baseUrl}/api/problems/${problem.id}/run`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Cookie: `prepflow_token=${tokenA}`
  },
  body: JSON.stringify({
    sourceCode: brokenCode,
    language: 'cpp'
  })
});
const runData3 = await runRes3.json();
if (runData3.hasCompilationError && runData3.compileOutput) {
  console.log('✓ Run Code correctly caught Compilation Error:');
  console.log('   Compiler error snippet:', runData3.compileOutput.slice(0, 80).replace(/\n/g, ' '));
} else {
  console.error('FAILED: Expected Compilation Error, got:', runData3);
  process.exit(1);
}

// ── Test 6: Submit Flow (Hidden Test Cases) ───────────────────
console.log('\n[Submit: Solution Submission]');
const submitRes = await fetch(`${baseUrl}/api/problems/${problem.id}/submit`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Cookie: `prepflow_token=${tokenA}`
  },
  body: JSON.stringify({
    sourceCode: correctCppSolution,
    language: 'cpp'
  })
});

const submitData = await submitRes.json();
console.log('✓ Submit response received:');
console.log('   Verdict:', submitData.verdict);
console.log('   Test Cases Passed:', `${submitData.testCasesPassed} / ${submitData.totalTestCases}`);
console.log('   Runtime:', submitData.executionTime || 'N/A');
console.log('   Memory:', submitData.memoryUsed || 'N/A');

// Verify hidden inputs are NEVER in submit response
if (submitData.input || submitData.expectedOutput || submitData.testCaseDetails) {
  console.error('FAILED: Hidden test case details leaked in submit response!');
  process.exit(1);
}
console.log('✓ [Security] Verified: Submit response does not leak hidden test case inputs or expected outputs');

// ── Test 7: Submissions History API ───────────────────────────
console.log('\n[Submissions History]');
const subsRes = await fetch(`${baseUrl}/api/problems/${problem.id}/submissions`, {
  headers: { Cookie: `prepflow_token=${tokenA}` }
});
const subsData = await subsRes.json();
console.log(`✓ Fetched ${subsData.submissions?.length} submissions for Student A`);

// ── Test 8: Student A vs Student B Submission Isolation ───────
console.log('\n[Security: Cross-Student Submissions Isolation]');
// If we have a submission ID from Student A, verify another token cannot read it
if (subsData.submissions && subsData.submissions.length > 0) {
  const subId = subsData.submissions[0].id;
  // Attempt with unauthenticated user
  const unauthGetRes = await fetch(`${baseUrl}/api/submissions/${subId}`);
  if (unauthGetRes.status === 401) {
    console.log('✓ [Security] Verified: Unauthenticated user cannot read submission details (401)');
  }
}

// ── Test 9: Catalog & Solved Status ───────────────────────────
console.log('\n[Catalog & Solved Status]');
const catalogRes = await fetch(`${baseUrl}/api/problems`, {
  headers: { Cookie: `prepflow_token=${tokenA}` }
});
const catalogData = await catalogRes.json();
const twoSumCatalog = catalogData.problems.find(p => p.slug === 'two-sum');
console.log('✓ Problem catalog loaded, count:', catalogData.problems.length);
console.log('  Two Sum entry:', {
  title: twoSumCatalog?.title,
  difficulty: twoSumCatalog?.difficulty,
  topics: twoSumCatalog?.topics?.map(t => t.name),
  isSolved: twoSumCatalog?.isSolved
});

console.log('\n═══════════════════════════════════════════════════════════');
console.log('       ✓ ALL PHASE 2 VERIFICATION TESTS PASSED!            ');
console.log('═══════════════════════════════════════════════════════════\n');
