const api = '/api/admin';
let subjectsList = [];
let isEditing = false;
let currentKey = null;

const $ = (s) => document.querySelector(s);
const notice = $('#notice');
const form = $('#subjectForm');

function say(message, isError = true) {
  notice.textContent = message;
  notice.style.color = isError ? '#b23646' : '#278054';
  const fn = $('#formNotice');
  if (fn) {
    fn.textContent = message;
    fn.style.color = isError ? '#b23646' : '#278054';
  }
  if (isError) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

async function request(url, options = {}) {
  const res = await fetch(url, options);
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Request failed.');
  }
  return data;
}

function slugify(val) {
  return String(val || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Headings & Subheadings Template Helpers ──

function createHeadingElement(data = { title: '', text: '', subheadings: [] }) {
  const block = document.createElement('div');
  block.className = 'heading-block';

  block.innerHTML = `
    <div class="heading-header">
      <span class="heading-title-badge">
        <span>📖 Heading</span>
      </span>
      <div>
        <button type="button" class="btn-secondary" data-move-heading="up" title="Move Up">↑</button>
        <button type="button" class="btn-secondary" data-move-heading="down" title="Move Down">↓</button>
        <button type="button" class="btn-danger" data-remove-heading>Remove Heading</button>
      </div>
    </div>
    <div class="two-col">
      <label>Heading / Chapter Title
        <input data-field="heading-title" required placeholder="e.g. Memory Management" value="${escapeHtml(data.title || '')}">
      </label>
      <label>Overview Summary (optional)
        <input data-field="heading-text" placeholder="Brief explanation of this chapter" value="${escapeHtml(data.text || '')}">
      </label>
    </div>
    <div style="margin-top: 14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:700;color:#556276;">Subheadings / Specific Topics</span>
        <button type="button" class="btn-secondary" data-add-subheading>+ Add Topic Note</button>
      </div>
      <div class="subheadings-container"></div>
    </div>
  `;

  const subContainer = block.querySelector('.subheadings-container');
  if (Array.isArray(data.subheadings)) {
    data.subheadings.forEach(sub => {
      subContainer.appendChild(createSubheadingElement(sub));
    });
  }

  return block;
}

function createSubheadingElement(data = { title: '', text: '' }) {
  const sub = document.createElement('div');
  sub.className = 'subheading-block';

  sub.innerHTML = `
    <div class="subheading-header">
      <span>✦ Topic Note</span>
      <div>
        <button type="button" class="btn-secondary" data-move-sub="up" title="Move Up">↑</button>
        <button type="button" class="btn-secondary" data-move-sub="down" title="Move Down">↓</button>
        <button type="button" class="btn-danger" data-remove-sub>Delete Topic</button>
      </div>
    </div>
    <label style="display:grid;gap:6px;font-size:11px;font-weight:800;color:#4f5b70;margin-bottom:10px;">
      Topic Title
      <input data-field="subheading-title" required placeholder="e.g. Virtual Memory & Paging" value="${escapeHtml(data.title || '')}">
    </label>
    <label style="display:grid;gap:6px;font-size:11px;font-weight:800;color:#4f5b70;">
      Study Material & Explanation (Markdown supported)
      <textarea data-field="subheading-text" rows="6" placeholder="Detailed content explaining concepts, definitions, bullet points, or code snippets...">${escapeHtml(data.text || '')}</textarea>
    </label>
  `;

  return sub;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Event Handlers for Reordering and Adding Items ──

document.addEventListener('click', (e) => {
  // Add Heading
  if (e.target.id === 'addHeadingBtn') {
    $('#headingsContainer').appendChild(createHeadingElement());
    return;
  }

  // Add Subheading inside a heading block
  const addSubBtn = e.target.closest('[data-add-subheading]');
  if (addSubBtn) {
    const headingBlock = addSubBtn.closest('.heading-block');
    const subContainer = headingBlock.querySelector('.subheadings-container');
    subContainer.appendChild(createSubheadingElement());
    return;
  }

  // Remove Heading
  if (e.target.matches('[data-remove-heading]')) {
    const headingBlock = e.target.closest('.heading-block');
    if (confirm('Are you sure you want to delete this entire heading and its topics?')) {
      headingBlock.remove();
    }
    return;
  }

  // Remove Subheading
  if (e.target.matches('[data-remove-sub]')) {
    const subBlock = e.target.closest('.subheading-block');
    subBlock.remove();
    return;
  }

  // Move Heading Up / Down
  const moveHeadingBtn = e.target.closest('[data-move-heading]');
  if (moveHeadingBtn) {
    const dir = moveHeadingBtn.dataset.moveHeading;
    const block = moveHeadingBtn.closest('.heading-block');
    const sibling = dir === 'up' ? block.previousElementSibling : block.nextElementSibling;
    if (sibling && sibling.matches('.heading-block')) {
      dir === 'up' ? block.parentNode.insertBefore(block, sibling) : block.parentNode.insertBefore(sibling, block);
    }
    return;
  }

  // Move Subheading Up / Down
  const moveSubBtn = e.target.closest('[data-move-sub]');
  if (moveSubBtn) {
    const dir = moveSubBtn.dataset.moveSub;
    const block = moveSubBtn.closest('.subheading-block');
    const sibling = dir === 'up' ? block.previousElementSibling : block.nextElementSibling;
    if (sibling && sibling.matches('.subheading-block')) {
      dir === 'up' ? block.parentNode.insertBefore(block, sibling) : block.parentNode.insertBefore(sibling, block);
    }
    return;
  }
});

// Auto-fill slug from title for new subjects
form.name.addEventListener('input', () => {
  if (!isEditing && !form.key.dataset.edited) {
    form.key.value = slugify(form.name.value);
  }
});
form.key.addEventListener('input', () => {
  form.key.dataset.edited = 'yes';
});

// ── Views Switching ──

function showList() {
  form.hidden = true;
  $('#listView').hidden = false;
  $('#newSubject').hidden = false;
  $('#backToList').hidden = true;
  $('#pageTitle').textContent = 'Core CS Subject Material';
  $('#pageIntro').textContent = 'Add, update, and manage subjects, headings, modules, and learning notes for student roadmaps.';
  isEditing = false;
  currentKey = null;
  loadSubjects();
}

function showForm(subject = null) {
  isEditing = Boolean(subject && subject.key);
  currentKey = subject ? subject.key : null;

  $('#listView').hidden = true;
  form.hidden = false;
  $('#newSubject').hidden = true;
  $('#backToList').hidden = false;
  $('#pageTitle').textContent = isEditing ? `Edit Subject: ${subject.name}` : 'Add New Subject';
  $('#pageIntro').textContent = isEditing ? 'Edit subject information, chapters, and markdown explanations below.' : 'Create a new core computer science subject track.';

  form.reset();
  form.key.dataset.edited = isEditing ? 'yes' : '';
  $('#headingsContainer').innerHTML = '';

  if (subject) {
    form.name.value = subject.name || '';
    form.key.value = subject.key || '';
    form.key.disabled = true; // Key identifies document in Mongo
    form.subtitle.value = subject.subtitle || '';
    form.icon.value = subject.icon || '◫';
    form.order.value = typeof subject.order === 'number' ? subject.order : 0;

    if (Array.isArray(subject.headings)) {
      subject.headings.forEach(h => {
        $('#headingsContainer').appendChild(createHeadingElement(h));
      });
    }
  } else {
    form.key.disabled = false;
    form.icon.value = '◫';
    form.order.value = '0';
    // Add one starter heading block
    $('#headingsContainer').appendChild(createHeadingElement());
  }

  say('', false);
}

$('#newSubject').addEventListener('click', () => showForm());
$('#backToList').addEventListener('click', showList);
$('#cancel').addEventListener('click', showList);

// ── Load All Subjects ──

async function loadSubjects() {
  try {
    const search = ($('#search').value || '').trim().toLowerCase();
    const data = await request('/api/roadmaps');
    
    // Convert dictionary format to array
    subjectsList = Object.entries(data || {}).map(([key, val]) => ({
      key,
      name: val.name,
      subtitle: val.subtitle,
      icon: val.icon,
      order: val.order ?? 0,
      headings: val.headings || []
    }));

    let filtered = subjectsList;
    if (search) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(search) || s.key.toLowerCase().includes(search)
      );
    }

    const tbody = $('#subjectRows');
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#8893a6;">${search ? 'No matching subjects found.' : 'No subjects available. Click "+ New Subject" to add one.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(s => {
      const headingCount = (s.headings || []).length;
      let topicCount = 0;
      (s.headings || []).forEach(h => topicCount += (h.subheadings || []).length);

      return `
        <tr>
          <td>
            <div style="width:34px;height:34px;border-radius:8px;background:#f3f1ff;color:#5b47c2;display:grid;place-items:center;font-size:16px;">
              ${escapeHtml(s.icon || '◫')}
            </div>
          </td>
          <td>
            <b>${escapeHtml(s.name)}</b>
            <br><small style="color:#718098;">${escapeHtml(s.subtitle || '')}</small>
          </td>
          <td>
            <code style="font-size:11px;background:#f0efff;color:#4f40b6;padding:2px 6px;border-radius:4px;">${escapeHtml(s.key)}</code>
          </td>
          <td>
            <span class="admin-pill">${headingCount} headings</span>
            <span class="admin-pill" style="margin-left:4px;background:#e0f2fe;color:#0369a1;">${topicCount} topics</span>
          </td>
          <td style="text-align: right;">
            <button data-edit="${escapeHtml(s.key)}">Edit</button>
            <button data-delete="${escapeHtml(s.key)}" class="btn-danger" style="margin-left:6px;">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    say(err.message);
  }
}

$('#search').addEventListener('input', loadSubjects);

// Row action buttons
$('#subjectRows').addEventListener('click', async (e) => {
  const editKey = e.target.dataset.edit;
  const deleteKey = e.target.dataset.delete;

  if (deleteKey) {
    if (confirm(`Are you sure you want to permanently delete subject '${deleteKey}' and all its study material?`)) {
      try {
        await request(`/api/admin/subjects/${encodeURIComponent(deleteKey)}`, {
          method: 'DELETE'
        });
        say(`Subject '${deleteKey}' deleted successfully.`, false);
        loadSubjects();
      } catch (err) {
        say(err.message);
      }
    }
    return;
  }

  if (editKey) {
    try {
      const data = await request(`/api/admin/subjects/${encodeURIComponent(editKey)}`);
      showForm(data.subject);
    } catch (err) {
      say(err.message);
    }
  }
});

// ── Form Submission ──

function collectHeadings() {
  const headingBlocks = [...$('#headingsContainer').children];
  return headingBlocks.map(hb => {
    const titleInput = hb.querySelector('[data-field="heading-title"]');
    const textInput = hb.querySelector('[data-field="heading-text"]');
    const subContainer = hb.querySelector('.subheadings-container');

    const subheadings = [...subContainer.children].map(sb => {
      const subTitleInput = sb.querySelector('[data-field="subheading-title"]');
      const subTextInput = sb.querySelector('[data-field="subheading-text"]');
      return {
        title: subTitleInput ? subTitleInput.value.trim() : '',
        text: subTextInput ? subTextInput.value.trim() : ''
      };
    }).filter(s => Boolean(s.title));

    return {
      title: titleInput ? titleInput.value.trim() : '',
      text: textInput ? textInput.value.trim() : '',
      subheadings
    };
  }).filter(h => Boolean(h.title));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#saveButton');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }
  say('', false);

  const keyVal = slugify(form.key.value);
  const headings = collectHeadings();

  const payload = {
    key: keyVal,
    name: form.name.value.trim(),
    subtitle: form.subtitle.value.trim(),
    icon: form.icon.value.trim() || '◫',
    order: Number(form.order.value) || 0,
    headings
  };

  try {
    await request('/api/admin/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    say(`Subject '${payload.name}' saved successfully!`, false);
    showList();
  } catch (err) {
    say(err.message || 'Unable to save subject material.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Subject Material';
    }
  }
});

// Init on load - strictly admin only
(async () => {
  try {
    const me = await request('/api/auth/me');
    if (!me?.user?.isAdmin) {
      window.location.replace('/dashboard.html');
      return;
    }
    loadSubjects();
  } catch (err) {
    window.location.replace('/dashboard.html');
  }
})();
