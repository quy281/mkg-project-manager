// ===================== POCKETBASE CONFIG =====================
const PB_URL = 'https://db.mkg.vn';
const PB_EMAIL = 'quy28181818@gmail.com';
const PB_PASS = '@Mkg20144';
const PREFIX = 'pm_';
const pb = new PocketBase(PB_URL);

// ===================== STATE =====================
let state = {
  projects: [],
  tasks: [],
  staff: [],
  currentProject: null,
  currentPage: 'dashboard',
};

// ===================== INIT =====================
async function init() {
  try {
    await pb.admins.authWithPassword(PB_EMAIL, PB_PASS);
    setSyncStatus(true);
  } catch (e) {
    console.warn('PB admin auth failed, trying user auth...', e);
    try {
      await pb.collection('users').authWithPassword(PB_EMAIL, PB_PASS);
      setSyncStatus(true);
    } catch (e2) {
      console.warn('PB auth failed, using localStorage fallback', e2);
      setSyncStatus(false);
    }
  }
  await loadAll();
  renderDashboard();
  setupEvents();
}

function setSyncStatus(connected) {
  const dot = document.querySelector('.sync-dot');
  const text = document.querySelector('.sync-text');
  if (connected) {
    dot.classList.add('connected');
    text.textContent = 'Đã kết nối PocketBase';
  } else {
    dot.classList.remove('connected');
    text.textContent = 'Offline — localStorage';
  }
}

function isOnline() {
  return pb.authStore.isValid;
}

// ===================== DATA LAYER =====================
async function loadAll() {
  state.projects = await loadCollection('projects');
  state.tasks = await loadCollection('tasks');
  state.staff = await loadCollection('staff');
}

async function loadCollection(name) {
  const col = PREFIX + name;
  if (isOnline()) {
    try {
      const res = await pb.collection(col).getFullList({ sort: '-created' });
      localStorage.setItem(col, JSON.stringify(res));
      return res;
    } catch (e) {
      console.warn(`Failed to load ${col} from PB`, e);
    }
  }
  const cached = localStorage.getItem(col);
  return cached ? JSON.parse(cached) : [];
}

async function createRecord(name, data) {
  const col = PREFIX + name;
  let record;
  if (isOnline()) {
    try {
      record = await pb.collection(col).create(data);
    } catch (e) {
      console.warn(`PB create failed for ${col}`, e);
      record = { ...data, id: uid(), created: new Date().toISOString(), updated: new Date().toISOString() };
    }
  } else {
    record = { ...data, id: uid(), created: new Date().toISOString(), updated: new Date().toISOString() };
  }
  const arr = state[name];
  arr.unshift(record);
  localStorage.setItem(col, JSON.stringify(arr));
  return record;
}

async function updateRecord(name, id, data) {
  const col = PREFIX + name;
  if (isOnline()) {
    try {
      await pb.collection(col).update(id, data);
    } catch (e) {
      console.warn(`PB update failed`, e);
    }
  }
  const arr = state[name];
  const idx = arr.findIndex(r => r.id === id);
  if (idx !== -1) arr[idx] = { ...arr[idx], ...data, updated: new Date().toISOString() };
  localStorage.setItem(col, JSON.stringify(arr));
}

async function deleteRecord(name, id) {
  const col = PREFIX + name;
  if (isOnline()) {
    try { await pb.collection(col).delete(id); } catch (e) { console.warn('PB delete failed', e); }
  }
  state[name] = state[name].filter(r => r.id !== id);
  localStorage.setItem(col, JSON.stringify(state[name]));
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }

// ===================== NAVIGATION =====================
function navigate(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  const titles = { dashboard: 'Dashboard', tasks: 'Task Board', staff: 'Nhân viên', project: 'Chi tiết dự án' };
  document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';

  // Toggle new project button visibility
  document.getElementById('newProjectBtn').style.display = page === 'dashboard' ? '' : 'none';

  if (page === 'dashboard') renderDashboard();
  if (page === 'tasks') renderKanban();
  if (page === 'staff') renderStaff();

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

function openProject(id) {
  state.currentProject = state.projects.find(p => p.id === id);
  if (!state.currentProject) return;
  navigate('project');
  renderProjectDetail();
}

// ===================== RENDER: DASHBOARD =====================
function renderDashboard() {
  const total = state.projects.length;
  const tasksDone = state.tasks.filter(t => t.status === 'done').length;
  const tasksPending = state.tasks.filter(t => t.status !== 'done').length;
  const activeProjects = state.projects.filter(p => p.status === 'in_progress').length;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-label">Tổng dự án</div><div class="stat-value purple">${total}</div></div>
    <div class="stat-card"><div class="stat-label">Đang thực hiện</div><div class="stat-value yellow">${activeProjects}</div></div>
    <div class="stat-card"><div class="stat-label">Task chờ xử lý</div><div class="stat-value blue">${tasksPending}</div></div>
    <div class="stat-card"><div class="stat-label">Task hoàn thành</div><div class="stat-value green">${tasksDone}</div></div>
  `;

  const filter = document.getElementById('filterStatus').value;
  let projects = state.projects;
  if (filter !== 'all') projects = projects.filter(p => p.status === filter);

  if (projects.length === 0) {
    document.getElementById('projectsGrid').innerHTML = `
      <div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">Chưa có dự án nào. Nhấn "Dự án mới" để bắt đầu!</div></div>
    `;
    return;
  }

  document.getElementById('projectsGrid').innerHTML = projects.map(p => {
    const taskCount = state.tasks.filter(t => t.project === p.id).length;
    const doneCount = state.tasks.filter(t => t.project === p.id && t.status === 'done').length;
    return `
    <div class="project-card" onclick="openProject('${p.id}')">
      <div class="project-card-title">${esc(p.name)}</div>
      <div class="project-card-desc">${esc(p.description || 'Chưa có mô tả')}</div>
      <div class="project-card-meta">
        <span class="badge badge-${p.status}">${statusLabel(p.status)}</span>
        <span class="project-card-date">${taskCount > 0 ? `${doneCount}/${taskCount} tasks` : ''} · ${fmtDate(p.created)}</span>
      </div>
    </div>`;
  }).join('');
}

// ===================== RENDER: PROJECT DETAIL =====================
function renderProjectDetail() {
  const p = state.currentProject;
  if (!p) return;

  document.getElementById('projectHeader').innerHTML = `
    <h2>${esc(p.name)}</h2>
    <p>${esc(p.description || '')}</p>
    <div class="project-header-row">
      <span class="badge badge-${p.status}">${statusLabel(p.status)}</span>
      <select class="select-input" onchange="changeProjectStatus('${p.id}', this.value)">
        <option value="planning" ${p.status === 'planning' ? 'selected' : ''}>Planning</option>
        <option value="in_progress" ${p.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
        <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>Completed</option>
      </select>
      <button class="btn btn-sm btn-outline" onclick="editProjectModal('${p.id}')">✏️ Sửa</button>
      <button class="btn btn-sm btn-danger" onclick="confirmDeleteProject('${p.id}')">🗑️ Xóa</button>
    </div>
  `;

  // Render tabs
  renderReport();
  renderMdEditor();
  renderProjectTasks();
}

async function changeProjectStatus(id, status) {
  await updateRecord('projects', id, { status });
  state.currentProject = state.projects.find(p => p.id === id);
  renderProjectDetail();
}

// ===================== RENDER: REPORT =====================
function renderReport() {
  const p = state.currentProject;
  const md = p.markdown || '';
  if (!md) {
    document.getElementById('reportContainer').innerHTML = `<div class="empty-state"><div class="empty-state-icon">📄</div><div class="empty-state-text">Chưa có nội dung Markdown. Chuyển sang tab "Markdown" để import.</div></div>`;
    return;
  }
  document.getElementById('reportContainer').innerHTML = marked.parse(md);
}

// ===================== RENDER: MD EDITOR =====================
function renderMdEditor() {
  document.getElementById('mdEditor').value = state.currentProject?.markdown || '';
}

// ===================== RENDER: PROJECT TASKS =====================
function renderProjectTasks() {
  const pid = state.currentProject?.id;
  if (!pid) return;
  const tasks = state.tasks.filter(t => t.project === pid);

  if (tasks.length === 0) {
    document.getElementById('projectTaskList').innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">Chưa có nhiệm vụ. Nhấn "Trích xuất nhiệm vụ" từ markdown hoặc thêm thủ công.</div></div>`;
    return;
  }

  document.getElementById('projectTaskList').innerHTML = tasks.map(t => `
    <div class="task-item">
      <button class="task-checkbox ${t.status}" onclick="cycleTaskStatus('${t.id}')" title="Chuyển trạng thái">${t.status === 'done' ? '✓' : t.status === 'doing' ? '◉' : ''}</button>
      <div class="task-info">
        <div class="task-title ${t.status}">${esc(t.title)}</div>
        <div class="task-meta">
          ${t.assignee ? `<span>👤 ${esc(t.assignee)}</span>` : ''}
          ${t.priority ? `<span class="badge badge-${t.priority}">${t.priority}</span>` : ''}
          ${t.deadline ? `<span>📅 ${t.deadline}</span>` : ''}
          <span style="opacity:0.5">${t.source === 'auto' ? '🤖 auto' : '✋ manual'}</span>
        </div>
      </div>
      <div class="task-item-actions">
        <button class="btn btn-sm btn-ghost" onclick="editTaskModal('${t.id}')">✏️</button>
        <button class="btn btn-sm btn-ghost" onclick="confirmDeleteTask('${t.id}')" style="color:var(--danger)">✕</button>
      </div>
    </div>
  `).join('');
}

async function cycleTaskStatus(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  const next = { todo: 'doing', doing: 'done', done: 'todo' };
  await updateRecord('tasks', id, { status: next[t.status] || 'todo' });
  renderProjectTasks();
  renderKanban();
}

// ===================== RENDER: KANBAN =====================
function renderKanban() {
  const filterProject = document.getElementById('boardFilterProject')?.value || 'all';
  const filterAssignee = document.getElementById('boardFilterAssignee')?.value || 'all';

  // Populate filter dropdowns
  const projSelect = document.getElementById('boardFilterProject');
  if (projSelect) {
    const val = projSelect.value;
    projSelect.innerHTML = `<option value="all">Tất cả dự án</option>` +
      state.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    projSelect.value = val;
  }
  const assignSelect = document.getElementById('boardFilterAssignee');
  if (assignSelect) {
    const val = assignSelect.value;
    const assignees = [...new Set(state.tasks.map(t => t.assignee).filter(Boolean))];
    assignSelect.innerHTML = `<option value="all">Tất cả nhân viên</option>` +
      assignees.map(a => `<option value="${a}">${esc(a)}</option>`).join('');
    assignSelect.value = val;
  }

  let tasks = [...state.tasks];
  if (filterProject !== 'all') tasks = tasks.filter(t => t.project === filterProject);
  if (filterAssignee !== 'all') tasks = tasks.filter(t => t.assignee === filterAssignee);

  ['todo', 'doing', 'done'].forEach(status => {
    const col = tasks.filter(t => t.status === status);
    const container = document.getElementById('cards' + cap(status));
    const count = document.getElementById('count' + cap(status));
    if (count) count.textContent = col.length;
    if (!container) return;

    container.innerHTML = col.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem">Trống</div>` :
      col.map(t => {
        const proj = state.projects.find(p => p.id === t.project);
        return `
        <div class="kanban-card" onclick="editTaskModal('${t.id}')">
          <div class="kanban-card-title">${esc(t.title)}</div>
          <div class="kanban-card-meta">
            ${proj ? `<span class="kanban-card-badge">📁 ${esc(proj.name)}</span>` : ''}
            ${t.assignee ? `<span class="kanban-card-badge">👤 ${esc(t.assignee)}</span>` : ''}
            ${t.priority ? `<span class="kanban-card-badge badge-${t.priority}">${t.priority}</span>` : ''}
            ${t.deadline ? `<span class="kanban-card-badge">📅 ${t.deadline}</span>` : ''}
          </div>
          <div class="kanban-card-actions">
            ${status !== 'todo' ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();moveTask('${t.id}','${status === 'doing' ? 'todo' : 'doing'}')">←</button>` : ''}
            ${status !== 'done' ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();moveTask('${t.id}','${status === 'todo' ? 'doing' : 'done'}')">→</button>` : ''}
          </div>
        </div>`;
      }).join('');
  });
}

async function moveTask(id, newStatus) {
  await updateRecord('tasks', id, { status: newStatus });
  renderKanban();
  if (state.currentProject) renderProjectTasks();
}

// ===================== RENDER: STAFF =====================
function renderStaff() {
  if (state.staff.length === 0) {
    document.getElementById('staffGrid').innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">Chưa có nhân viên. Nhấn "Thêm nhân viên" để bắt đầu.</div></div>`;
    return;
  }
  document.getElementById('staffGrid').innerHTML = state.staff.map(s => {
    const myTasks = state.tasks.filter(t => t.assignee === s.name);
    const done = myTasks.filter(t => t.status === 'done').length;
    return `
    <div class="staff-card">
      <div class="staff-avatar">${s.name.charAt(0).toUpperCase()}</div>
      <div class="staff-name">${esc(s.name)}</div>
      <div class="staff-role">${esc(s.role || 'Chưa gán vai trò')}</div>
      <div class="staff-stats">
        <span>📌 ${myTasks.length} tasks</span>
        <span>✅ ${done} done</span>
      </div>
      <div class="staff-actions">
        <button class="btn btn-sm btn-outline" onclick="editStaffModal('${s.id}')">✏️ Sửa</button>
        <button class="btn btn-sm btn-danger" onclick="confirmDeleteStaff('${s.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ===================== MODALS =====================
function openModal(title, bodyHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

// -- New Project
function newProjectModal() {
  openModal('Tạo dự án mới', `
    <div class="form-group"><label class="form-label">Tên dự án *</label><input class="form-input" id="f_projName" placeholder="VD: FB Ads Combo Phòng Ngủ"></div>
    <div class="form-group"><label class="form-label">Mô tả</label><textarea class="form-textarea" id="f_projDesc" placeholder="Mô tả ngắn gọn về dự án..."></textarea></div>
    <div class="form-group"><label class="form-label">Trạng thái</label><select class="form-select" id="f_projStatus"><option value="planning">Planning</option><option value="in_progress">In Progress</option></select></div>
    <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="createProject()">Tạo dự án</button></div>
  `);
}

async function createProject() {
  const name = document.getElementById('f_projName').value.trim();
  if (!name) return alert('Vui lòng nhập tên dự án!');
  await createRecord('projects', {
    name,
    description: document.getElementById('f_projDesc').value.trim(),
    status: document.getElementById('f_projStatus').value,
    markdown: ''
  });
  closeModal();
  renderDashboard();
}

function editProjectModal(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  openModal('Sửa dự án', `
    <div class="form-group"><label class="form-label">Tên dự án</label><input class="form-input" id="f_projName" value="${esc(p.name)}"></div>
    <div class="form-group"><label class="form-label">Mô tả</label><textarea class="form-textarea" id="f_projDesc">${esc(p.description || '')}</textarea></div>
    <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="saveProject('${id}')">Lưu</button></div>
  `);
}

async function saveProject(id) {
  await updateRecord('projects', id, {
    name: document.getElementById('f_projName').value.trim(),
    description: document.getElementById('f_projDesc').value.trim()
  });
  closeModal();
  state.currentProject = state.projects.find(p => p.id === id);
  renderProjectDetail();
}

async function confirmDeleteProject(id) {
  if (!confirm('Xóa dự án này và tất cả nhiệm vụ liên quan?')) return;
  // Delete related tasks
  const relatedTasks = state.tasks.filter(t => t.project === id);
  for (const t of relatedTasks) await deleteRecord('tasks', t.id);
  await deleteRecord('projects', id);
  navigate('dashboard');
}

// -- Task modals
function addTaskModal() {
  const staffOpts = state.staff.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
  openModal('Thêm nhiệm vụ', `
    <div class="form-group"><label class="form-label">Tiêu đề *</label><input class="form-input" id="f_taskTitle" placeholder="Mô tả nhiệm vụ"></div>
    <div class="form-group"><label class="form-label">Người phụ trách</label><select class="form-select" id="f_taskAssignee"><option value="">-- Chọn --</option>${staffOpts}</select></div>
    <div class="form-group"><label class="form-label">Ưu tiên</label><select class="form-select" id="f_taskPriority"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></div>
    <div class="form-group"><label class="form-label">Deadline</label><input class="form-input" type="date" id="f_taskDeadline"></div>
    <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="createTask()">Thêm</button></div>
  `);
}

async function createTask() {
  const title = document.getElementById('f_taskTitle').value.trim();
  if (!title) return alert('Vui lòng nhập tiêu đề!');
  await createRecord('tasks', {
    project: state.currentProject?.id || '',
    title,
    assignee: document.getElementById('f_taskAssignee').value,
    priority: document.getElementById('f_taskPriority').value,
    status: 'todo',
    deadline: document.getElementById('f_taskDeadline').value,
    source: 'manual'
  });
  closeModal();
  renderProjectTasks();
  renderKanban();
}

function editTaskModal(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  const staffOpts = state.staff.map(s => `<option value="${esc(s.name)}" ${t.assignee === s.name ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  openModal('Sửa nhiệm vụ', `
    <div class="form-group"><label class="form-label">Tiêu đề</label><input class="form-input" id="f_taskTitle" value="${esc(t.title)}"></div>
    <div class="form-group"><label class="form-label">Người phụ trách</label><select class="form-select" id="f_taskAssignee"><option value="">-- Chọn --</option>${staffOpts}</select></div>
    <div class="form-group"><label class="form-label">Ưu tiên</label><select class="form-select" id="f_taskPriority"><option value="medium" ${t.priority==='medium'?'selected':''}>Medium</option><option value="high" ${t.priority==='high'?'selected':''}>High</option><option value="low" ${t.priority==='low'?'selected':''}>Low</option></select></div>
    <div class="form-group"><label class="form-label">Trạng thái</label><select class="form-select" id="f_taskStatus"><option value="todo" ${t.status==='todo'?'selected':''}>To Do</option><option value="doing" ${t.status==='doing'?'selected':''}>Doing</option><option value="done" ${t.status==='done'?'selected':''}>Done</option></select></div>
    <div class="form-group"><label class="form-label">Deadline</label><input class="form-input" type="date" id="f_taskDeadline" value="${t.deadline || ''}"></div>
    <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="saveTask('${id}')">Lưu</button></div>
  `);
}

async function saveTask(id) {
  await updateRecord('tasks', id, {
    title: document.getElementById('f_taskTitle').value.trim(),
    assignee: document.getElementById('f_taskAssignee').value,
    priority: document.getElementById('f_taskPriority').value,
    status: document.getElementById('f_taskStatus').value,
    deadline: document.getElementById('f_taskDeadline').value,
  });
  closeModal();
  renderProjectTasks();
  renderKanban();
}

async function confirmDeleteTask(id) {
  if (!confirm('Xóa nhiệm vụ này?')) return;
  await deleteRecord('tasks', id);
  renderProjectTasks();
  renderKanban();
}

// -- Staff modals
function addStaffModal() {
  openModal('Thêm nhân viên', `
    <div class="form-group"><label class="form-label">Họ tên *</label><input class="form-input" id="f_staffName" placeholder="VD: Nguyễn Văn A"></div>
    <div class="form-group"><label class="form-label">Vai trò</label><input class="form-input" id="f_staffRole" placeholder="VD: Designer, Marketer"></div>
    <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="createStaff()">Thêm</button></div>
  `);
}

async function createStaff() {
  const name = document.getElementById('f_staffName').value.trim();
  if (!name) return alert('Vui lòng nhập họ tên!');
  await createRecord('staff', { name, role: document.getElementById('f_staffRole').value.trim() });
  closeModal();
  renderStaff();
}

function editStaffModal(id) {
  const s = state.staff.find(x => x.id === id);
  if (!s) return;
  openModal('Sửa nhân viên', `
    <div class="form-group"><label class="form-label">Họ tên</label><input class="form-input" id="f_staffName" value="${esc(s.name)}"></div>
    <div class="form-group"><label class="form-label">Vai trò</label><input class="form-input" id="f_staffRole" value="${esc(s.role || '')}"></div>
    <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="saveStaff('${id}')">Lưu</button></div>
  `);
}

async function saveStaff(id) {
  await updateRecord('staff', id, {
    name: document.getElementById('f_staffName').value.trim(),
    role: document.getElementById('f_staffRole').value.trim()
  });
  closeModal();
  renderStaff();
}

async function confirmDeleteStaff(id) {
  if (!confirm('Xóa nhân viên này?')) return;
  await deleteRecord('staff', id);
  renderStaff();
}

// ===================== MARKDOWN IMPORT & TASK EXTRACTION =====================
function handleMdImport(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;
    document.getElementById('mdEditor').value = content;
    await updateRecord('projects', state.currentProject.id, { markdown: content });
    state.currentProject.markdown = content;
    renderReport();
  };
  reader.readAsText(file);
}

async function saveMd() {
  const md = document.getElementById('mdEditor').value;
  await updateRecord('projects', state.currentProject.id, { markdown: md });
  state.currentProject.markdown = md;
  renderReport();
  // Visual feedback
  const btn = document.getElementById('saveMdBtn');
  btn.textContent = '✅ Đã lưu!';
  setTimeout(() => btn.textContent = '💾 Lưu Markdown', 1500);
}

async function extractTasks() {
  const md = state.currentProject?.markdown || '';
  if (!md) return alert('Chưa có nội dung markdown để trích xuất!');

  // Extract checklist items: - [ ] text  or  - [x] text
  const regex = /^[-*]\s*\[( |x|\/)\]\s+(.+)$/gm;
  const matches = [];
  let m;
  while ((m = regex.exec(md)) !== null) {
    matches.push({ done: m[1] === 'x', doing: m[1] === '/', text: m[2].trim() });
  }

  if (matches.length === 0) return alert('Không tìm thấy checklist (- [ ] ...) trong markdown!');

  // Avoid duplicates
  const existing = state.tasks.filter(t => t.project === state.currentProject.id).map(t => t.title.toLowerCase());
  let added = 0;

  for (const item of matches) {
    if (existing.includes(item.text.toLowerCase())) continue;
    await createRecord('tasks', {
      project: state.currentProject.id,
      title: item.text,
      assignee: '',
      priority: 'medium',
      status: item.done ? 'done' : item.doing ? 'doing' : 'todo',
      deadline: '',
      source: 'auto'
    });
    added++;
  }

  alert(`Đã trích xuất ${added} nhiệm vụ mới! (${matches.length - added} đã tồn tại)`);
  renderProjectTasks();
}

// ===================== PRINT REPORT =====================
function printReport() {
  const content = document.getElementById('reportContainer').innerHTML;
  const printWin = window.open('', '_blank');
  printWin.document.write(`
    <!DOCTYPE html><html><head><title>${esc(state.currentProject?.name || 'Báo cáo')} — Báo cáo</title>
    <style>
      body { font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a2e; line-height: 1.7; max-width: 800px; margin: 0 auto; }
      h1 { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
      h2 { color: #2d3748; margin-top: 28px; }
      h3 { color: #4a5568; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 0.9rem; }
      th { background: #f7fafc; font-weight: 600; }
      code { background: #edf2f7; padding: 2px 4px; border-radius: 3px; font-size: 0.85em; }
      pre { background: #1a202c; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
      pre code { background: none; color: inherit; }
      blockquote { border-left: 4px solid #6c5ce7; padding: 12px 20px; margin: 16px 0; background: #f0f0ff; }
      hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
      @media print { body { padding: 20px; } }
    </style></head><body>${content}</body></html>
  `);
  printWin.document.close();
  setTimeout(() => printWin.print(), 500);
}

// ===================== EVENT SETUP =====================
function setupEvents() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.page); });
  });

  // Mobile menu
  document.getElementById('mobileMenu').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // New project button
  document.getElementById('newProjectBtn').addEventListener('click', newProjectModal);

  // Back button
  document.getElementById('backBtn').addEventListener('click', () => navigate('dashboard'));

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // MD file import
  document.getElementById('mdFileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) handleMdImport(e.target.files[0]);
  });

  // Save MD
  document.getElementById('saveMdBtn').addEventListener('click', saveMd);

  // Extract tasks
  document.getElementById('extractTasksBtn').addEventListener('click', extractTasks);

  // Print report
  document.getElementById('printReportBtn').addEventListener('click', printReport);

  // Add task
  document.getElementById('addTaskBtn').addEventListener('click', addTaskModal);

  // Add staff
  document.getElementById('addStaffBtn').addEventListener('click', addStaffModal);

  // Filter
  document.getElementById('filterStatus').addEventListener('change', renderDashboard);

  // Kanban filters
  document.getElementById('boardFilterProject')?.addEventListener('change', renderKanban);
  document.getElementById('boardFilterAssignee')?.addEventListener('change', renderKanban);

  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Drag-drop MD on editor
  const editor = document.getElementById('mdEditor');
  editor.addEventListener('dragover', (e) => { e.preventDefault(); editor.style.borderColor = 'var(--accent)'; });
  editor.addEventListener('dragleave', () => { editor.style.borderColor = ''; });
  editor.addEventListener('drop', (e) => {
    e.preventDefault();
    editor.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file) handleMdImport(file);
  });
}

// ===================== UTILS =====================
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function statusLabel(s) {
  const m = { planning: 'Planning', in_progress: 'In Progress', completed: 'Completed' };
  return m[s] || s;
}

// ===================== START =====================
document.addEventListener('DOMContentLoaded', init);
