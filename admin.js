// ===== State =====
let data = null;

// ===== Load =====
async function loadData() {
  const res = await fetch('/api/problems');
  data = await res.json();
  document.getElementById('comp-title').value = data.title;
  renderRounds();
}

// ===== Render =====
function renderRounds() {
  const container = document.getElementById('rounds-container');
  container.innerHTML = '';

  data.rounds.forEach((round, ri) => {
    const section = document.createElement('div');
    section.className = 'admin-round';

    // Round header
    const header = document.createElement('div');
    header.className = 'admin-round-header';
    header.innerHTML = `
      <input type="text" class="admin-input round-name-input" value="${escHtml(round.name)}" data-index="${ri}">
      <button class="admin-btn admin-btn-danger round-delete-btn" data-index="${ri}">Delete Round</button>
      <button class="admin-btn round-toggle-btn" data-index="${ri}">Toggle</button>
    `;
    section.appendChild(header);

    // Problems list
    const list = document.createElement('div');
    list.className = 'admin-problem-list';
    list.id = `round-${ri}-problems`;

    round.problems.forEach((prob, pi) => {
      const row = document.createElement('div');
      row.className = 'admin-problem-row';
      row.innerHTML = `
        <span class="problem-label">${escHtml(prob.label)}</span>
        <img class="problem-thumb" src="${prob.problem}" alt="problem">
        <img class="problem-thumb" src="${prob.answer}" alt="answer">
        <button class="admin-btn problem-edit-btn" data-ri="${ri}" data-pi="${pi}">Edit</button>
        <button class="admin-btn admin-btn-danger problem-delete-btn" data-ri="${ri}" data-pi="${pi}">Delete</button>
      `;
      list.appendChild(row);
    });

    section.appendChild(list);

    // Add problem button
    const addBtn = document.createElement('button');
    addBtn.className = 'admin-btn admin-btn-secondary';
    addBtn.textContent = '+ Add Problem';
    addBtn.dataset.index = ri;
    addBtn.addEventListener('click', () => openAddModal(ri));
    section.appendChild(addBtn);

    container.appendChild(section);
  });

  // Attach events
  document.querySelectorAll('.round-name-input').forEach(input => {
    input.addEventListener('change', async () => {
      const ri = parseInt(input.dataset.index);
      await fetch(`/api/rounds/${ri}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      loadData();
    });
  });

  document.querySelectorAll('.round-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this round and all its problems?')) return;
      const ri = parseInt(btn.dataset.index);
      await fetch(`/api/rounds/${ri}`, { method: 'DELETE' });
      loadData();
    });
  });

  document.querySelectorAll('.round-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ri = parseInt(btn.dataset.index);
      const list = document.getElementById(`round-${ri}-problems`);
      list.hidden = !list.hidden;
    });
  });

  document.querySelectorAll('.problem-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openEditModal(parseInt(btn.dataset.ri), parseInt(btn.dataset.pi));
    });
  });

  document.querySelectorAll('.problem-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this problem?')) return;
      const ri = parseInt(btn.dataset.ri);
      const pi = parseInt(btn.dataset.pi);
      await fetch(`/api/rounds/${ri}/problems/${pi}`, { method: 'DELETE' });
      loadData();
    });
  });
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ===== Title =====
document.getElementById('btn-save-title').addEventListener('click', async () => {
  await fetch('/api/title', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: document.getElementById('comp-title').value }),
  });
});

// ===== Add Round =====
document.getElementById('btn-add-round').addEventListener('click', async () => {
  const name = prompt('Round name:');
  if (!name) return;
  await fetch('/api/rounds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  loadData();
});

// ===== Modal =====
function resetModal() {
  document.getElementById('modal-label').value = '';
  document.getElementById('problem-file').value = '';
  document.getElementById('answer-file').value = '';
  document.getElementById('problem-typst').value = '';
  document.getElementById('answer-typst').value = '';
  document.getElementById('problem-preview').innerHTML = '';
  document.getElementById('answer-preview').innerHTML = '';
  // Reset tabs to upload
  setTab('problem', 'upload');
  setTab('answer', 'upload');
}

function openAddModal(roundIndex) {
  resetModal();
  document.getElementById('modal-title').textContent = 'Add Problem';
  document.getElementById('modal-round-index').value = roundIndex;
  document.getElementById('modal-problem-index').value = '-1';
  document.getElementById('problem-modal').hidden = false;
}

function openEditModal(ri, pi) {
  resetModal();
  const prob = data.rounds[ri].problems[pi];
  document.getElementById('modal-title').textContent = 'Edit Problem';
  document.getElementById('modal-round-index').value = ri;
  document.getElementById('modal-problem-index').value = pi;
  document.getElementById('modal-label').value = prob.label;
  // Show current images as previews
  document.getElementById('problem-preview').innerHTML = `<img src="${prob.problem}" alt="current">`;
  document.getElementById('answer-preview').innerHTML = `<img src="${prob.answer}" alt="current">`;
  document.getElementById('problem-modal').hidden = false;
}

document.getElementById('btn-modal-cancel').addEventListener('click', () => {
  document.getElementById('problem-modal').hidden = true;
});

document.getElementById('problem-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('problem-modal')) {
    document.getElementById('problem-modal').hidden = true;
  }
});

// ===== Tab Toggle =====
function setTab(target, tab) {
  const uploadTab = document.getElementById(`${target}-upload-tab`);
  const typstTab = document.getElementById(`${target}-typst-tab`);
  uploadTab.hidden = tab !== 'upload';
  typstTab.hidden = tab !== 'typst';
  // Update active class
  document.querySelectorAll(`.tab-btn[data-target="${target}"]`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setTab(btn.dataset.target, btn.dataset.tab);
  });
});

// ===== Typst Preview =====
document.querySelectorAll('.preview-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const field = btn.dataset.field;
    const source = document.getElementById(`${field}-typst`).value;
    if (!source.trim()) return;
    btn.disabled = true;
    btn.textContent = 'Compiling...';
    try {
      const res = await fetch('/api/compile-typst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const result = await res.json();
      if (result.error) {
        document.getElementById(`${field}-preview`).innerHTML = `<pre class="compile-error">${escHtml(result.error)}</pre>`;
      } else {
        document.getElementById(`${field}-preview`).innerHTML = result.svg;
      }
    } catch (e) {
      document.getElementById(`${field}-preview`).innerHTML = `<pre class="compile-error">${escHtml(e.message)}</pre>`;
    }
    btn.disabled = false;
    btn.textContent = 'Preview';
  });
});

// ===== Save Problem =====
document.getElementById('btn-modal-save').addEventListener('click', async () => {
  const ri = parseInt(document.getElementById('modal-round-index').value);
  const pi = parseInt(document.getElementById('modal-problem-index').value);
  const isEdit = pi >= 0;

  const formData = new FormData();
  formData.append('label', document.getElementById('modal-label').value);

  // Problem field
  const problemTypst = document.getElementById('problem-typst').value;
  const problemFile = document.getElementById('problem-file').files[0];
  if (problemTypst.trim() && !document.getElementById('problem-typst-tab').hidden) {
    formData.append('problem_typst', problemTypst);
  } else if (problemFile) {
    formData.append('problem_file', problemFile);
  } else if (!isEdit) {
    alert('Please provide a problem image or Typst source.');
    return;
  }

  // Answer field
  const answerTypst = document.getElementById('answer-typst').value;
  const answerFile = document.getElementById('answer-file').files[0];
  if (answerTypst.trim() && !document.getElementById('answer-typst-tab').hidden) {
    formData.append('answer_typst', answerTypst);
  } else if (answerFile) {
    formData.append('answer_file', answerFile);
  } else if (!isEdit) {
    alert('Please provide an answer image or Typst source.');
    return;
  }

  const url = isEdit
    ? `/api/rounds/${ri}/problems/${pi}`
    : `/api/rounds/${ri}/problems`;
  const method = isEdit ? 'PUT' : 'POST';

  const saveBtn = document.getElementById('btn-modal-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const res = await fetch(url, { method, body: formData });
    const result = await res.json();
    if (result.error) {
      alert(result.error);
    } else {
      document.getElementById('problem-modal').hidden = true;
      loadData();
    }
  } catch (e) {
    alert('Save failed: ' + e.message);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Save';
});

// ===== Init =====
loadData();
