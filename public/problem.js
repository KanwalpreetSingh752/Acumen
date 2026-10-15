/**
 * PrepFlow — Student Problem Solving Interface
 */

// ── State ─────────────────────────────────────────────────────
let currentProblem = null;
let monacoEditor = null;
let activeLanguage = 'cpp';
let starterCodeMap = {};
let userCodeCache = {};
let runResults = null;
let activeTestCaseIndex = 0;
let userSubmissions = [];

const DEFAULT_TEMPLATES = {
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your code here\n    return 0;\n}`,
  java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your code here\n    }\n}`,
  python: `import sys\n\ndef solve():\n    # Write your code here\n    pass\n\nif __name__ == '__main__':\n    solve()`,
  javascript: `const fs = require('fs');\n\nfunction solve() {\n    // Write your code here\n}\n\nsolve();`
};

// ── DOM References ────────────────────────────────────────────
const topProblemTitle = document.getElementById('topProblemTitle');
const topDifficultyTag = document.getElementById('topDifficultyTag');
const topSolvedTag = document.getElementById('topSolvedTag');
const userPill = document.getElementById('userPill');
const signOutBtn = document.getElementById('signOutBtn');

// Left pane
const tabBtnDesc = document.getElementById('tabBtnDesc');
const tabBtnSubs = document.getElementById('tabBtnSubs');
const subsCount = document.getElementById('subsCount');
const descView = document.getElementById('descView');
const subsView = document.getElementById('subsView');
const problemTitle = document.getElementById('problemTitle');
const problemMetaBar = document.getElementById('problemMetaBar');
const problemDesc = document.getElementById('problemDesc');
const problemExamplesSection = document.getElementById('problemExamplesSection');
const problemExamplesList = document.getElementById('problemExamplesList');
const problemConstraintsSection = document.getElementById('problemConstraintsSection');
const problemConstraints = document.getElementById('problemConstraints');
const problemInputFormatSection = document.getElementById('problemInputFormatSection');
const problemInputFormat = document.getElementById('problemInputFormat');
const problemOutputFormatSection = document.getElementById('problemOutputFormatSection');
const problemOutputFormat = document.getElementById('problemOutputFormat');
const submissionsTableBody = document.getElementById('submissionsTableBody');

// Right pane
const langSelect = document.getElementById('langSelect');
const resetBtn = document.getElementById('resetBtn');
const runBtn = document.getElementById('runBtn');
const submitBtn = document.getElementById('submitBtn');
const trayTabTest = document.getElementById('trayTabTest');
const trayTabSubmit = document.getElementById('trayTabSubmit');
const trayStatusBadge = document.getElementById('trayStatusBadge');
const trayTestResultsView = document.getElementById('trayTestResultsView');
const traySubmitResultView = document.getElementById('traySubmitResultView');
const caseSelectorBar = document.getElementById('caseSelectorBar');
const caseDetailBox = document.getElementById('caseDetailBox');

// Modal
const submissionModal = document.getElementById('submissionModal');
const modalTitle = document.getElementById('modalTitle');
const modalVerdict = document.getElementById('modalVerdict');
const modalMeta = document.getElementById('modalMeta');
const modalCodeView = document.getElementById('modalCodeView');
const modalCloseBtn = document.getElementById('modalCloseBtn');

// ── Markdown Parser (Safe, XSS-protected) ─────────────────────
function renderMarkdown(md) {
  if (!md) return '';
  // 1. Escape HTML
  let out = String(md)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Fenced code blocks ```lang ... ```
  out = out.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // 3. Inline code `...`
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 4. Bold **...** and *...*
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');

  // 5. Headings and lists line by line
  const lines = out.split('\n');
  let inUl = false;
  let inOl = false;
  const processed = [];

  for (const line of lines) {
    if (/^<pre>/.test(line) || /<\/pre>$/.test(line)) {
      processed.push(line);
      continue;
    }
    // Unordered lists
    if (/^[\*\-]\s+(.*)/.test(line)) {
      if (!inUl) { processed.push('<ul>'); inUl = true; }
      processed.push(`<li>${line.replace(/^[\*\-]\s+/, '')}</li>`);
      continue;
    }
    if (inUl) { processed.push('</ul>'); inUl = false; }

    // Ordered lists
    if (/^\d+\.\s+(.*)/.test(line)) {
      if (!inOl) { processed.push('<ol>'); inOl = true; }
      processed.push(`<li>${line.replace(/^\d+\.\s+/, '')}</li>`);
      continue;
    }
    if (inOl) { processed.push('</ol>'); inOl = false; }

    // Headings
    if (/^###\s+(.*)/.test(line)) {
      processed.push(`<h4>${line.replace(/^###\s+/, '')}</h4>`);
    } else if (/^##\s+(.*)/.test(line)) {
      processed.push(`<h3>${line.replace(/^##\s+/, '')}</h3>`);
    } else if (/^#\s+(.*)/.test(line)) {
      processed.push(`<h2>${line.replace(/^#\s+/, '')}</h2>`);
    } else if (line.trim().length > 0) {
      processed.push(`<p>${line}</p>`);
    }
  }

  if (inUl) processed.push('</ul>');
  if (inOl) processed.push('</ol>');

  return processed.join('\n');
}

// ── Time formatting helper ────────────────────────────────────
function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const past = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - past) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

// ── Get problem slug from URL ──────────────────────────────────
function getProblemSlug() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('slug') || params.get('id');
  if (fromQuery) return fromQuery;

  // Check pathname: /problems/:slug
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[0] === 'problems') {
    return parts[1];
  }
  return 'two-sum'; // default fallback
}

// ── Auth & User Init ──────────────────────────────────────────
async function initAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (userPill) userPill.textContent = data.user.name || data.user.email;
    }
  } catch {
    /* Guest or unauthenticated */
  }
}

if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/');
  });
}

// ── Load Problem Details ──────────────────────────────────────
async function loadProblem() {
  const slug = getProblemSlug();
  try {
    const res = await fetch(`/api/problems/${slug}`);
    if (!res.ok) {
      problemTitle.textContent = 'Problem not found';
      problemDesc.innerHTML = `<p style="color:#ef4444">We could not find the problem '${slug}'. Please check the URL or return to the problem list.</p>`;
      return;
    }
    const data = await res.json();
    currentProblem = data.problem;

    renderProblemUI(currentProblem);
    initStarterCode(currentProblem.starter_code);
    initMonaco();
    loadSubmissions(currentProblem.id);
  } catch (err) {
    problemTitle.textContent = 'Error loading problem';
    problemDesc.innerHTML = `<p style="color:#ef4444">${err.message}</p>`;
  }
}

function renderProblemUI(prob) {
  document.title = `${prob.title} — PrepFlow`;
  topProblemTitle.textContent = prob.title;
  problemTitle.textContent = prob.title;

  // Difficulty badge
  const diffClass = (prob.difficulty || 'easy').toLowerCase();
  topDifficultyTag.className = `diff-tag ${diffClass}`;
  topDifficultyTag.textContent = prob.difficulty || 'Easy';

  // Solved indicator
  if (prob.isSolved) {
    topSolvedTag.hidden = false;
  }

  // Meta bar (Difficulty + Topics)
  let metaHtml = `<span class="diff-tag ${diffClass}">${prob.difficulty || 'Easy'}</span>`;
  if (prob.topics && prob.topics.length) {
    metaHtml += prob.topics.map(t => `<span class="topic-tag">${t.name}</span>`).join(' ');
  }
  problemMetaBar.innerHTML = metaHtml;

  // Description
  problemDesc.innerHTML = renderMarkdown(prob.description);

  // Examples
  if (prob.examples && prob.examples.length) {
    problemExamplesSection.hidden = false;
    problemExamplesList.innerHTML = prob.examples.map((ex, idx) => `
      <div class="example-card">
        <div class="example-card-title">Example ${idx + 1}</div>
        <div class="example-block">
          <span class="example-label">Input:</span>
          <span class="example-val">${escapeHtml(ex.input)}</span>
        </div>
        <div class="example-block">
          <span class="example-label">Output:</span>
          <span class="example-val">${escapeHtml(ex.output)}</span>
        </div>
        ${ex.explanation ? `
          <div class="example-block">
            <span class="example-label">Explanation:</span>
            <div style="font-size:13px;color:#475569;margin-top:2px;">${renderMarkdown(ex.explanation)}</div>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  // Constraints
  if (prob.constraints && prob.constraints.trim()) {
    problemConstraintsSection.hidden = false;
    problemConstraints.innerHTML = renderMarkdown(prob.constraints);
  }

  // Input Format
  if (prob.input_format && prob.input_format.trim()) {
    problemInputFormatSection.hidden = false;
    problemInputFormat.innerHTML = renderMarkdown(prob.input_format);
  }

  // Output Format
  if (prob.output_format && prob.output_format.trim()) {
    problemOutputFormatSection.hidden = false;
    problemOutputFormat.innerHTML = renderMarkdown(prob.output_format);
  }
}

function initStarterCode(starterArray) {
  starterCodeMap = {};
  (starterArray || []).forEach(item => {
    if (item.code && item.code.trim()) {
      starterCodeMap[item.language] = item.code;
    }
  });

  // Default to cpp or first language with starter code
  if (!starterCodeMap.cpp) {
    const available = Object.keys(starterCodeMap)[0];
    if (available) activeLanguage = available;
  }
  if (langSelect) langSelect.value = activeLanguage;
}

// ── Monaco Editor Setup ───────────────────────────────────────
function initMonaco() {
  const container = document.getElementById('monacoContainer');
  if (!container || !window.require) return;

  window.require.config({
    paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
  });

  window.require(['vs/editor/editor.main'], () => {
    const initialCode = starterCodeMap[activeLanguage] || DEFAULT_TEMPLATES[activeLanguage] || '';
    userCodeCache[activeLanguage] = initialCode;

    monacoEditor = monaco.editor.create(container, {
      value: initialCode,
      language: getMonacoLang(activeLanguage),
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "'Fira Code', 'DM Mono', monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 }
    });
  });
}

function getMonacoLang(lang) {
  if (lang === 'cpp') return 'cpp';
  if (lang === 'java') return 'java';
  if (lang === 'python') return 'python';
  if (lang === 'javascript') return 'javascript';
  return 'plaintext';
}

function handleLanguageChange(newLang) {
  if (!monacoEditor) return;
  // 1. Cache current edited code so user doesn't lose work
  userCodeCache[activeLanguage] = monacoEditor.getValue();

  activeLanguage = newLang;

  // 2. Retrieve cached or starter code
  const codeToLoad = userCodeCache[newLang] !== undefined
    ? userCodeCache[newLang]
    : (starterCodeMap[newLang] || DEFAULT_TEMPLATES[newLang] || '');

  // 3. Update editor model language & value
  const model = monacoEditor.getModel();
  if (model) {
    monaco.editor.setModelLanguage(model, getMonacoLang(newLang));
    monacoEditor.setValue(codeToLoad);
  }
}

if (langSelect) {
  langSelect.addEventListener('change', (e) => handleLanguageChange(e.target.value));
}

if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (!monacoEditor) return;
    const original = starterCodeMap[activeLanguage] || DEFAULT_TEMPLATES[activeLanguage] || '';
    if (confirm('Reset editor to original starter code for this language?')) {
      userCodeCache[activeLanguage] = original;
      monacoEditor.setValue(original);
    }
  });
}

// ── Left Pane Tab Switching (Description vs Submissions) ──────
if (tabBtnDesc && tabBtnSubs) {
  tabBtnDesc.addEventListener('click', () => {
    tabBtnDesc.classList.add('active');
    tabBtnSubs.classList.remove('active');
    descView.hidden = false;
    subsView.hidden = true;
  });

  tabBtnSubs.addEventListener('click', () => {
    tabBtnSubs.classList.add('active');
    tabBtnDesc.classList.remove('active');
    descView.hidden = true;
    subsView.hidden = false;
    if (currentProblem) loadSubmissions(currentProblem.id);
  });
}

// ── Tray Tab Switching (Test Results vs Submission Result) ────
if (trayTabTest && trayTabSubmit) {
  trayTabTest.addEventListener('click', () => {
    trayTabTest.classList.add('active');
    trayTabSubmit.classList.remove('active');
    trayTestResultsView.hidden = false;
    traySubmitResultView.hidden = true;
  });

  trayTabSubmit.addEventListener('click', () => {
    trayTabSubmit.classList.add('active');
    trayTabTest.classList.remove('active');
    trayTestResultsView.hidden = true;
    traySubmitResultView.hidden = false;
  });
}

// ── Run Code Flow (Visible Test Cases) ─────────────────────────
async function handleRunCode() {
  if (!currentProblem || !monacoEditor || runBtn.disabled) return;

  const sourceCode = monacoEditor.getValue();
  if (!sourceCode.trim()) {
    alert('Please enter your code before running.');
    return;
  }

  setRunningState(true, 'run');
  trayTabTest.click();
  trayStatusBadge.textContent = 'Running visible tests...';
  trayStatusBadge.style.color = '#60a5fa';

  caseSelectorBar.innerHTML = '';
  caseDetailBox.innerHTML = '<p style="color:#94a3b8;font-size:13px;">Executing code against visible test cases on Judge0 CE...</p>';

  try {
    const res = await fetch(`/api/problems/${currentProblem.id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceCode,
        language: activeLanguage
      })
    });

    const data = await res.json();
    if (!res.ok) {
      trayStatusBadge.textContent = 'Execution Error';
      trayStatusBadge.style.color = '#ef4444';
      caseDetailBox.innerHTML = `<div class="error-output-box">${escapeHtml(data.error || 'Failed to execute code.')}</div>`;
      return;
    }

    runResults = data;
    renderRunResults(data);
  } catch (err) {
    trayStatusBadge.textContent = 'Network Error';
    trayStatusBadge.style.color = '#ef4444';
    caseDetailBox.innerHTML = `<div class="error-output-box">${escapeHtml(err.message)}</div>`;
  } finally {
    setRunningState(false, 'run');
  }
}

function renderRunResults(data) {
  if (data.hasCompilationError) {
    trayStatusBadge.textContent = 'Compilation Error';
    trayStatusBadge.style.color = '#ef4444';
    caseSelectorBar.innerHTML = '';
    caseDetailBox.innerHTML = `
      <div style="color:#ef4444;font-weight:700;font-size:14px;margin-bottom:6px;">Compilation Error</div>
      <pre class="error-output-box">${escapeHtml(data.compileOutput || 'Compilation failed.')}</pre>
    `;
    return;
  }

  const passedCount = data.passed;
  const totalCount = data.total;
  const allPassed = data.allPassed;

  trayStatusBadge.textContent = allPassed
    ? `✓ All ${totalCount} tests passed`
    : `✗ ${passedCount} / ${totalCount} tests passed`;
  trayStatusBadge.style.color = allPassed ? '#34d399' : '#f87171';

  // Render case selector tabs
  caseSelectorBar.innerHTML = (data.results || []).map((res, i) => `
    <button class="case-btn ${i === 0 ? 'active' : ''}" data-case="${i}">
      <span class="dot ${res.passed ? 'passed' : 'failed'}"></span>
      Case ${res.testCase}
    </button>
  `).join('');

  activeTestCaseIndex = 0;
  renderCaseDetail(0);

  // Attach click listener to case selector buttons
  caseSelectorBar.querySelectorAll('.case-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      caseSelectorBar.querySelectorAll('.case-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const idx = Number(btn.dataset.case);
      renderCaseDetail(idx);
    });
  });
}

function renderCaseDetail(index) {
  if (!runResults || !runResults.results || !runResults.results[index]) return;
  const tc = runResults.results[index];

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-weight:700;font-size:13px;color:${tc.passed ? '#34d399' : '#f87171'};">
        ${tc.passed ? '✓ Test Passed' : `✗ ${tc.status || 'Wrong Answer'}`}
      </span>
      ${tc.time ? `<span style="font-size:11px;color:#a1a1aa;font-family:var(--font-mono);">${tc.time}s · ${Math.round(tc.memory / 1024)}MB</span>` : ''}
    </div>

    <div class="case-io-group">
      <label>Input</label>
      <pre class="case-io-box">${escapeHtml(tc.input || '')}</pre>
    </div>

    <div class="case-io-group">
      <label>Expected Output</label>
      <pre class="case-io-box">${escapeHtml(tc.expectedOutput || '')}</pre>
    </div>

    <div class="case-io-group">
      <label>Your Output</label>
      <pre class="case-io-box actual ${tc.passed ? '' : 'wrong'}">${escapeHtml(tc.actualOutput || '')}</pre>
    </div>
  `;

  if (tc.stderr) {
    html += `
      <div class="case-io-group">
        <label style="color:#ef4444">Standard Error</label>
        <pre class="error-output-box">${escapeHtml(tc.stderr)}</pre>
      </div>
    `;
  }

  caseDetailBox.innerHTML = html;
}

// ── Submit Flow (Hidden Test Cases) ───────────────────────────
async function handleSubmitCode() {
  if (!currentProblem || !monacoEditor || submitBtn.disabled) return;

  const sourceCode = monacoEditor.getValue();
  if (!sourceCode.trim()) {
    alert('Please write your solution before submitting.');
    return;
  }

  setRunningState(true, 'submit');
  trayTabSubmit.click();
  trayStatusBadge.textContent = 'Evaluating on hidden test cases...';
  trayStatusBadge.style.color = '#34d399';

  traySubmitResultView.innerHTML = `
    <div style="padding:18px;color:#a1a1aa;">
      <div style="font-size:14px;color:#ffffff;margin-bottom:6px;">Evaluating solution...</div>
      <div style="font-size:12px;">Running sequentially against hidden test cases in sandbox isolation.</div>
    </div>
  `;

  try {
    const res = await fetch(`/api/problems/${currentProblem.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceCode,
        language: activeLanguage
      })
    });

    const data = await res.json();
    if (res.status === 401) {
      trayStatusBadge.textContent = 'Sign In Required';
      trayStatusBadge.style.color = '#f59e0b';
      traySubmitResultView.innerHTML = `
        <div class="verdict-card failed">
          <div class="verdict-title">Authentication Required</div>
          <p style="color:#cbd5e1;font-size:13px;margin:8px 0 14px;">You must be signed in to submit code and record progress.</p>
          <a href="/?login=true" style="display:inline-block;padding:8px 16px;background:var(--primary);color:#fff;border-radius:6px;text-decoration:none;font:600 13px var(--font-sans);">Sign in to PrepFlow</a>
        </div>
      `;
      return;
    }

    if (!res.ok) {
      trayStatusBadge.textContent = 'Submission Failed';
      trayStatusBadge.style.color = '#ef4444';
      traySubmitResultView.innerHTML = `<div class="error-output-box">${escapeHtml(data.error || 'Submission error.')}</div>`;
      return;
    }

    renderSubmitResult(data);

    // If accepted, mark problem as solved in header & reload history
    if (data.verdict === 'Accepted') {
      topSolvedTag.hidden = false;
    }
    loadSubmissions(currentProblem.id);
  } catch (err) {
    trayStatusBadge.textContent = 'Network Error';
    trayStatusBadge.style.color = '#ef4444';
    traySubmitResultView.innerHTML = `<div class="error-output-box">${escapeHtml(err.message)}</div>`;
  } finally {
    setRunningState(false, 'submit');
  }
}

function renderSubmitResult(data) {
  const isAccepted = data.verdict === 'Accepted';
  trayStatusBadge.textContent = isAccepted ? '✓ Accepted' : `✗ ${data.verdict}`;
  trayStatusBadge.style.color = isAccepted ? '#34d399' : '#f87171';

  let verdictHtml = `
    <div class="verdict-card ${isAccepted ? 'accepted' : 'failed'}">
      <div class="verdict-title">
        ${isAccepted ? '✓ Accepted' : `✗ ${data.verdict}`}
      </div>
      <div class="verdict-stats">
        <span>Passed: <b>${data.testCasesPassed} / ${data.totalTestCases}</b> test cases</span>
        ${data.executionTime ? ` · <span>Runtime: <b>${data.executionTime}</b></span>` : ''}
        ${data.memoryUsed ? ` · <span>Memory: <b>${data.memoryUsed}</b></span>` : ''}
        ${!isAccepted && data.failedTestCase ? ` · <span style="color:#f87171">Failed on test case ${data.failedTestCase}</span>` : ''}
      </div>
  `;

  if (data.compileOutput) {
    verdictHtml += `
      <div style="font-size:12px;font-weight:700;color:#ef4444;margin-top:8px;">Compiler Output:</div>
      <pre class="error-output-box">${escapeHtml(data.compileOutput)}</pre>
    `;
  }

  if (data.stderr) {
    verdictHtml += `
      <div style="font-size:12px;font-weight:700;color:#ef4444;margin-top:8px;">Standard Error:</div>
      <pre class="error-output-box">${escapeHtml(data.stderr)}</pre>
    `;
  }

  verdictHtml += `</div>`;
  traySubmitResultView.innerHTML = verdictHtml;
}

// ── Submissions History ───────────────────────────────────────
async function loadSubmissions(problemId) {
  if (!problemId) return;
  try {
    const res = await fetch(`/api/problems/${problemId}/submissions`);
    if (!res.ok) return;
    const data = await res.json();
    userSubmissions = data.submissions || [];
    if (subsCount) subsCount.textContent = userSubmissions.length;
    renderSubmissionsTable(userSubmissions);
  } catch {
    /* silent */
  }
}

function renderSubmissionsTable(subs) {
  if (!subs || !subs.length) {
    submissionsTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">No submissions yet. Write your solution and click Submit.</td>
      </tr>
    `;
    return;
  }

  submissionsTableBody.innerHTML = subs.map(sub => {
    const isAcc = sub.verdict === 'Accepted';
    const badgeClass = isAcc ? 'accepted' : 'wrong-answer';
    const langLabel = getLangLabel(sub.language);
    return `
      <tr class="clickable" data-sub-id="${sub.id}">
        <td>
          <span class="verdict-badge ${badgeClass}">
            ${isAcc ? '✓' : '✗'} ${escapeHtml(sub.verdict)}
          </span>
        </td>
        <td><b>${langLabel}</b></td>
        <td>${sub.execution_time || '-'}</td>
        <td>${sub.memory_used ? `${Math.round(sub.memory_used / 1024)} MB` : '-'}</td>
        <td><small style="color:#64748b">${formatTimeAgo(sub.created_at)}</small></td>
      </tr>
    `;
  }).join('');

  submissionsTableBody.querySelectorAll('tr.clickable').forEach(row => {
    row.addEventListener('click', () => openSubmissionModal(row.dataset.subId));
  });
}

function getLangLabel(key) {
  if (key === 'cpp') return 'C++';
  if (key === 'java') return 'Java';
  if (key === 'python') return 'Python';
  if (key === 'javascript') return 'JavaScript';
  return key || 'Unknown';
}

// ── Historical Submission Modal ───────────────────────────────
async function openSubmissionModal(submissionId) {
  if (!submissionId) return;
  try {
    const res = await fetch(`/api/submissions/${submissionId}`);
    if (!res.ok) return;
    const { submission } = await res.json();

    modalTitle.textContent = `Submission Details — ${getLangLabel(submission.language)}`;
    const isAcc = submission.verdict === 'Accepted';
    modalVerdict.className = `verdict-badge ${isAcc ? 'accepted' : 'wrong-answer'}`;
    modalVerdict.textContent = `${isAcc ? '✓' : '✗'} ${submission.verdict}`;
    modalMeta.textContent = `${submission.execution_time || '-'} · ${submission.memory_used ? `${Math.round(submission.memory_used / 1024)} MB` : '-'} · ${formatTimeAgo(submission.created_at)}`;
    modalCodeView.textContent = submission.code || '';

    submissionModal.hidden = false;
  } catch (err) {
    alert('Failed to load submission: ' + err.message);
  }
}

if (modalCloseBtn) {
  modalCloseBtn.addEventListener('click', () => {
    submissionModal.hidden = true;
  });
}

if (submissionModal) {
  submissionModal.addEventListener('click', (e) => {
    if (e.target === submissionModal) submissionModal.hidden = true;
  });
}

// ── State Helper ──────────────────────────────────────────────
function setRunningState(isRunning, actionType) {
  runBtn.disabled = isRunning;
  submitBtn.disabled = isRunning;

  const btn = actionType === 'run' ? runBtn : submitBtn;
  const spinner = btn.querySelector('.mini-spinner');
  const text = btn.querySelector('.btn-text');

  if (spinner) spinner.hidden = !isRunning;
  if (text) text.hidden = isRunning;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Init ──────────────────────────────────────────────────────
if (runBtn) runBtn.addEventListener('click', handleRunCode);
if (submitBtn) submitBtn.addEventListener('click', handleSubmitCode);

(async () => {
  await initAuth();
  await loadProblem();
})();
