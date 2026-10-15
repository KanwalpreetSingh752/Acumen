let roadmaps = {};

// ── State ─────────────────────────────────────────────────────
let activeSection = 'core-cs'; // 'core-cs' | 'coding' | 'resume'
let openSubject = 'os';
let openHeading = 0;
let activeSubheading = 0;
let completed = new Set();
let currentUser = null;

// ── Monaco & Coding State ─────────────────────────────────────
let monacoEditor = null;
let supportedLanguages = {};
let currentLanguageKey = 'cpp';

// ── DOM refs ───────────────────────────────────────────────────
const nav = document.querySelector('#roadmapNav');
const content = document.querySelector('#roadmapContent');
const overallProgressEl = document.querySelector('#overallProgress');
const sidebarCoreCsSubnav = document.querySelector('#sidebarCoreCsSubnav');
const sectionTabs = document.querySelectorAll('.section-tab');
const dashboardSections = {
  'core-cs': document.querySelector('#section-core-cs'),
  'coding': document.querySelector('#section-coding'),
  'resume': document.querySelector('#section-resume')
};

// Coding DOM refs
const languageSelect = document.querySelector('#languageSelect');
const editorLangBadge = document.querySelector('#editorLangBadge');
const stdinInput = document.querySelector('#stdinInput');
const clearStdinBtn = document.querySelector('#clearStdinBtn');
const runCodeBtn = document.querySelector('#runCodeBtn');
const resetCodeBtn = document.querySelector('#resetCodeBtn');
const executionStatus = document.querySelector('#executionStatus');
const executionMetrics = document.querySelector('#executionMetrics');
const terminalOutput = document.querySelector('#terminalOutput');
const runText = document.querySelector('.run-text');
const runSpinner = document.querySelector('.run-spinner');

// ── Section Switching ──────────────────────────────────────────
function switchSection(targetSection) {
  if (!dashboardSections[targetSection]) return;
  activeSection = targetSection;

  // Toggle tab buttons
  sectionTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.section === targetSection);
  });

  // Toggle main containers
  Object.entries(dashboardSections).forEach(([name, secEl]) => {
    if (!secEl) return;
    const isCurrent = name === targetSection;
    secEl.hidden = !isCurrent;
    secEl.classList.toggle('active', isCurrent);
  });

  // Show or hide Core CS subject list in sidebar
  if (sidebarCoreCsSubnav) {
    sidebarCoreCsSubnav.style.display = targetSection === 'core-cs' ? 'block' : 'none';
  }

  // Trigger catalog refresh or Monaco layout if coding view becomes active
  if (targetSection === 'coding') {
    loadCatalogProblems();
    if (codingSandboxView && !codingSandboxView.hidden) {
      if (!monacoEditor) {
        initMonaco();
      } else {
        setTimeout(() => monacoEditor.layout(), 50);
      }
    }
  }
}

sectionTabs.forEach((tab) => {
  tab.addEventListener('click', () => switchSection(tab.dataset.section));
});

// ── Progress helpers ──────────────────────────────────────────
function countSubject(id) {
  let done = 0, total = 0;
  if (!roadmaps[id] || !roadmaps[id].headings) return { done: 0, total: 0 };
  roadmaps[id].headings.forEach((h, hi) =>
    h.subheadings.forEach((_, si) => {
      total++;
      if (completed.has(`${id}:${hi}:${si}`)) done++;
    })
  );
  return { done, total };
}

function countAll() {
  return Object.keys(roadmaps).reduce((acc, id) => {
    const { done, total } = countSubject(id);
    return { done: acc.done + done, total: acc.total + total };
  }, { done: 0, total: 0 });
}

// ── Markdown renderer ─────────────────────────────────────────
function formatMarkdown(markdown) {
  const escaped = String(markdown || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bold = (v) => v.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  let inList = false; const out = [];
  for (const line of escaped.split('\n')) {
    if (/^-\s+/.test(line)) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${bold(line.replace(/^-\s+/, ''))}</li>`); continue; }
    if (inList) { out.push('</ul>'); inList = false; }
    if (/^###\s+/.test(line)) out.push(`<h4>${bold(line.replace(/^###\s+/, ''))}</h4>`);
    else if (/^##\s+/.test(line)) out.push(`<h3>${bold(line.replace(/^##\s+/, ''))}</h3>`);
    else if (/^>\s+/.test(line)) out.push(`<blockquote>${bold(line.replace(/^>\s+/, ''))}</blockquote>`);
    else if (line.trim()) out.push(`<p>${bold(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

// ── Render helpers ────────────────────────────────────────────
function renderSubheadings(id, hi, heading) {
  if (!heading.subheadings.length) return '';
  return `<div class="subheading-list">
    ${heading.subheadings.map((sub, si) => {
      const key = `${id}:${hi}:${si}`;
      const safeId = `${id}-${hi}-${si}`;
      const isDone = completed.has(key);
      const isActive = si === activeSubheading;
      return `<div class="subheading-item${isActive ? ' active' : ''}${isDone ? ' done' : ''}">
        <input type="checkbox" class="subheading-check" id="chk-${safeId}" data-toggle="${key}"${isDone ? ' checked' : ''}>
        <label class="check-label" for="chk-${safeId}"></label>
        <button class="subheading-link" data-subheading="${si}">${sub.title}</button>
      </div>`;
    }).join('')}
  </div>`;
}

function renderHeadings(id, subject) {
  return `<div class="heading-list">
    ${subject.headings.map((heading, hi) => {
      const headingOpen = hi === openHeading;
      return `<section class="heading-group ${headingOpen ? 'open' : ''}">
        <button class="heading-link" data-heading="${hi}" aria-expanded="${headingOpen}">
          ${heading.title}<i>⌄</i>
        </button>
        ${headingOpen ? renderSubheadings(id, hi, heading) : ''}
      </section>`;
    }).join('')}
  </div>`;
}

function renderOverallProgress() {
  const { done, total } = countAll();
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  if (overallProgressEl) {
    overallProgressEl.innerHTML = `
      <div class="overall-bar-header">
        <span class="overall-label">OVERALL PROGRESS</span>
        <span class="overall-count">${done} / ${total} topics</span>
      </div>
      <div class="overall-bar-track">
        <div class="overall-bar-fill" style="width:${pct}%"></div>
      </div>`;
  }
}

// ── Main render (Roadmaps) ───────────────────────────────────
function render() {
  if (!nav || !content) return;
  // Sidebar
  nav.innerHTML = Object.entries(roadmaps).map(([id, subject]) => {
    const subjectOpen = id === openSubject;
    const { done, total } = countSubject(id);
    const allDone = total > 0 && done === total;
    return `<section class="subject-group ${subjectOpen ? 'open' : ''}">
      <button class="subject-link" data-subject="${id}" aria-expanded="${subjectOpen}">
        <span class="subject-icon ${id}">${subject.icon}</span>
        <span class="subject-name-wrap">
          <b>${subject.name}</b>
          <small>${subject.subtitle}</small>
        </span>
        <span class="subject-pill${allDone ? ' done' : ''}">${done}/${total}</span>
        <i>⌄</i>
      </button>
      ${subjectOpen ? renderHeadings(id, subject) : ''}
    </section>`;
  }).join('');

  // Content area
  if (!openSubject || openHeading === null) {
    content.innerHTML = `<div class="content-top"><div><p class="eyebrow">CORE CS ROADMAPS</p><h2>Choose a heading to begin.</h2></div></div>`;
    renderOverallProgress();
    return;
  }

  const subject = roadmaps[openSubject];
  const heading = subject?.headings[openHeading];
  const subheading = heading?.subheadings[activeSubheading];

  if (!heading || !subheading) {
    content.innerHTML = `<div class="content-top"><div><p class="eyebrow">CORE CS ROADMAPS</p><h2>Choose a subheading to begin.</h2></div></div>`;
    renderOverallProgress();
    return;
  }

  const { done, total } = countSubject(openSubject);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const editSubjectBtn = (currentUser && currentUser.isAdmin)
    ? `<a href="/admin/subjects.html" class="edit-material-btn" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#5540c1;background:#f3f0ff;border:1px solid #dcd7fc;border-radius:6px;padding:5px 9px;text-decoration:none;margin-left:auto;">✏ Edit Subject Material</a>`
    : '';

  content.innerHTML = `
    <div class="subject-progress-wrap">
      <div class="subject-bar-header">
        <span>${subject.name}</span>
        <span>${done} / ${total} completed</span>
      </div>
      <div class="subject-bar-track">
        <div class="subject-bar-fill ${openSubject}" style="width:${pct}%"></div>
      </div>
    </div>
    <div class="content-top">
      <span class="content-icon ${openSubject}">${subject.icon}</span>
      <div style="flex:1;">
        <p class="eyebrow">${subject.name.toUpperCase()} / ${heading.title.toUpperCase()}</p>
        <h2>${subheading.title}</h2>
      </div>
      ${editSubjectBtn}
    </div>
    <div class="topic-text markdown-content">${formatMarkdown(subheading.text)}</div>
    <p class="topic-note">Select another subheading in the sidebar to continue this roadmap.</p>`;

  renderOverallProgress();
}

// Navigation clicks
if (nav) {
  nav.addEventListener('click', (event) => {
    const label = event.target.closest('label.check-label');
    const checkbox = event.target.closest('.subheading-check');
    if (label || checkbox) {
      event.preventDefault();
      const targetInput = checkbox || (label && label.previousElementSibling);
      if (targetInput && targetInput.dataset.toggle) {
        toggleTopic(targetInput.dataset.toggle);
      }
      return;
    }

    const subjectBtn = event.target.closest('[data-subject]');
    const headingBtn = event.target.closest('[data-heading]');
    const subheadingBtn = event.target.closest('[data-subheading]');

    if (subjectBtn) {
      openSubject = openSubject === subjectBtn.dataset.subject ? null : subjectBtn.dataset.subject;
      openHeading = 0; activeSubheading = 0;
      render();
    } else if (headingBtn) {
      openHeading = openHeading === Number(headingBtn.dataset.heading) ? null : Number(headingBtn.dataset.heading);
      activeSubheading = 0;
      render();
    } else if (subheadingBtn) {
      activeSubheading = Number(subheadingBtn.dataset.subheading);
      render();
    }
  });
}

// ── API calls ─────────────────────────────────────────────────
async function toggleTopic(key) {
  const wasChecked = completed.has(key);
  wasChecked ? completed.delete(key) : completed.add(key);
  render();

  try {
    const res = await fetch('/api/progress/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (!res.ok) throw new Error('Server error');
    const { completed: list } = await res.json();
    completed = new Set(list);
    render();
  } catch {
    wasChecked ? completed.add(key) : completed.delete(key);
    render();
  }
}

async function loadProgress() {
  try {
    const res = await fetch('/api/progress');
    if (res.ok) {
      const { completed: list } = await res.json();
      completed = new Set(list);
    }
  } catch { /* silent */ }
}

async function loadDashboard() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) throw new Error('Not signed in');
    const { user } = await res.json();
    currentUser = user;
    const userNameEl = document.querySelector('#userName');
    if (userNameEl) userNameEl.textContent = user.name.split(' ')[0];
    const adminLink = document.querySelector('#adminProblemsLink');
    if (adminLink) adminLink.hidden = !user.isAdmin;
    const adminSubjectsLink = document.querySelector('#adminSubjectsLink');
    if (adminSubjectsLink) adminSubjectsLink.hidden = !user.isAdmin;
    if (Object.keys(roadmaps).length) render();
  } catch {
    window.location.replace('/');
  }
}

const logoutBtn = document.querySelector('#logoutButton');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/');
  });
}

async function loadRoadmaps() {
  try {
    const res = await fetch('/api/roadmaps');
    if (!res.ok) throw new Error('Failed to fetch roadmaps');
    roadmaps = await res.json();
    const keys = Object.keys(roadmaps);
    if (keys.length && (!openSubject || !roadmaps[openSubject])) {
      openSubject = keys[0];
      openHeading = 0;
      activeSubheading = 0;
    }
  } catch (err) {
    console.error('Error loading study materials:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// MONACO EDITOR & JUDGE0 CODE EXECUTION
// ═══════════════════════════════════════════════════════════════

const DEFAULT_TEMPLATES = {
  cpp: `#include <iostream>
using namespace std;

int main() {
    int a = 0, b = 0;
    if (cin >> a >> b) {
        cout << "Sum: " << (a + b) << endl;
    } else {
        cout << "Hello from PrepFlow! (Enter numbers in stdin box above to compute sum)" << endl;
    }
    return 0;
}`,
  java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int a = sc.nextInt();
            if (sc.hasNextInt()) {
                int b = sc.nextInt();
                System.out.println("Sum: " + (a + b));
                return;
            }
        }
        System.out.println("Hello from PrepFlow! (Enter numbers in stdin box above to compute sum)");
    }
}`,
  python: `import sys

data = sys.stdin.read().split()
if len(data) >= 2:
    print("Sum:", int(data[0]) + int(data[1]))
else:
    print("Hello from PrepFlow! (Enter numbers in stdin box above to compute sum)")
`,
  javascript: `const fs = require('fs');

const input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/).filter(Boolean);
if (input.length >= 2) {
  console.log("Sum:", Number(input[0]) + Number(input[1]));
} else {
  console.log("Hello from PrepFlow! (Enter numbers in stdin box above to compute sum)");
}
`
};

async function loadLanguages() {
  try {
    const res = await fetch('/api/code/languages');
    if (res.ok) {
      const data = await res.json();
      data.languages.forEach((lang) => {
        supportedLanguages[lang.key] = lang;
      });
    }
  } catch {
    // Fallback if offline
    supportedLanguages = {
      cpp: { id: 54, key: 'cpp', monaco: 'cpp', name: 'C++ (GCC 9.2.0)' },
      java: { id: 62, key: 'java', monaco: 'java', name: 'Java (OpenJDK 13.0.1)' },
      python: { id: 71, key: 'python', monaco: 'python', name: 'Python (3.8.1)' },
      javascript: { id: 63, key: 'javascript', monaco: 'javascript', name: 'JavaScript (Node.js 12.14.0)' }
    };
  }
}

function initMonaco() {
  const container = document.getElementById('monacoContainer');
  if (!container || !window.require) return;

  window.require.config({
    paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
  });

  window.require(['vs/editor/editor.main'], () => {
    monacoEditor = monaco.editor.create(container, {
      value: DEFAULT_TEMPLATES[currentLanguageKey] || '',
      language: currentLanguageKey,
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

function updateEditorLanguage(newLangKey) {
  currentLanguageKey = newLangKey;
  if (editorLangBadge) editorLangBadge.textContent = newLangKey;

  const langInfo = supportedLanguages[newLangKey] || { monaco: newLangKey };
  if (monacoEditor) {
    const model = monacoEditor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, langInfo.monaco || newLangKey);
      monacoEditor.setValue(DEFAULT_TEMPLATES[newLangKey] || '');
    }
  }
}

if (languageSelect) {
  languageSelect.addEventListener('change', (e) => {
    updateEditorLanguage(e.target.value);
  });
}

if (resetCodeBtn) {
  resetCodeBtn.addEventListener('click', () => {
    if (monacoEditor && DEFAULT_TEMPLATES[currentLanguageKey]) {
      monacoEditor.setValue(DEFAULT_TEMPLATES[currentLanguageKey]);
    }
  });
}

if (clearStdinBtn && stdinInput) {
  clearStdinBtn.addEventListener('click', () => {
    stdinInput.value = '';
    stdinInput.focus();
  });
}

function setExecutionStatus(type, label) {
  if (!executionStatus) return;
  executionStatus.className = `status-pill ${type}`;
  executionStatus.textContent = label;
}

async function handleRunCode() {
  if (!monacoEditor || runCodeBtn.disabled) return;

  const sourceCode = monacoEditor.getValue();
  const stdin = stdinInput ? stdinInput.value : '';
  const langObj = supportedLanguages[currentLanguageKey] || { id: 54 };

  runCodeBtn.disabled = true;
  if (runText) runText.hidden = true;
  if (runSpinner) runSpinner.hidden = false;
  setExecutionStatus('running', 'Executing...');
  if (executionMetrics) executionMetrics.hidden = true;

  terminalOutput.innerHTML = '<span style="color:#94a3b8">Submitting code to Judge0 CE sandbox...</span>';

  try {
    const res = await fetch('/api/code/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceCode,
        languageId: langObj.id,
        stdin
      })
    });

    const result = await res.json();

    if (!res.ok) {
      setExecutionStatus('error', 'Error');
      terminalOutput.innerHTML = `<div class="output-section stderr"><div class="output-section-title">Submission Error</div><div class="output-text">${result.error || 'Execution failed.'}</div></div>`;
      return;
    }

    // Determine badge class from normalized status
    const status = result.status || 'Unknown';
    let statusClass = 'error';
    if (status === 'Accepted') statusClass = 'accepted';
    else if (status.includes('Wrong Answer')) statusClass = 'wrong-answer';
    else if (status.includes('Compilation Error')) statusClass = 'compilation-error';
    else if (status.includes('Time Limit Exceeded')) statusClass = 'time-limit-exceeded';
    else if (status.includes('Runtime Error')) statusClass = 'runtime-error';

    setExecutionStatus(statusClass, status);

    // Show timing and memory if provided
    if (executionMetrics) {
      const parts = [];
      if (result.time) parts.push(`${result.time}s`);
      if (result.memory) parts.push(`${Math.round(result.memory / 1024)}MB`);
      if (parts.length > 0) {
        executionMetrics.textContent = parts.join(' · ');
        executionMetrics.hidden = false;
      }
    }

    // Build terminal output
    let html = '';
    if (result.stdout) {
      html += `<div class="output-section stdout"><div class="output-section-title">Output</div><div class="output-text">${escapeHtml(result.stdout)}</div></div>`;
    }
    if (result.compileOutput) {
      html += `<div class="output-section compile"><div class="output-section-title">Compiler Output</div><div class="output-text">${escapeHtml(result.compileOutput)}</div></div>`;
    }
    if (result.stderr) {
      html += `<div class="output-section stderr"><div class="output-section-title">Standard Error</div><div class="output-text">${escapeHtml(result.stderr)}</div></div>`;
    }

    if (!html) {
      html = '<span style="color:#64748b">(Program completed with empty output)</span>';
    }

    terminalOutput.innerHTML = html;
  } catch (err) {
    setExecutionStatus('error', 'Network Error');
    terminalOutput.innerHTML = `<div class="output-section stderr"><div class="output-section-title">Network Error</div><div class="output-text">${escapeHtml(err.message)}</div></div>`;
  } finally {
    runCodeBtn.disabled = false;
    if (runText) runText.hidden = false;
    if (runSpinner) runSpinner.hidden = true;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

if (runCodeBtn) {
  runCodeBtn.addEventListener('click', handleRunCode);
}

// ═══════════════════════════════════════════════════════════════
// PROBLEM CATALOG (PHASE 2)
// ═══════════════════════════════════════════════════════════════

const modeBtnProblems = document.querySelector('#modeBtnProblems');
const modeBtnSandbox = document.querySelector('#modeBtnSandbox');
const codingProblemsView = document.querySelector('#codingProblemsView');
const codingSandboxView = document.querySelector('#codingSandboxView');

const catalogSearchInput = document.querySelector('#catalogSearchInput');
const catalogDiffFilter = document.querySelector('#catalogDiffFilter');
const catalogTopicFilter = document.querySelector('#catalogTopicFilter');
const catalogTableBody = document.querySelector('#catalogTableBody');

function switchCodingMode(mode) {
  if (!modeBtnProblems || !modeBtnSandbox) return;
  const isProblems = mode === 'problems';

  modeBtnProblems.classList.toggle('active', isProblems);
  modeBtnSandbox.classList.toggle('active', !isProblems);

  if (codingProblemsView) codingProblemsView.hidden = !isProblems;
  if (codingSandboxView) codingSandboxView.hidden = isProblems;

  if (!isProblems) {
    if (!monacoEditor) {
      initMonaco();
    } else {
      setTimeout(() => monacoEditor.layout(), 50);
    }
  } else {
    loadCatalogProblems();
  }
}

if (modeBtnProblems && modeBtnSandbox) {
  modeBtnProblems.addEventListener('click', () => switchCodingMode('problems'));
  modeBtnSandbox.addEventListener('click', () => switchCodingMode('sandbox'));
}

async function loadCatalogTopics() {
  if (!catalogTopicFilter) return;
  try {
    const res = await fetch('/api/topics');
    if (!res.ok) return;
    const { topics } = await res.json();
    catalogTopicFilter.innerHTML = '<option value="">All Topics</option>' +
      (topics || []).map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  } catch {
    /* silent */
  }
}

let catalogSearchDebounce = null;
async function loadCatalogProblems() {
  if (!catalogTableBody) return;
  const search = catalogSearchInput ? encodeURIComponent(catalogSearchInput.value.trim()) : '';
  const difficulty = catalogDiffFilter ? encodeURIComponent(catalogDiffFilter.value) : '';
  const topic = catalogTopicFilter ? encodeURIComponent(catalogTopicFilter.value) : '';

  try {
    const res = await fetch(`/api/problems?search=${search}&difficulty=${difficulty}&topic=${topic}`);
    if (!res.ok) throw new Error('Failed to load problems');
    const { problems } = await res.json();

    if (!problems || !problems.length) {
      catalogTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;padding:32px;color:#94a3b8;">
            No problems found matching your filters.
          </td>
        </tr>
      `;
      return;
    }

    catalogTableBody.innerHTML = problems.map(prob => {
      const diffClass = (prob.difficulty || 'easy').toLowerCase();
      const isSolved = Boolean(prob.isSolved);
      const statusBadge = isSolved
        ? `<span class="status-badge solved">✓ Solved</span>`
        : `<span class="status-badge unsolved">-</span>`;

      const topicPills = (prob.topics || []).map(t =>
        `<span class="topic-pill">${escapeHtml(t.name)}</span>`
      ).join('');

      return `
        <tr>
          <td>${statusBadge}</td>
          <td>
            <a href="/problems/${prob.slug}" class="problem-title-cell">${escapeHtml(prob.title)}</a>
          </td>
          <td>
            <span class="diff-badge ${diffClass}">${escapeHtml(prob.difficulty || 'Easy')}</span>
          </td>
          <td>${topicPills || '<span style="color:#94a3b8;font-size:12px;">-</span>'}</td>
          <td style="text-align:right;">
            <a href="/problems/${prob.slug}" class="btn-solve-action">Solve →</a>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    catalogTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;padding:24px;color:#ef4444;">
          Error loading problems: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}

if (catalogSearchInput) {
  catalogSearchInput.addEventListener('input', () => {
    clearTimeout(catalogSearchDebounce);
    catalogSearchDebounce = setTimeout(loadCatalogProblems, 250);
  });
}
if (catalogDiffFilter) {
  catalogDiffFilter.addEventListener('change', loadCatalogProblems);
}
if (catalogTopicFilter) {
  catalogTopicFilter.addEventListener('change', loadCatalogProblems);
}

// Resize Monaco on window resize
window.addEventListener('resize', () => {
  if (monacoEditor && activeSection === 'coding' && codingSandboxView && !codingSandboxView.hidden) {
    monacoEditor.layout();
  }
});

// ── Init ──────────────────────────────────────────────────────
(async () => {
  await loadDashboard();
  await loadRoadmaps();
  await loadProgress();
  await loadLanguages();
  await loadCatalogTopics();
  await loadCatalogProblems();
  render();

  // Check URL query for default section
  const urlParams = new URLSearchParams(window.location.search);
  const targetSec = urlParams.get('section');
  if (targetSec && ['core-cs', 'coding', 'resume'].includes(targetSec)) {
    switchSection(targetSec);
  }
})();

