let roadmaps = {};

// ── State ─────────────────────────────────────────────────────
let activeSection = 'overview'; // 'overview' | 'core-cs' | 'coding' | 'resume'
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
  'overview': document.querySelector('#section-overview'),
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
    ? `<a href="/admin/subjects.html" class="btn-pill-dark" style="text-decoration:none;font-size:11.5px;padding:6px 14px;">✏ Edit Material</a>`
    : '';

  content.innerHTML = `
    <!-- Main Study Reader Card -->
    <article class="topic-main-card">
      <div class="topic-meta-strip">
        <span class="topic-tag-pill">LESSON 0${(activeSubheading + 1)}</span>
        <span class="topic-breadcrumbs">${subject.name.toUpperCase()} · ${heading.title.toUpperCase()}</span>
      </div>

      <h2 class="topic-heading-title">${subheading.title}</h2>
      
      <div class="topic-body-text markdown-content">
        ${formatMarkdown(subheading.text)}
      </div>

      <!-- Core Takeaways / Study Summary box -->
      <div class="topic-prompt-box">
        <span class="topic-prompt-label">KEY TAKEAWAY</span>
        <p class="topic-prompt-text">Review the core mechanisms above. Ensure you understand the underlying invariants, trade-offs, and memory implications before marking as complete.</p>
      </div>

      <!-- Study Action Bar -->
      <div class="topic-action-bar">
        <div style="display:flex;align-items:center;gap:12px;">
          <button class="btn-pill-dark" type="button" onclick="document.querySelector('[data-toggle=\\'${openSubject}:${openHeading}:${activeSubheading}\\']')?.click();">
            ✓ Mark as studied
          </button>
          <span style="font-size:12px;color:#777770;font-family:'DM Mono', monospace;">Estimated study time: 8-12 min</span>
        </div>
        ${editSubjectBtn}
      </div>
    </article>

    <!-- Right Study Companion Panel -->
    <aside class="companion-panel">
      <!-- Study & Concept Checklist Card -->
      <div class="approach-guide-card">
        <h4 class="guide-title">Study Checklist</h4>
        <div class="guide-step-list">
          <div class="guide-step-item">
            <span class="guide-step-num">01</span>
            <span>Understand the fundamental definitions & principles</span>
          </div>
          <div class="guide-step-item">
            <span class="guide-step-num">02</span>
            <span>Analyze how the OS / hardware handles state & resources</span>
          </div>
          <div class="guide-step-item">
            <span class="guide-step-num">03</span>
            <span>Identify time & space overhead of each technique</span>
          </div>
          <div class="guide-step-item">
            <span class="guide-step-num">04</span>
            <span>Verify with realistic system architecture trade-offs</span>
          </div>
        </div>
        <div class="guide-footer-badge">
          <span>✓</span> Check off topics on the left sidebar as you learn
        </div>
      </div>
    </aside>
  `;

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
    
    const userNameText = document.querySelector('#userNameText');
    if (userNameText) userNameText.textContent = user.name || 'Student';
    
    const userAvatarText = document.querySelector('#userAvatarText');
    if (userAvatarText && user.name) {
      const parts = user.name.trim().split(/\s+/);
      const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
      userAvatarText.textContent = initials;
    }

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
    // Define custom warm light theme matching #F0F1EC and #C66A35
    monaco.editor.defineTheme('prepflow-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '8a8b84', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'C66A35', fontStyle: 'bold' },
        { token: 'identifier', foreground: '111111' },
        { token: 'string', foreground: '2d6a4f' },
        { token: 'number', foreground: '9c4221' },
        { token: 'type', foreground: 'b45309' }
      ],
      colors: {
        'editor.background': '#FCFCFA',
        'editor.foreground': '#111111',
        'editorLineNumber.foreground': '#b8baa8',
        'editorLineNumber.activeForeground': '#C66A35',
        'editorCursor.foreground': '#C66A35',
        'editor.selectionBackground': '#fde8d8',
        'editor.inactiveSelectionBackground': '#f5eae2',
        'editor.lineHighlightBackground': '#F7F7F3'
      }
    });

    monacoEditor = monaco.editor.create(container, {
      value: DEFAULT_TEMPLATES[currentLanguageKey] || '',
      language: currentLanguageKey,
      theme: 'prepflow-light',
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

async function renderMindriftCharts() {
  // 1. Current Date
  const headerDateEl = document.querySelector('#currentHeaderDate');
  if (headerDateEl) {
    const now = new Date();
    headerDateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // 2. Fetch real user analytics (submissions, study completions)
  let userSubmissions = [];
  try {
    const res = await fetch('/api/analytics');
    if (res.ok) {
      const data = await res.json();
      userSubmissions = data.submissions || [];
    }
  } catch (err) {
    console.warn('Analytics fetch error:', err);
  }

  // 3. Compute Real Curriculum Stats
  const { done: totalDoneLessons, total: totalCurriculumLessons } = countAll();
  const curriculumPct = totalCurriculumLessons > 0 ? Math.round((totalDoneLessons / totalCurriculumLessons) * 100) : 0;

  // Real Submissions Stats
  const acceptedSubs = userSubmissions.filter(s => s.verdict === 'Accepted');
  const solvedProblemIds = new Set(acceptedSubs.map(s => s.problem_id));
  const totalSolvedCount = solvedProblemIds.size;
  const totalSubmissionsCount = userSubmissions.length;
  const accuracyRate = totalSubmissionsCount > 0 ? Math.round((acceptedSubs.length / totalSubmissionsCount) * 100) : 0;

  // Update DOM Metric Card 2 (Course Progress)
  const metricProgressVal = document.querySelector('#metricProgressVal');
  if (metricProgressVal) metricProgressVal.textContent = `${curriculumPct}%`;

  const metricProgressTag = document.querySelector('#metricProgressTag');
  if (metricProgressTag) metricProgressTag.textContent = `${totalDoneLessons} of ${totalCurriculumLessons} lessons`;

  const metricLessonsDone = document.querySelector('#metricLessonsDone');
  if (metricLessonsDone) metricLessonsDone.textContent = String(totalDoneLessons);

  const metricLessonsTotal = document.querySelector('#metricLessonsTotal');
  if (metricLessonsTotal) metricLessonsTotal.textContent = String(totalCurriculumLessons);

  // Update DOM Metric Card 3 (Coding Practice)
  const metricProblemsSolved = document.querySelector('#metricProblemsSolved');
  if (metricProblemsSolved) metricProblemsSolved.textContent = String(totalSolvedCount);

  const metricAcceptedSubs = document.querySelector('#metricAcceptedSubs');
  if (metricAcceptedSubs) metricAcceptedSubs.textContent = `${acceptedSubs.length} Accepted submissions`;

  const metricTotalSubs = document.querySelector('#metricTotalSubs');
  if (metricTotalSubs) metricTotalSubs.textContent = `${totalSubmissionsCount} Total evaluations`;

  const metricAccRate = document.querySelector('#metricAccRate');
  if (metricAccRate) metricAccRate.textContent = `${accuracyRate}% Accuracy rate`;

  // 4. Map Real Activities by Date (ISO YYYY-MM-DD)
  const activityMap = new Map();
  // Count submissions by date
  userSubmissions.forEach(sub => {
    if (!sub.created_at) return;
    const dateStr = sub.created_at.slice(0, 10);
    activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
  });

  // Calculate Streak & Active Days
  const activeDaysCount = activityMap.size;
  const totalActionsCount = userSubmissions.length + totalDoneLessons;

  // Compute current streak backwards from today
  let currentStreak = 0;
  const today = new Date();
  for (let d = 0; d < 365; d++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - d);
    const dateStr = checkDate.toISOString().slice(0, 10);
    if (activityMap.has(dateStr)) {
      currentStreak++;
    } else if (d > 0) {
      break;
    }
  }

  // Update DOM Metric Card 1 (Streak & Active Days)
  const metricStreakVal = document.querySelector('#metricStreakVal');
  if (metricStreakVal) metricStreakVal.textContent = String(currentStreak);

  const metricStreakTag = document.querySelector('#metricStreakTag');
  if (metricStreakTag) metricStreakTag.textContent = currentStreak === 1 ? '1 day streak' : `${currentStreak} days streak`;

  const metricLongestStreak = document.querySelector('#metricLongestStreak');
  if (metricLongestStreak) metricLongestStreak.textContent = `${currentStreak} days`;

  const metricActiveDays = document.querySelector('#metricActiveDays');
  if (metricActiveDays) metricActiveDays.textContent = `${activeDaysCount} days`;

  const metricTotalActions = document.querySelector('#metricTotalActions');
  if (metricTotalActions) metricTotalActions.textContent = String(totalActionsCount);

  const timelineActiveDaysCount = document.querySelector('#timelineActiveDaysCount');
  if (timelineActiveDaysCount) timelineActiveDaysCount.textContent = String(activeDaysCount);

  // 5. Generate Heatmap Grid for the Past 52 Weeks (364 Days)
  const heatmapGrid = document.querySelector('#heatmapGrid');
  if (heatmapGrid) {
    heatmapGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // End date is next Saturday to align neat columns
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(end.getDate() - (52 * 7 - 1));

    let cursor = new Date(start);
    for (let w = 0; w < 52; w++) {
      const colDiv = document.createElement('div');
      colDiv.className = 'heatmap-col';

      for (let day = 0; day < 7; day++) {
        const cell = document.createElement('div');
        cell.className = 'heat-cell';
        const dateStr = cursor.toISOString().slice(0, 10);
        const count = activityMap.get(dateStr) || 0;

        if (count === 0) {
          cell.classList.add('lvl-0');
        } else if (count === 1) {
          cell.classList.add('lvl-1');
        } else if (count <= 3) {
          cell.classList.add('lvl-2');
        } else if (count <= 6) {
          cell.classList.add('lvl-3');
        } else {
          cell.classList.add('lvl-4');
        }

        cell.title = `${dateStr}: ${count} activity${count === 1 ? '' : 'ies'}`;
        colDiv.appendChild(cell);
        cursor.setDate(cursor.getDate() + 1);
      }
      fragment.appendChild(colDiv);
    }
    heatmapGrid.appendChild(fragment);
  }

  // 6. Micro bar charts (Weekly breakdown of real data)
  const streakMicroBars = document.querySelector('#streakMicroBars');
  if (streakMicroBars) {
    streakMicroBars.innerHTML = '';
    // Show last 14 days
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = activityMap.get(dateStr) || 0;
      const bar = document.createElement('div');
      bar.className = 'micro-bar';
      bar.style.height = count > 0 ? `${Math.min(100, 30 + count * 20)}%` : '15%';
      if (count > 0) bar.classList.add('active-accent');
      streakMicroBars.appendChild(bar);
    }
  }

  const courseMicroBars = document.querySelector('#courseMicroBars');
  if (courseMicroBars) {
    courseMicroBars.innerHTML = '';
    for (let i = 0; i < 14; i++) {
      const bar = document.createElement('div');
      bar.className = 'micro-bar';
      const pct = totalCurriculumLessons > 0 ? (totalDoneLessons / totalCurriculumLessons) : 0;
      bar.style.height = `${Math.max(15, Math.round(pct * 100))}%`;
      if (pct > 0) bar.classList.add('active-amber');
      courseMicroBars.appendChild(bar);
    }
  }

  const studyMicroBars = document.querySelector('#studyMicroBars');
  if (studyMicroBars) {
    studyMicroBars.innerHTML = '';
    for (let i = 0; i < 14; i++) {
      const bar = document.createElement('div');
      bar.className = 'micro-bar';
      bar.style.height = totalSubmissionsCount > 0 ? '60%' : '15%';
      if (totalSubmissionsCount > 0) bar.classList.add('active-blue');
      studyMicroBars.appendChild(bar);
    }
  }

  // 7. Render Real Course Progress in Learning Progress Widget
  const widgetList = document.querySelector('#widgetLearningProgressList');
  if (widgetList) {
    widgetList.innerHTML = '';
    const subjectKeys = Object.keys(roadmaps);
    if (subjectKeys.length === 0) {
      widgetList.innerHTML = '<p style="color:var(--ink-muted);font-size:12px;">No subjects loaded.</p>';
    } else {
      const colors = ['var(--accent)', '#d97706', '#2563eb', '#10b981'];
      subjectKeys.forEach((subjId, idx) => {
        const subj = roadmaps[subjId];
        const { done, total } = countSubject(subjId);
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const color = colors[idx % colors.length];

        const item = document.createElement('div');
        item.className = 'course-item';
        item.style.cursor = 'pointer';
        item.onclick = () => {
          openSubject = subjId;
          openHeading = 0;
          activeSubheading = 0;
          switchSection('core-cs');
          render();
        };

        const initials = subj.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();

        item.innerHTML = `
          <div class="course-badge" style="background:${color};">${initials}</div>
          <div class="course-details">
            <div class="course-name">${escapeHtml(subj.name)}</div>
            <div class="course-sub">${done} of ${total} modules completed</div>
          </div>
          <div class="course-ring-wrap">
            <svg viewBox="0 0 36 36" class="circular-chart" style="width:36px;height:36px;">
              <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#dedfd8" stroke-width="3.5"/>
              <path class="circle" stroke-dasharray="${pct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
            </svg>
            <span class="course-ring-val">${pct}%</span>
          </div>
        `;
        widgetList.appendChild(item);
      });
    }
  }
}

// ── Init ──────────────────────────────────────────────────────
(async () => {
  await loadDashboard();
  await loadRoadmaps();
  await loadProgress();
  await loadLanguages();
  await loadCatalogTopics();
  await loadCatalogProblems();
  render();
  renderMindriftCharts();

  // Check URL query for default section
  const urlParams = new URLSearchParams(window.location.search);
  const targetSec = urlParams.get('section');
  if (targetSec && ['overview', 'core-cs', 'coding', 'resume'].includes(targetSec)) {
    switchSection(targetSec);
  } else {
    switchSection('overview');
  }
})();

