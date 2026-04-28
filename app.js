// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://fuvtkcpnmlnfaabqabth.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1dnRrY3BubWxuZmFhYnFhYnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzcxMTQsImV4cCI6MjA5Mjk1MzExNH0.Hir59fESWVsBb7fcJJxsUXVk9BG5W9MqXDuHgmanIr0';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Admin email - only this user sees admin panel
const ADMIN_EMAIL = 'jsantospro3@gmail.com';

const ALLERGENS = [
  { id: 'gluten',     label: 'Gluten',       emoji: '🌾' },
  { id: 'leche',      label: 'Leche',        emoji: '🥛' },
  { id: 'huevo',      label: 'Huevo',        emoji: '🥚' },
  { id: 'frutos',     label: 'Frutos secos', emoji: '🥜' },
  { id: 'cacahuete',  label: 'Cacahuete',    emoji: '🫘' },
  { id: 'soja',       label: 'Soja',         emoji: '🫱' },
  { id: 'pescado',    label: 'Pescado',      emoji: '🐟' },
  { id: 'crustaceos', label: 'Crustáceos',   emoji: '🦐' },
  { id: 'moluscos',   label: 'Moluscos',     emoji: '🦪' },
  { id: 'sesamo',     label: 'Sésamo',       emoji: '🌿' },
  { id: 'mostaza',    label: 'Mostaza',      emoji: '🌭' },
  { id: 'apio',       label: 'Apio',         emoji: '🥬' },
  { id: 'sulfitos',   label: 'Sulfitos',     emoji: '🍷' },
  { id: 'altramuz',   label: 'Altramuz',     emoji: '🌸' },
];

const CHILD_EMOJIS = ['👦','👧','🧒','👶','🦁','🐯','🐻','🦊','🐼','🐨','🦄','⭐'];

let state = {
  user: null, profile: null, children: [], activeChild: null,
  scanMode: 'label', selectedEmoji: '👦', selectedAllergens: [],
  pendingAllergenId: null, editingChildId: null, recognition: null,
  childDocs: [], // docs for the child being edited/created
  lastScanInput: null,
  lastResult: null,
  lastHistoryId: null,
  manualAlternatives: [],
  barcodeStream: null,
  barcodeTimer: null,
  lastCatalogProduct: null,
};

// ── Init ───────────────────────────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { state.user = session.user; await loadUserData(); showScreen('screenHome'); }
  else showScreen('screenAuth');

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      state.user = session.user; await loadUserData(); showScreen('screenHome');
    } else if (event === 'SIGNED_OUT') {
      state = { ...state, user: null, profile: null, children: [], activeChild: null };
      showScreen('screenAuth');
    }
  });

  renderEmojiPicker();
  renderAllergenGrid();
  document.getElementById('fileInput').addEventListener('change', handleFileInput);
  document.getElementById('fileInputGallery').addEventListener('change', handleFileInput);
  // Ajuste del banner: mostrar completo, sin recortes, también en móvil.
  const bannerStyle = document.createElement('style');
  bannerStyle.textContent = `
    .app-banner { width:100%; padding:8px 16px 0; box-sizing:border-box; }
    .app-banner-img { width:100%; height:auto; border-radius:16px; display:block; object-fit:contain; object-position:center; max-height:none; background:#06111f; }
    .app-banner--result { padding:16px 16px 0; }
  `;
  document.head.appendChild(bannerStyle);
})();

// ── Auth ───────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('tabLogin').classList.toggle('hidden', tab !== 'login');
  document.getElementById('tabRegister').classList.toggle('hidden', tab !== 'register');
  hideAuthError();
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  if (!email || !pass) return showAuthError('Completa todos los campos');
  setAuthLoading('loginBtnText', 'Entrando...');
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  setAuthLoading('loginBtnText', 'Entrar');
  if (error) showAuthError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message);
}

async function register() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPassword').value;
  if (!name || !email || !pass) return showAuthError('Completa todos los campos');
  if (pass.length < 6) return showAuthError('La contraseña debe tener al menos 6 caracteres');
  setAuthLoading('regBtnText', 'Creando cuenta...');
  const { error } = await sb.auth.signUp({ email, password: pass, options: { data: { name } } });
  setAuthLoading('regBtnText', 'Crear cuenta gratis');
  if (error) showAuthError(error.message);
  else showAuthError('✅ Cuenta creada. Puedes entrar ahora.', true);
}

async function logout() { await sb.auth.signOut(); }
function showAuthError(msg, ok=false) {
  const el = document.getElementById('authError');
  el.textContent = msg; el.style.color = ok ? 'var(--green)' : 'var(--red)';
  el.classList.remove('hidden');
}
function hideAuthError() { document.getElementById('authError').classList.add('hidden'); }
function setAuthLoading(id, text) { document.getElementById(id).textContent = text; }

// ── Load data ──────────────────────────────────────────────────────────────────
async function loadUserData() {
  const { data: profile } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
  state.profile = profile;
  const { data: children } = await sb.from('children').select('*').eq('user_id', state.user.id).order('created_at');
  state.children = children || [];
  if (state.children.length > 0 && !state.activeChild) state.activeChild = state.children[0];

  const { data: alternatives } = await sb.from('product_alternatives')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100);
  state.manualAlternatives = alternatives || [];

  // Show admin button if admin
  if (state.user.email === ADMIN_EMAIL) {
    const topbar = document.querySelector('#screenHome .topbar-right');
    if (topbar && !document.getElementById('adminBtn')) {
      const btn = document.createElement('button');
      btn.id = 'adminBtn';
      btn.className = 'topbar-btn';
      btn.title = 'Admin';
      btn.innerHTML = '⚙️';
      btn.style.fontSize = '16px';
      btn.onclick = () => { showScreen('screenAdmin'); loadAdminData(); };
      topbar.prepend(btn);
    }
  }

  renderHome(); renderProfileScreen();
}

// ── Render home ────────────────────────────────────────────────────────────────
function renderHome() {
  const inner = document.getElementById('childBarInner');
  inner.innerHTML = '';
  state.children.forEach(child => {
    const chip = document.createElement('button');
    chip.className = 'child-chip' + (state.activeChild?.id === child.id ? ' active' : '');
    chip.innerHTML = `<span class="child-chip-emoji">${child.emoji}</span>${child.name}`;
    chip.onclick = () => { state.activeChild = child; renderHome(); };
    inner.appendChild(chip);
  });
  if (state.activeChild) {
    const a = state.activeChild.allergens || [];
    document.getElementById('heroChildName').textContent = state.activeChild.name;
    document.getElementById('heroBadgeEmoji').textContent = state.activeChild.emoji;
    document.getElementById('heroAllergens').textContent = a.length ? a.map(x => x.label).join(' · ') : 'Sin alérgenos configurados';
  } else {
    document.getElementById('heroChildName').textContent = 'Añade un hijo';
    document.getElementById('heroBadgeEmoji').textContent = '👶';
    document.getElementById('heroAllergens').textContent = 'Toca + para crear un perfil';
  }
  // Sin límites durante beta — scansBar eliminado
  renderSavedProducts().catch(e => console.warn('[SafeBite] renderSavedProducts:', e.message));
}

// ── Render profile ─────────────────────────────────────────────────────────────
function renderProfileScreen() {
  if (!state.user) return;
  const name = state.profile?.name || state.user.email.split('@')[0];
  document.getElementById('profileAvatar').textContent = name[0].toUpperCase();
  document.getElementById('profileName').textContent = name;
  document.getElementById('profileEmail').textContent = state.user.email;
  document.getElementById('planLabel').textContent = `Plan ${state.profile?.plan === 'premium' ? 'PREMIUM ⭐' : 'GRATUITO'}`;

  const list = document.getElementById('profileChildrenList');
  list.innerHTML = '';
  state.children.forEach(child => {
    const card = document.createElement('div');
    card.className = 'child-profile-card';
    card.innerHTML = `
      <span class="child-profile-emoji">${child.emoji}</span>
      <div style="flex:1">
        <p class="child-profile-name">${child.name}</p>
        <p class="child-profile-allergens">${(child.allergens||[]).map(a=>a.label).join(', ')||'Sin alérgenos'}</p>
      </div>
      <button class="edit-child-btn" onclick="openEditChild('${child.id}')">✏️ Editar</button>`;
    list.appendChild(card);
  });
}

// ── Add / Edit child ───────────────────────────────────────────────────────────
function openAddChild() {
  state.editingChildId = null; state.selectedEmoji = '👦'; state.selectedAllergens = []; state.childDocs = [];
  document.getElementById('childName').value = '';
  document.getElementById('addChildTitle').textContent = 'Añadir hijo';
  document.getElementById('saveChildBtnText').textContent = 'Guardar perfil';
  document.getElementById('childError').classList.add('hidden');
  document.getElementById('childDocsList').innerHTML = '';
  renderEmojiPicker(); renderAllergenGrid(); showScreen('screenAddChild');
}

async function openEditChild(childId) {
  const child = state.children.find(c => c.id === childId);
  if (!child) return;
  state.editingChildId = childId;
  state.selectedEmoji = child.emoji;
  state.selectedAllergens = [...(child.allergens || [])];
  state.childDocs = [];
  document.getElementById('childName').value = child.name;
  document.getElementById('addChildTitle').textContent = 'Editar perfil';
  document.getElementById('saveChildBtnText').textContent = 'Guardar cambios';
  document.getElementById('childError').classList.add('hidden');
  renderEmojiPicker(); renderAllergenGrid();
  await loadChildDocs(childId);
  showScreen('screenAddChild');
}

async function loadChildDocs(childId) {
  const { data } = await sb.from('documents').select('*').eq('child_id', childId).order('created_at');
  state.childDocs = data || [];
  renderChildDocsList();
}

function renderChildDocsList() {
  const list = document.getElementById('childDocsList');
  list.innerHTML = '';
  state.childDocs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'doc-item';
    item.innerHTML = `
      <span class="doc-item-icon">📄</span>
      <span class="doc-item-name">${doc.name}</span>
      <span class="doc-item-size">${formatBytes(doc.size || 0)}</span>
      <button class="doc-item-del" onclick="deleteChildDoc('${doc.id}', '${doc.path}')" title="Eliminar">✕</button>`;
    list.appendChild(item);
  });
}

async function uploadChildDoc() {
  const input = document.getElementById('childDocInput');
  const files = Array.from(input.files);
  if (!files.length) return;

  // Need childId — if creating new, save child first
  let childId = state.editingChildId;
  if (!childId) {
    const name = document.getElementById('childName').value.trim();
    if (!name) { document.getElementById('childError').textContent = 'Guarda el perfil del hijo antes de subir documentos'; document.getElementById('childError').classList.remove('hidden'); return; }
    const { data, error } = await sb.from('children').insert({ user_id: state.user.id, name, emoji: state.selectedEmoji, allergens: state.selectedAllergens }).select().single();
    if (error) return;
    state.editingChildId = data.id; childId = data.id;
    state.children.push(data); state.activeChild = data;
  }

  const list = document.getElementById('childDocsList');
  for (const file of files) {
    const uploading = document.createElement('p');
    uploading.className = 'doc-uploading'; uploading.textContent = `Subiendo ${file.name}...`;
    list.appendChild(uploading);

    const path = `children/${childId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await sb.storage.from('documents').upload(path, file);
    list.removeChild(uploading);
    if (upErr) { alert('Error subiendo: ' + upErr.message); continue; }

    const { data } = await sb.from('documents').insert({
      user_id: state.user.id, child_id: childId,
      name: file.name, path, size: file.size, type: 'child'
    }).select().single();
    if (data) state.childDocs.push(data);
  }
  renderChildDocsList();
  input.value = '';
}

async function deleteChildDoc(docId, path) {
  if (!confirm('¿Eliminar este documento?')) return;
  await sb.storage.from('documents').remove([path]);
  await sb.from('documents').delete().eq('id', docId);
  state.childDocs = state.childDocs.filter(d => d.id !== docId);
  renderChildDocsList();
}

function renderEmojiPicker() {
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = '';
  CHILD_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-option' + (emoji === state.selectedEmoji ? ' selected' : '');
    btn.textContent = emoji;
    btn.onclick = () => { state.selectedEmoji = emoji; document.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); };
    grid.appendChild(btn);
  });
}

function renderAllergenGrid() {
  const grid = document.getElementById('allergenGrid');
  grid.innerHTML = '';
  ALLERGENS.forEach(a => {
    const sel = state.selectedAllergens.find(x => x.id === a.id);
    const chip = document.createElement('button');
    chip.className = 'allergen-chip' + (sel ? ' selected' : '');
    const sE = sel?.severity === 'leve' ? '🟡' : sel?.severity === 'moderada' ? '🟠' : sel?.severity === 'grave' ? '🔴' : '';
    chip.innerHTML = `<span class="allergen-chip-name">${a.emoji} ${a.label}</span>${sel ? `<span class="allergen-chip-severity">${sE} ${sel.severity}</span>` : ''}`;
    chip.onclick = () => {
      if (sel) { state.selectedAllergens = state.selectedAllergens.filter(x => x.id !== a.id); renderAllergenGrid(); }
      else { state.pendingAllergenId = a.id; openSeverityModal(a.label); }
    };
    grid.appendChild(chip);
  });
}

function openSeverityModal(name) { document.getElementById('modalAllergenName').textContent = name; document.getElementById('severityModal').classList.remove('hidden'); }
function closeSeverityModal() { document.getElementById('severityModal').classList.add('hidden'); state.pendingAllergenId = null; }
function selectSeverity(severity) {
  const a = ALLERGENS.find(x => x.id === state.pendingAllergenId);
  if (a) state.selectedAllergens.push({ ...a, severity });
  closeSeverityModal(); renderAllergenGrid();
}

async function saveChild() {
  const name = document.getElementById('childName').value.trim();
  if (!name) { document.getElementById('childError').textContent = 'El nombre es obligatorio'; document.getElementById('childError').classList.remove('hidden'); return; }
  const payload = { name, emoji: state.selectedEmoji, allergens: state.selectedAllergens };

  if (state.editingChildId) {
    const { data, error } = await sb.from('children').update(payload).eq('id', state.editingChildId).select().single();
    if (error) { document.getElementById('childError').textContent = 'Error: ' + error.message; document.getElementById('childError').classList.remove('hidden'); return; }
    const idx = state.children.findIndex(c => c.id === state.editingChildId);
    if (idx !== -1) state.children[idx] = data;
    if (state.activeChild?.id === state.editingChildId) state.activeChild = data;
  } else {
    const { data, error } = await sb.from('children').insert({ user_id: state.user.id, ...payload }).select().single();
    if (error) { document.getElementById('childError').textContent = 'Error: ' + error.message; document.getElementById('childError').classList.remove('hidden'); return; }
    state.children.push(data); state.activeChild = data;
  }

  state.selectedAllergens = []; state.selectedEmoji = '👦'; state.editingChildId = null; state.childDocs = [];
  document.getElementById('childName').value = '';
  document.getElementById('childError').classList.add('hidden');
  renderHome(); renderProfileScreen(); showScreen('screenHome');
}

// ── Admin ──────────────────────────────────────────────────────────────────────
async function loadAdminData() {
  if (state.user?.email !== ADMIN_EMAIL) return;

  const { count: usersCount } = await sb.from('profiles').select('*', { count: 'exact', head: true });
  const { count: scansCount } = await sb.from('scans').select('*', { count: 'exact', head: true });
  const { count: childrenCount } = await sb.from('children').select('*', { count: 'exact', head: true });
  document.getElementById('statUsers').textContent = usersCount || 0;
  document.getElementById('statScans').textContent = scansCount || 0;
  document.getElementById('statChildren').textContent = childrenCount || 0;

  await Promise.all([loadKnowledgeDocuments(), loadAllergenRules(), loadProductAlternatives(), loadRecentProducts(), loadRecentUsers()]);
}

async function loadKnowledgeDocuments() {
  let docs = [];
  const { data, error } = await sb.from('knowledge_documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (!error && data) {
    docs = data;
  } else {
    // Compatibilidad con tabla antigua "documents" si la migración aún no está aplicada.
    const old = await sb.from('documents').select('*').eq('type', 'admin').order('created_at', { ascending: false }).limit(30);
    docs = (old.data || []).map(d => ({ ...d, title: d.name, document_type: 'archivo', status: 'active', legacy: true }));
  }
  renderAdminDocs(docs);
}

function renderAdminDocs(docs) {
  const list = document.getElementById('adminDocsList');
  if (!list) return;
  list.innerHTML = '';
  if (!docs.length) {
    list.innerHTML = '<p class="empty-state compact">Todavía no hay documentación experta cargada.</p>';
    return;
  }
  docs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'doc-item knowledge-item';
    const title = escapeHtml(doc.title || doc.name || 'Documento sin título');
    const cat = escapeHtml(doc.category || 'general');
    const status = doc.status || 'active';
    item.innerHTML = `
      <span class="doc-item-icon">📖</span>
      <span class="doc-item-name"><strong>${title}</strong><small>${cat} · ${doc.document_type || 'documento'} · ${status === 'active' ? 'activo' : 'inactivo'}</small></span>
      ${doc.legacy ? '' : `<button class="doc-item-del" onclick="toggleKnowledgeDocument('${doc.id}', '${status === 'active' ? 'archived' : 'active'}')" title="Activar/desactivar">${status === 'active' ? 'Pausar' : 'Activar'}</button>`}
      ${doc.legacy ? '' : `<button class="doc-item-del" onclick="deleteKnowledgeDocument('${doc.id}')" title="Eliminar">✕</button>`}`;
    list.appendChild(item);
  });
}

async function saveKnowledgeDocument() {
  if (state.user?.email !== ADMIN_EMAIL) return alert('Acceso no autorizado');
  const title = document.getElementById('knowledgeTitle').value.trim();
  const category = document.getElementById('knowledgeCategory').value;
  const document_type = document.getElementById('knowledgeType').value;
  let content_text = document.getElementById('knowledgeContent').value.trim();
  const file = document.getElementById('knowledgeFile').files[0];

  if (!title) return alert('Añade un título');
  if (!content_text && !file) return alert('Pega texto experto o adjunta un archivo');

  let file_path = null, file_name = null, file_size = null;

  if (file) {
    file_name = file.name;
    file_size = file.size;

    if (file.name.toLowerCase().endsWith('.txt') && !content_text) {
      content_text = await file.text();
    }

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      file_path = `admin/${Date.now()}_${safeName}`;
      const { error: upErr } = await sb.storage.from('expert-documents').upload(file_path, file, { upsert: false });
      if (upErr) console.warn('[SafeBite] Archivo no subido, se guarda texto igualmente:', upErr.message);
    } catch(e) {
      console.warn('[SafeBite] Storage no disponible:', e.message);
    }
  }

  const { error } = await sb.from('knowledge_documents').insert({
    title, category, document_type, content_text,
    file_path, file_name, file_size,
    status: 'active', priority: 10, uploaded_by: state.user.id
  });
  if (error) return alert('Error guardando documento. ¿Aplicaste la migración SQL V1.1? ' + error.message);

  document.getElementById('knowledgeTitle').value = '';
  document.getElementById('knowledgeContent').value = '';
  document.getElementById('knowledgeFile').value = '';
  await loadKnowledgeDocuments();
}

async function toggleKnowledgeDocument(id, status) {
  const { error } = await sb.from('knowledge_documents').update({ status }).eq('id', id);
  if (error) return alert(error.message);
  await loadKnowledgeDocuments();
}

async function deleteKnowledgeDocument(id) {
  if (!confirm('¿Eliminar este documento de la base experta?')) return;
  const { error } = await sb.from('knowledge_documents').delete().eq('id', id);
  if (error) return alert(error.message);
  await loadKnowledgeDocuments();
}

async function loadAllergenRules() {
  const list = document.getElementById('adminRulesList');
  if (!list) return;
  const { data, error } = await sb.from('allergen_rules')
    .select('*')
    .order('allergen', { ascending: true })
    .order('ingredient_name', { ascending: true });
  if (error) {
    list.innerHTML = '<p class="empty-state compact">Aplica la migración SQL V1.1 para activar reglas editables.</p>';
    return;
  }
  renderAllergenRules(data || []);
}

function renderAllergenRules(rules) {
  const list = document.getElementById('adminRulesList');
  list.innerHTML = '';
  if (!rules.length) {
    list.innerHTML = '<p class="empty-state compact">No hay reglas todavía.</p>';
    return;
  }
  rules.forEach(rule => {
    const item = document.createElement('div');
    item.className = 'doc-item rule-item';
    const aliases = Array.isArray(rule.aliases) ? rule.aliases.join(', ') : (rule.aliases || '');
    item.innerHTML = `
      <span class="doc-item-icon">🧬</span>
      <span class="doc-item-name"><strong>${escapeHtml(rule.ingredient_name)} → ${escapeHtml(rule.allergen)}</strong><small>${escapeHtml(rule.risk_level || 'riesgo')} · ${escapeHtml(aliases || 'sin alias')}</small></span>
      <button class="doc-item-del" onclick="toggleAllergenRule('${rule.id}', '${rule.status === 'active' ? 'archived' : 'active'}')">${rule.status === 'active' ? 'Pausar' : 'Activar'}</button>
      <button class="doc-item-del" onclick="deleteAllergenRule('${rule.id}')">✕</button>`;
    list.appendChild(item);
  });
}

async function saveAllergenRule() {
  if (state.user?.email !== ADMIN_EMAIL) return alert('Acceso no autorizado');
  const ingredient_name = document.getElementById('ruleIngredient').value.trim();
  const allergen = document.getElementById('ruleAllergen').value;
  const aliasesRaw = document.getElementById('ruleAliases').value.trim();
  const risk_level = document.getElementById('ruleRisk').value;
  const explanation = document.getElementById('ruleExplanation').value.trim();

  if (!ingredient_name || !allergen) return alert('Ingrediente y alérgeno son obligatorios');
  const aliases = aliasesRaw ? aliasesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const { error } = await sb.from('allergen_rules').insert({
    ingredient_name, allergen, aliases, risk_level,
    explanation, status: 'active', created_by: state.user.id
  });
  if (error) return alert('Error guardando regla. ¿Aplicaste la migración SQL V1.1? ' + error.message);

  document.getElementById('ruleIngredient').value = '';
  document.getElementById('ruleAliases').value = '';
  document.getElementById('ruleExplanation').value = '';
  await loadAllergenRules();
}

async function toggleAllergenRule(id, status) {
  const { error } = await sb.from('allergen_rules').update({ status }).eq('id', id);
  if (error) return alert(error.message);
  await loadAllergenRules();
}

async function deleteAllergenRule(id) {
  if (!confirm('¿Eliminar esta regla?')) return;
  const { error } = await sb.from('allergen_rules').delete().eq('id', id);
  if (error) return alert(error.message);
  await loadAllergenRules();
}

async function loadRecentUsers() {
  const { data: users } = await sb.from('profiles').select('id, name, plan, scans_this_month').order('created_at', { ascending: false }).limit(10);
  renderAdminUsers(users || []);
}

function renderAdminUsers(users) {
  const list = document.getElementById('adminUsersList');
  list.innerHTML = '';
  users.forEach(u => {
    const row = document.createElement('div');
    row.className = 'admin-user-row';
    row.innerHTML = `
      <span class="admin-user-email">${escapeHtml(u.name || 'Usuario')}</span>
      <span class="admin-user-plan">${escapeHtml((u.plan || 'free').toUpperCase())}</span>
      <span class="admin-user-scans">${u.scans_this_month || 0} escaneos</span>`;
    list.appendChild(row);
  });
}

async function loadProductAlternatives() {
  const list = document.getElementById('adminAlternativesList');
  if (!list) return;
  const { data, error } = await sb.from('product_alternatives').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { list.innerHTML = '<p class="empty-state compact">Aplica la migración SQL V1.4 para activar alternativas.</p>'; return; }
  state.manualAlternatives = (data || []).filter(x => x.status === 'active');
  list.innerHTML = (data || []).map(a => '<div class="doc-item rule-item"><span class="doc-item-icon">🔁</span><span class="doc-item-name"><strong>' + escapeHtml(a.allergen || 'general') + ' · ' + escapeHtml(a.category || 'alternativa') + '</strong><small>' + escapeHtml(a.suggestion || '') + '</small></span><button class="doc-item-del" onclick="toggleProductAlternative(\'' + a.id + '\', \'' + (a.status === 'active' ? 'archived' : 'active') + '\')">' + (a.status === 'active' ? 'Pausar' : 'Activar') + '</button><button class="doc-item-del" onclick="deleteProductAlternative(\'' + a.id + '\')">✕</button></div>').join('') || '<p class="empty-state compact">Todavía no hay alternativas manuales.</p>';
}

async function saveProductAlternative() {
  if (state.user?.email !== ADMIN_EMAIL) return alert('Acceso no autorizado');
  const allergen = document.getElementById('altAllergen').value;
  const category = document.getElementById('altCategory').value.trim() || 'general';
  const trigger_text = document.getElementById('altTrigger').value.trim();
  const suggestion = document.getElementById('altSuggestion').value.trim();
  if (!suggestion) return alert('Añade una sugerencia');
  const { error } = await sb.from('product_alternatives').insert({ allergen, category, trigger_text, suggestion, status: 'active', created_by: state.user.id });
  if (error) return alert('Error guardando alternativa. ¿Aplicaste la migración SQL V1.4? ' + error.message);
  document.getElementById('altTrigger').value = '';
  document.getElementById('altSuggestion').value = '';
  await loadProductAlternatives();
}

async function toggleProductAlternative(id, status) {
  const { error } = await sb.from('product_alternatives').update({ status }).eq('id', id);
  if (error) return alert(error.message);
  await loadProductAlternatives();
}

async function deleteProductAlternative(id) {
  if (!confirm('¿Eliminar esta alternativa?')) return;
  const { error } = await sb.from('product_alternatives').delete().eq('id', id);
  if (error) return alert(error.message);
  await loadProductAlternatives();
}

async function loadRecentProducts() {
  const list = document.getElementById('adminRecentProductsList');
  if (!list) return;
  const { data, error } = await sb.from('saved_products').select('product_name,status,kind,created_at').order('created_at', { ascending: false }).limit(8);
  if (error) { list.innerHTML = '<p class="empty-state compact">Sin productos guardados todavía.</p>'; return; }
  list.innerHTML = (data || []).map(p => '<div class="admin-user-row"><span class="admin-user-email">' + escapeHtml(p.product_name) + '</span><span class="admin-user-plan">' + escapeHtml(p.kind) + '</span><span class="admin-user-scans">' + escapeHtml(p.status) + '</span></div>').join('') || '<p class="empty-state compact">Sin productos guardados todavía.</p>';
}

// Compatibilidad: función antigua para no romper botones previos si quedan cacheados.
async function uploadAdminDoc() { return saveKnowledgeDocument(); }
async function deleteAdminDoc(docId, path) { return deleteKnowledgeDocument(docId); }

// ── Scan ───────────────────────────────────────────────────────────────────────
function triggerCamera(mode) {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  state.scanMode = mode; document.getElementById('fileInput').click();
}

function triggerUpload(mode) {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  state.scanMode = mode; document.getElementById('fileInputGallery').click();
}

function showTextInput() {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  state.scanMode = 'text';
  document.getElementById('textInputArea').classList.toggle('hidden');
  document.getElementById('voiceUI').classList.add('hidden');
}

async function handleFileInput(e) {
  const file = e.target.files[0];
  if (!file) return;
  showLoading('Procesando imagen...', 'Comprimiendo para análisis');
  try {
    const dataUrl = await compressImageFromFile(file);
    const previewUrl = await toDataUrl(file);
    const meta = {
      type: modeLabel(state.scanMode),
      mode: state.scanMode,
      fileName: file.name || 'foto',
      mime: file.type || 'image/jpeg',
      previewUrl,
      createdAt: new Date().toISOString()
    };
    hideLoading();
    await analyze(dataUrl, state.scanMode, meta);
  } catch(err) {
    hideLoading();
    document.getElementById('scanStatus').textContent = '⚠️ Error al procesar imagen: ' + err.message;
  }
  e.target.value = '';
}


function showBarcodeInput() {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  state.scanMode = 'barcode';
  document.getElementById('barcodeInputArea')?.classList.toggle('hidden');
  document.getElementById('textInputArea')?.classList.add('hidden');
  document.getElementById('voiceUI')?.classList.add('hidden');
  document.getElementById('barcodeInput')?.focus();
}

async function analyzeBarcodeFromInput() {
  const code = document.getElementById('barcodeInput')?.value.trim().replace(/\D/g, '');
  if (!code || code.length < 8) return alert('Introduce un código de barras válido');
  await analyzeBarcode(code);
}

async function startBarcodeCamera() {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  state.scanMode = 'barcode';
  const area = document.getElementById('barcodeInputArea');
  const videoWrap = document.getElementById('barcodeVideoWrap');
  const video = document.getElementById('barcodeVideo');
  if (area) area.classList.remove('hidden');

  if (!('BarcodeDetector' in window)) {
    document.getElementById('barcodeStatus').textContent = 'Tu navegador no permite escanear códigos automáticamente. Escribe el número del código de barras.';
    document.getElementById('barcodeInput')?.focus();
    return;
  }

  try {
    stopBarcodeCamera();
    state.barcodeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = state.barcodeStream;
    videoWrap?.classList.remove('hidden');
    await video.play();

    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    document.getElementById('barcodeStatus').textContent = 'Apunta al código de barras. Si no lo detecta, escríbelo manualmente.';

    state.barcodeTimer = setInterval(async () => {
      try {
        const codes = await detector.detect(video);
        if (codes && codes.length) {
          const code = String(codes[0].rawValue || '').replace(/\D/g, '');
          if (code.length >= 8) {
            stopBarcodeCamera();
            document.getElementById('barcodeInput').value = code;
            await analyzeBarcode(code);
          }
        }
      } catch(e) {
        console.warn('[SafeBite] barcode detect:', e.message);
      }
    }, 700);
  } catch(e) {
    document.getElementById('barcodeStatus').textContent = 'No pude abrir la cámara. Escribe el código manualmente.';
    document.getElementById('barcodeInput')?.focus();
  }
}

function stopBarcodeCamera() {
  if (state.barcodeTimer) clearInterval(state.barcodeTimer);
  state.barcodeTimer = null;
  if (state.barcodeStream) {
    state.barcodeStream.getTracks().forEach(t => t.stop());
    state.barcodeStream = null;
  }
  const video = document.getElementById('barcodeVideo');
  if (video) video.srcObject = null;
  document.getElementById('barcodeVideoWrap')?.classList.add('hidden');
}

async function analyzeBarcode(barcode) {
  showLoading('Buscando producto...', 'Consultando Open Food Facts');
  try {
    const product = await fetchOpenFoodFactsProduct(barcode);
    const catalogId = await saveProductCatalog(product);

    const inputMeta = {
      type: 'Código de barras',
      mode: 'barcode',
      fileName: `${product.product_name || 'Producto'}${product.brand ? ' · ' + product.brand : ''}`,
      productName: product.product_name || 'Producto sin nombre',
      brand: product.brand || '',
      barcode,
      catalogProductId: catalogId,
      source: 'Open Food Facts',
      previewUrl: product.image_url || '',
      textPreview: (product.ingredients_text || '').slice(0, 650),
      createdAt: new Date().toISOString()
    };

    state.lastCatalogProduct = { ...product, id: catalogId };

    if (!product.ingredients_text || product.ingredients_text.length < 5) {
      hideLoading();
      const result = buildNoIngredientsBarcodeResult(product, inputMeta);
      result.input_preview = inputMeta;
      state.lastScanInput = inputMeta;
      showResult(result);
      saveAnalysisHistory(result).then(id => {
        state.lastHistoryId = id;
        if (state.lastResult) state.lastResult.analysis_id = id;
        saveProductRiskAssessment(result, id).catch(e => console.warn('[SafeBite] risk barcode:', e.message));
      });
      saveScan(result).catch(e => console.warn('[SafeBite] saveScan barcode:', e.message));
      incrementScans().catch(e => console.warn('[SafeBite] increment barcode:', e.message));
      return;
    }

    const textForAnalysis =
      `FUENTE: Open Food Facts\n` +
      `CÓDIGO DE BARRAS: ${barcode}\n` +
      `PRODUCTO: ${product.product_name || 'Producto sin nombre'}\n` +
      `MARCA: ${product.brand || 'No indicada'}\n` +
      `CATEGORÍA: ${product.category || 'No indicada'}\n` +
      `ALÉRGENOS DECLARADOS: ${(product.allergens_declared || []).join(', ') || 'No indicados'}\n` +
      `TRAZAS DECLARADAS: ${(product.traces_declared || []).join(', ') || 'No indicadas'}\n` +
      `INGREDIENTES:\n${product.ingredients_text}`;

    hideLoading();
    await analyze(textForAnalysis, 'text', inputMeta);
  } catch(e) {
    hideLoading();
    document.getElementById('scanStatus').textContent = '⚠️ Código de barras: ' + e.message;
  }
}

async function fetchOpenFoodFactsProduct(barcode) {
  const fields = [
    'code','product_name','product_name_es','brands','ingredients_text','ingredients_text_es',
    'allergens','allergens_tags','traces','traces_tags','image_url','image_front_url','image_ingredients_url',
    'categories','categories_tags','quantity','nutriscore_grade'
  ].join(',');
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(fields)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('No se pudo consultar Open Food Facts');
  const json = await res.json();
  if (!json || json.status !== 1 || !json.product) throw new Error('Producto no encontrado en Open Food Facts. Sube foto de etiqueta o pega ingredientes.');
  const p = json.product || {};
  const cleanTags = (arr) => Array.isArray(arr) ? arr.map(x => String(x).replace(/^..:/, '').replace(/-/g, ' ')).filter(Boolean) : [];
  const splitText = (txt) => String(txt || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    barcode,
    product_name: p.product_name_es || p.product_name || `Producto ${barcode}`,
    brand: p.brands || '',
    ingredients_text: p.ingredients_text_es || p.ingredients_text || '',
    allergens_declared: [...new Set([...cleanTags(p.allergens_tags), ...splitText(p.allergens)])],
    traces_declared: [...new Set([...cleanTags(p.traces_tags), ...splitText(p.traces)])],
    image_url: p.image_ingredients_url || p.image_front_url || p.image_url || '',
    category: p.categories || '',
    quantity: p.quantity || '',
    nutriscore: p.nutriscore_grade || '',
    source_url: `https://world.openfoodfacts.org/product/${barcode}`
  };
}

async function saveProductCatalog(product) {
  try {
    const payload = {
      barcode: product.barcode,
      product_name: product.product_name,
      brand: product.brand || null,
      ingredients_text: product.ingredients_text || null,
      allergens_declared: product.allergens_declared || [],
      traces_declared: product.traces_declared || [],
      image_url: product.image_url || null,
      category: product.category || null,
      quantity: product.quantity || null,
      nutriscore: product.nutriscore || null,
      source: 'openfoodfacts',
      source_url: product.source_url || null,
      last_checked_at: new Date().toISOString()
    };
    const { data, error } = await sb.from('product_catalog').upsert(payload, { onConflict: 'barcode' }).select('id').single();
    if (error) { console.warn('[SafeBite] product_catalog:', error.message); return null; }
    return data?.id || null;
  } catch(e) {
    console.warn('[SafeBite] saveProductCatalog:', e.message);
    return null;
  }
}

function buildNoIngredientsBarcodeResult(product, inputMeta) {
  return {
    status: 'NO VERIFICABLE',
    confidence: 'baja',
    explanation: `Encontré el producto ${product.product_name || product.barcode} en Open Food Facts, pero no hay ingredientes suficientes para decidir con seguridad para ${state.activeChild?.name || 'este perfil'}. Sube una foto de la etiqueta o pega los ingredientes.`,
    risks: ['Producto encontrado sin lista completa de ingredientes verificable'],
    hidden_allergens: [],
    traces_warning: false,
    ingredients_found: '',
    evidence: ['Open Food Facts no tiene ingredientes suficientes para este producto', 'Criterio SafeBite: sin ingredientes verificables → NO VERIFICABLE'],
    expert_source: 'openfoodfacts',
    expert_documents_used: []
  };
}

async function saveProductRiskAssessment(result, analysisId = null) {
  const input = result.input_preview || state.lastScanInput || {};
  if (!input.catalogProductId) return;
  try {
    const { error } = await sb.from('product_risk_assessments').insert({
      product_id: input.catalogProductId,
      user_id: state.user.id,
      child_id: state.activeChild?.id || null,
      analysis_id: analysisId || result.analysis_id || state.lastHistoryId || null,
      status: result.status || 'PRECAUCION',
      confidence: result.confidence || null,
      explanation: result.explanation || '',
      risks: result.risks || [],
      hidden_allergens: result.hidden_allergens || [],
      ingredients_found: result.ingredients_found || '',
      source: 'safebite'
    });
    if (error) console.warn('[SafeBite] product_risk_assessments:', error.message);
  } catch(e) {
    console.warn('[SafeBite] saveProductRiskAssessment:', e.message);
  }
}


async function analyzeText() {
  const text = document.getElementById('manualText').value.trim();
  if (!text) return;
  await analyze(text, 'text', {
    type: 'Texto manual',
    mode: 'text',
    fileName: 'Ingredientes escritos',
    textPreview: text.slice(0, 650),
    createdAt: new Date().toISOString()
  });
}

function modeLabel(mode) {
  return ({ label: 'Etiqueta / producto', menu: 'Menú / carta', plate: 'Foto de plato', barcode: 'Código de barras', text: 'Texto manual', voice: 'Voz' })[mode] || 'Análisis';
}

async function analyze(data, mode, inputMeta = null) {
  if (!checkScanLimit()) return;
  showLoading(mode === 'menu' ? 'Analizando menú...' : mode === 'plate' ? 'Revisando foto de plato...' : 'Analizando ingredientes...', 'IA con protocolos Laztan');

  const setStatus = (msg) => {
    const el = document.getElementById('scanStatus');
    if (el) el.textContent = msg;
  };

  try {
    if (mode !== 'text' && data.length > 900000) {
      throw new Error('Imagen demasiado grande. Usa la galería con una foto existente.');
    }

    // Cargar docs con timeout propio de 5s — no bloquea si Supabase tarda
    let adminDocNames = [], childDocNames = [];
    try {
      const docsTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
      const [adminRes, childRes] = await Promise.all([
        Promise.race([sb.from('documents').select('name').eq('type', 'admin').limit(5), docsTimeout]),
        state.activeChild
          ? Promise.race([sb.from('documents').select('name').eq('child_id', state.activeChild.id).limit(3), docsTimeout])
          : Promise.resolve({ data: [] })
      ]);
      adminDocNames = (adminRes?.data || []).map(d => d.name);
      childDocNames = (childRes?.data || []).map(d => d.name);
    } catch(e) {
      console.warn('[SafeBite] Docs carga fallida (no crítico):', e.message);
    }

    // Llamar a la función con timeout de 28s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);

    let res;
    try {
      res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          imageDataUrl: data,
          allergens: state.activeChild?.allergens || [],
          childName: state.activeChild?.name || 'tu hijo',
          mode,
          adminDocNames,
          childDocNames,
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Error de servidor. Inténtalo de nuevo.');
    }

    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Error en el análisis');

    // Mostrar resultado PRIMERO — guardar en segundo plano
    hideLoading();
    setStatus('');
    result.input_preview = inputMeta;
    state.lastScanInput = inputMeta;
    showResult(result);
    saveAnalysisHistory(result).then(id => { state.lastHistoryId = id; if (state.lastResult) state.lastResult.analysis_id = id; saveProductRiskAssessment(result, id).catch(e => console.warn('[SafeBite] saveProductRiskAssessment:', e.message)); }).catch(e => console.warn('[SafeBite] saveAnalysisHistory:', e.message));
    saveScan(result).catch(e => console.warn('[SafeBite] saveScan:', e.message));
    incrementScans().catch(e => console.warn('[SafeBite] incrementScans:', e.message));

  } catch (err) {
    hideLoading();
    const msg = err.name === 'AbortError'
      ? 'Sin respuesta tras 28s. Comprueba tu conexión e inténtalo de nuevo.'
      : err.message;
    setStatus('⚠️ ' + msg);
    console.error('[SafeBite] analyze error:', err);
  }
}

function checkScanLimit() {
  return true; // Sin límites durante beta
}

async function incrementScans() {
  try {
    const n = (state.profile?.scans_this_month || 0) + 1;
    await sb.from('profiles').update({ scans_this_month: n }).eq('id', state.user.id);
    if (state.profile) state.profile.scans_this_month = n;
    renderHome();
  } catch(e) {
    console.warn('[SafeBite] incrementScans error (no crítico):', e.message);
  }
}

async function saveScan(result) {
  try {
    await sb.from('scans').insert({
      user_id: state.user.id, child_id: state.activeChild?.id,
      result: `${result.input_preview?.type ? '[' + result.input_preview.type + '] ' : ''}${result.explanation || ''}`, status: result.status,
      ingredients: result.ingredients_found || '', risks: result.risks || [],
    });
  } catch(e) {
    console.warn('[SafeBite] saveScan excepción (no crítico):', e.message);
  }
}

async function saveAnalysisHistory(result) {
  try {
    const input = result.input_preview || state.lastScanInput || {};
    const cleanInput = {
      type: input.type || '',
      mode: input.mode || '',
      fileName: input.fileName || '',
      mime: input.mime || '',
      textPreview: input.textPreview || '',
      createdAt: input.createdAt || new Date().toISOString(),
      barcode: input.barcode || '',
      productName: input.productName || '',
      brand: input.brand || '',
      catalogProductId: input.catalogProductId || null,
      source: input.source || ''
    };
    const { data, error } = await sb.from('analysis_history').insert({
      user_id: state.user.id,
      child_id: state.activeChild?.id || null,
      child_name: state.activeChild?.name || null,
      input_type: cleanInput.type || modeLabel(cleanInput.mode),
      input_name: cleanInput.fileName || cleanInput.textPreview?.slice(0, 80) || 'Análisis SafeBite',
      status: result.status || 'PRECAUCION',
      confidence: result.confidence || null,
      explanation: result.explanation || '',
      risks: result.risks || [],
      hidden_allergens: result.hidden_allergens || [],
      ingredients_found: result.ingredients_found || '',
      evidence: result.evidence || [],
      expert_documents_used: result.expert_documents_used || [],
      input_preview: cleanInput,
      input_barcode: cleanInput.barcode || null,
      catalog_product_id: cleanInput.catalogProductId || null
    }).select('id').single();
    if (error) { console.warn('[SafeBite] analysis_history:', error.message); return null; }
    return data?.id || null;
  } catch(e) {
    console.warn('[SafeBite] saveAnalysisHistory excepción:', e.message);
    return null;
  }
}

// ── Show result ────────────────────────────────────────────────────────────────
function showResult(result) {
  const card = document.getElementById('resultCard');
  card.className = 'result-status-card';
  const map = {
    APTO: ['🟢','var(--green)','apto'],
    PRECAUCION: ['🟡','var(--amber)','precaucion'],
    'NO VERIFICABLE': ['⚪','var(--muted)','no-verificable']
  };
  const [icon, color, cls] = map[result.status] || ['🔴','var(--red)','no-apto'];
  card.classList.add(cls);
  document.getElementById('resultIcon').textContent = icon;
  document.getElementById('resultTitle').textContent = result.status;
  document.getElementById('resultTitle').style.color = color;
  document.getElementById('resultChild').textContent = state.activeChild ? `Perfil: ${state.activeChild.emoji} ${state.activeChild.name}` : '';
  document.getElementById('resultExplanation').textContent = result.explanation || '';
  state.lastResult = result;

  renderResultInputPreview(result.input_preview || state.lastScanInput, result.confidence);
  renderAlternatives(result);
  renderNextSteps(result);
  renderValidationBlock(result);

  const rL = document.getElementById('risksList'); rL.innerHTML = '';
  if (result.risks?.length) { result.risks.forEach(r => { const c = document.createElement('span'); c.className = 'risk-chip'; c.textContent = r; rL.appendChild(c); }); document.getElementById('risksBlock').style.display = 'block'; }
  else document.getElementById('risksBlock').style.display = 'none';

  const hL = document.getElementById('hiddenList'); hL.innerHTML = '';
  if (result.hidden_allergens?.length) { result.hidden_allergens.forEach(h => { const c = document.createElement('span'); c.className = 'hidden-chip'; c.textContent = h; hL.appendChild(c); }); document.getElementById('hiddenBlock').style.display = 'block'; }
  else document.getElementById('hiddenBlock').style.display = 'none';

  const eL = document.getElementById('evidenceList');
  if (eL) {
    eL.innerHTML = '';
    const evidence = [...(result.evidence || []), ...(result.expert_documents_used || []).map(d => `Documento activo: ${d}`)];
    if (evidence.length) {
      evidence.slice(0, 6).forEach(e => { const c = document.createElement('div'); c.className = 'evidence-item'; c.textContent = e; eL.appendChild(c); });
      document.getElementById('evidenceBlock').style.display = 'block';
    } else document.getElementById('evidenceBlock').style.display = 'none';
  }

  if (result.ingredients_found) { document.getElementById('ingredientsFound').textContent = result.ingredients_found; document.getElementById('ingredientsBlock').style.display = 'block'; }
  else document.getElementById('ingredientsBlock').style.display = 'none';

  showScreen('screenResult');
}


function renderResultInputPreview(input, confidence) {
  const block = document.getElementById('inputPreviewBlock');
  const box = document.getElementById('inputPreviewBox');
  if (!block || !box) return;
  if (!input) { block.style.display = 'none'; return; }

  const date = input.createdAt ? new Date(input.createdAt).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  const confValue = String(confidence || '').toLowerCase();
  const conf = confidence ? `<span class="confidence-chip confidence-${confValue}">Confianza ${escapeHtml(confidence)}</span>` : '';
  const productLine = input.productName ? `<div class="input-preview-product"><strong>${escapeHtml(input.productName)}</strong>${input.brand ? `<span>${escapeHtml(input.brand)}</span>` : ''}${input.barcode ? `<small>EAN: ${escapeHtml(input.barcode)}</small>` : ''}</div>` : '';
  const meta = `<div class="input-preview-meta"><strong>${escapeHtml(input.type || 'Entrada')}</strong><span>${escapeHtml(input.fileName || '')}</span><span>${date}</span>${input.source ? `<span>${escapeHtml(input.source)}</span>` : ''}${conf}</div>`;
  const media = input.previewUrl
    ? `<img src="${input.previewUrl}" alt="Imagen analizada" class="input-preview-img"/>`
    : `<div class="input-preview-text">${escapeHtml(input.textPreview || 'Texto manual analizado')}</div>`;
  box.innerHTML = `${media}${productLine}${meta}`;
  block.style.display = 'block';
}

function renderAlternatives(result) {
  const block = document.getElementById('alternativesBlock');
  const list = document.getElementById('alternativesList');
  if (!block || !list) return;
  const status = result.status || '';
  if (status === 'APTO') { block.style.display = 'none'; return; }

  const detected = [
    ...(result.hidden_allergens || []),
    ...(result.risks || [])
  ].join(' ').toLowerCase();

  const avoid = [];
  if (detected.includes('leche') || detected.includes('láct') || detected.includes('lact')) avoid.push('leche y derivados: caseína, lactosuero, proteína láctea, leche en polvo');
  if (detected.includes('gluten') || detected.includes('trigo') || detected.includes('cebada')) avoid.push('gluten: trigo, cebada, centeno, espelta, sémola, malta');
  if (detected.includes('huevo') || detected.includes('albúmina')) avoid.push('huevo y derivados: albúmina, clara, huevo en polvo');
  if (detected.includes('soja')) avoid.push('soja: lecitina de soja, proteína de soja, harina de soja');
  if (detected.includes('frutos') || detected.includes('cacahuete') || detected.includes('maní')) avoid.push('frutos secos/cacahuete: almendra, avellana, nuez, pistacho, maní');
  if (detected.includes('crust') || detected.includes('molusc') || detected.includes('pescado')) avoid.push('pescado, crustáceos o moluscos y trazas cruzadas');

  const manual = (state.manualAlternatives || []).filter(a => {
    const haystack = detected + ' ' + String(result.ingredients_found || '').toLowerCase();
    const al = String(a.allergen || '').toLowerCase();
    const trig = String(a.trigger_text || '').toLowerCase();
    return al === 'general' || (al && haystack.includes(al)) || (trig && haystack.includes(trig));
  }).slice(0, 4).map(a => 'Admin: ' + a.suggestion);

  const tips = [
    ...manual,
    'Busca una opción con etiqueta completa y alérgenos destacados en negrita.',
    avoid.length ? 'Evita productos que indiquen: ' + avoid.slice(0, 3).join(' · ') : 'Elige una alternativa con lista de ingredientes clara y sin advertencias de trazas.',
    'Prioriza productos con mención explícita “sin” el alérgeno relevante y sin contaminación cruzada para perfil grave.',
    'Si es comida preparada/restaurante, pide ficha técnica o ingredientes por escrito antes de decidir.'
  ];

  list.innerHTML = tips.map(t => '<div class="alternative-item">' + escapeHtml(t) + '</div>').join('');
  block.style.display = 'block';
}

function renderNextSteps(result) {
  const block = document.getElementById('nextStepsBlock');
  const list = document.getElementById('nextStepsList');
  if (!block || !list) return;
  const status = result.status || '';
  let steps;
  if (status === 'APTO') {
    steps = [
      'Puedes guardarlo como producto seguro para este perfil.',
      'Revisa de nuevo si cambia el envase, la receta o el lote.',
      'Mantén la etiqueta visible si lo vas a compartir con otra persona.'
    ];
  } else if (status === 'NO VERIFICABLE') {
    steps = [
      'No tomes una decisión final solo con esta imagen.',
      'Sube la etiqueta, la ficha de ingredientes o escribe la receta completa.',
      'Si es restaurante, pide información de alérgenos y contaminación cruzada.'
    ];
  } else if (status === 'PRECAUCION') {
    steps = [
      'Revisa manualmente los ingredientes detectados.',
      'Usa “Corregir / añadir ingredientes” si el OCR leyó algo mal.',
      'Si el perfil es grave, trata la duda como no apto hasta confirmar.'
    ];
  } else {
    steps = [
      'No lo uses para este perfil salvo confirmación profesional.',
      'Guárdalo como “evitar” para no repetir el análisis.',
      'Busca una alternativa sin los alérgenos o trazas detectadas.'
    ];
  }
  list.innerHTML = steps.map(t => '<div class="next-step-item">' + escapeHtml(t) + '</div>').join('');
  block.style.display = 'block';
}

async function getSavedProducts() {
  if (!state.user) return [];
  let q = sb.from('saved_products')
    .select('*')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (state.activeChild?.id) q = q.eq('child_id', state.activeChild.id);
  const { data, error } = await q;
  if (error) { console.warn('[SafeBite] getSavedProducts:', error.message); return []; }
  return data || [];
}

function currentProductName(result = state.lastResult) {
  const input = result?.input_preview || state.lastScanInput || {};
  const base = input.productName || input.fileName || input.type || result?.ingredients_found?.slice(0, 42) || 'Producto analizado';
  return String(base).replace(/\.(jpg|jpeg|png|webp|heic|pdf)$/i, '').replace(/^WhatsApp Image [^ ]+ at /i, 'Foto ');
}

async function saveCurrentProduct(kind) {
  if (!state.lastResult) return alert('No hay resultado para guardar');
  const input = state.lastResult.input_preview || state.lastScanInput || {};
  const productName = currentProductName();
  const payload = {
    user_id: state.user.id,
    child_id: state.activeChild?.id || null,
    analysis_id: state.lastResult.analysis_id || state.lastHistoryId || null,
    kind,
    product_name: productName,
    status: state.lastResult.status || '—',
    confidence: state.lastResult.confidence || null,
    explanation: state.lastResult.explanation || '',
    ingredients_found: state.lastResult.ingredients_found || '',
    risks: state.lastResult.risks || [],
    hidden_allergens: state.lastResult.hidden_allergens || [],
    input_type: input.type || modeLabel(input.mode),
    input_name: input.fileName || productName,
    barcode: input.barcode || null,
    brand: input.brand || null,
    catalog_product_id: input.catalogProductId || null
  };
  const { error } = await sb.from('saved_products').insert(payload);
  if (error) return alert('No se pudo guardar. ¿Aplicaste la migración V1.4? ' + error.message);
  await renderSavedProducts();
  alert(kind === 'safe' ? 'Guardado como producto seguro.' : kind === 'avoid' ? 'Guardado como producto a evitar.' : 'Guardado como pendiente de revisar.');
}

async function renderSavedProducts() {
  const list = document.getElementById('savedProductsList');
  if (!list) return;
  const items = await getSavedProducts();
  const visible = items.slice(0, 6);
  if (!visible.length) {
    list.innerHTML = '<p class="empty-state compact">Todavía no hay productos guardados para este perfil.</p>';
    return;
  }
  list.innerHTML = visible.map(x => {
    const icon = x.kind === 'safe' ? '⭐' : x.kind === 'avoid' ? '🚫' : '🕒';
    const cls = x.kind === 'safe' ? 'saved-safe' : x.kind === 'avoid' ? 'saved-avoid' : 'saved-pending';
    const date = x.created_at ? new Date(x.created_at).toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit' }) : '';
    return '<button class="saved-product ' + cls + '" onclick="openSavedProduct(\'' + x.id + '\')"><span>' + icon + '</span><div><strong>' + escapeHtml(x.product_name) + '</strong><small>' + escapeHtml(x.status) + ' · ' + date + '</small></div></button>';
  }).join('');
}

async function clearSavedProducts() {
  if (!confirm('¿Limpiar la lista rápida de este perfil?')) return;
  let q = sb.from('saved_products').delete().eq('user_id', state.user.id);
  if (state.activeChild?.id) q = q.eq('child_id', state.activeChild.id);
  const { error } = await q;
  if (error) return alert(error.message);
  await renderSavedProducts();
}

async function openSavedProduct(id) {
  const { data, error } = await sb.from('saved_products').select('*').eq('id', id).single();
  if (error || !data) return alert('No se pudo abrir la ficha del producto');
  renderProductDetail(data);
  showScreen('screenProduct');
}

function renderProductDetail(item) {
  const icon = item.kind === 'safe' ? '⭐' : item.kind === 'avoid' ? '🚫' : '🕒';
  const title = document.getElementById('productTitle');
  const meta = document.getElementById('productMeta');
  const body = document.getElementById('productBody');
  if (!title || !meta || !body) return;
  title.textContent = icon + ' ' + (item.product_name || 'Producto guardado');
  const date = item.created_at ? new Date(item.created_at).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  body.dataset.currentProductId = item.id;
  meta.textContent = (item.kind || 'guardado') + ' · ' + (item.status || '—') + ' · ' + date;
  const barcodeInfo = (item.barcode || item.brand) ? '<div class="detail-block"><p class="detail-label">Producto</p><p class="ingredients-text">' + escapeHtml([item.brand, item.barcode ? 'EAN ' + item.barcode : ''].filter(Boolean).join(' · ')) + '</p></div>' : '';
  body.innerHTML = barcodeInfo + '\n    <div class="detail-block"><p class="detail-label">Decisión</p><p class="ingredients-text">' + escapeHtml(item.explanation || 'Sin explicación guardada.') + '</p></div>\n    <div class="detail-block"><p class="detail-label">Ingredientes guardados</p><p class="ingredients-text">' + escapeHtml(item.ingredients_found || 'Sin ingredientes guardados.') + '</p></div>\n    <div class="detail-block"><p class="detail-label">Riesgos</p><div>' + ((item.risks || []).map(r => '<span class="risk-chip">' + escapeHtml(r) + '</span>').join('') || '<p class="empty-state compact">Sin riesgos guardados.</p>') + '</div></div>\n    <div class="result-actions-card"><button class="btn-secondary compact" onclick="copyCurrentProductDetail()">📋 Copiar ficha</button><button class="btn-secondary compact" onclick="deleteCurrentProductDetail()">🗑️ Eliminar</button></div>\n  ';
}

async function copyCurrentProductDetail() {
  const id = document.getElementById('productBody')?.dataset.currentProductId;
  if (!id) return;
  const { data } = await sb.from('saved_products').select('*').eq('id', id).single();
  if (!data) return;
  const text = `SafeBite - Producto guardado\nProducto: ${data.product_name}\nEstado: ${data.status}\nTipo: ${data.kind}\n\n${data.explanation || ''}\n\nIngredientes: ${data.ingredients_found || '—'}\nRiesgos: ${(data.risks || []).join('; ') || '—'}`;
  navigator.clipboard?.writeText(text).then(() => alert('Ficha copiada.')).catch(() => alert(text));
}

async function deleteCurrentProductDetail() {
  const id = document.getElementById('productBody')?.dataset.currentProductId;
  if (!id) return;
  if (!confirm('¿Eliminar este producto guardado?')) return;
  const { error } = await sb.from('saved_products').delete().eq('id', id);
  if (error) return alert(error.message);
  showScreen('screenHome');
  await renderSavedProducts();
}

function buildResultSummary() {
  if (!state.lastResult) return '';
  const child = state.activeChild ? `${state.activeChild.emoji} ${state.activeChild.name}` : 'Perfil';
  const input = state.lastResult.input_preview || state.lastScanInput || {};
  const barcodeLine = input.barcode ? `\nCódigo de barras: ${input.barcode}` : '';
  return `SafeBite - Resultado\nPerfil: ${child}\nProducto/entrada: ${currentProductName()}${barcodeLine}\nEstado: ${state.lastResult.status}\nConfianza: ${state.lastResult.confidence || '—'}\n\nDecisión:\n${state.lastResult.explanation || ''}\n\nRiesgos:\n${(state.lastResult.risks || []).join('; ') || 'No especificados'}\n\nAlérgenos ocultos:\n${(state.lastResult.hidden_allergens || []).join('; ') || 'No detectados'}\n\nIngredientes detectados:\n${state.lastResult.ingredients_found || '—'}`;
}

function copyResultSummary() {
  const text = buildResultSummary();
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => alert('Resumen copiado.')).catch(() => alert(text));
}

function shareResultWhatsApp() {
  const text = buildResultSummary();
  if (!text) return;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function renderValidationBlock(result) {
  const block = document.getElementById('validationBlock');
  const textarea = document.getElementById('validationIngredients');
  if (!block || !textarea) return;
  const needsValidation = ['PRECAUCION', 'NO VERIFICABLE'].includes(result.status) || String(result.confidence || '').toLowerCase() === 'baja';
  if (!needsValidation) { block.style.display = 'none'; return; }
  textarea.value = result.ingredients_found || '';
  block.style.display = 'block';
}

async function reanalyzeValidatedIngredients() {
  const text = document.getElementById('validationIngredients')?.value.trim();
  if (!text) return alert('Añade o confirma ingredientes antes de reanalizar');
  await analyze(text, 'text', {
    type: 'Texto corregido / validado',
    mode: 'text',
    fileName: 'Ingredientes validados por usuario',
    textPreview: text.slice(0, 650),
    createdAt: new Date().toISOString()
  });
}

function editLastAnalysisText() {
  const ingredients = document.getElementById('ingredientsFound')?.textContent || '';
  document.getElementById('manualText').value = ingredients;
  showScreen('screenHome');
  document.getElementById('textInputArea').classList.remove('hidden');
  document.getElementById('manualText').focus();
  document.getElementById('scanStatus').textContent = 'Corrige o completa los ingredientes y vuelve a analizar.';
}

function resetScan() {
  stopBarcodeCamera();
  document.getElementById('manualText').value = '';
  document.getElementById('textInputArea').classList.add('hidden');
  document.getElementById('barcodeInputArea')?.classList.add('hidden');
  document.getElementById('scanStatus').textContent = '';
  showScreen('screenHome');
}

// ── Voice ──────────────────────────────────────────────────────────────────────
function startVoice() {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    // Fallback: abrir modo texto con instrucciones
    document.getElementById('textInputArea').classList.remove('hidden');
    document.getElementById('manualText').placeholder = 'Dicta o escribe los ingredientes aquí...';
    document.getElementById('manualText').focus();
    return;
  }
  state.recognition = new SR();
  state.recognition.lang = 'es-ES';
  state.recognition.continuous = true;
  state.recognition.interimResults = true;
  let finalText = '';
  document.getElementById('voiceUI').classList.remove('hidden');
  document.getElementById('textInputArea').classList.add('hidden');
  document.getElementById('voiceTranscript').textContent = '';
  document.getElementById('voiceStatus').textContent = '🎤 Habla ahora — dicta los ingredientes';
  state.recognition.onresult = e => {
    let interim = '';
    finalText = '';
    for (let r of e.results) {
      if (r.isFinal) finalText += r[0].transcript + ' ';
      else interim += r[0].transcript;
    }
    document.getElementById('voiceTranscript').textContent = (finalText + interim).trim();
  };
  state.recognition.onerror = (e) => {
    console.warn('Voice error:', e.error);
    if (e.error === 'no-speech') {
      document.getElementById('voiceStatus').textContent = '⚠️ No te escucho. Habla más cerca del micrófono.';
    } else {
      stopVoice();
    }
  };
  state.recognition.onend = () => {
    // Si continuous mode termina inesperadamente, reiniciar
    if (document.getElementById('voiceUI').classList.contains('hidden') === false) {
      const t = document.getElementById('voiceTranscript').textContent.trim();
      if (t.length > 10) {
        // Hay texto suficiente — mostrar botón analizar
        document.getElementById('voiceStatus').textContent = '✅ ¿Es correcto? Pulsa Analizar';
        document.getElementById('voiceAnalyzeBtn').classList.remove('hidden');
      } else {
        try { state.recognition.start(); } catch(e) {}
      }
    }
  };
  state.recognition.start();
  document.getElementById('voiceStatus').textContent = 'Escuchando... habla ahora';
}

function stopVoice() {
  if (state.recognition) { try { state.recognition.stop(); } catch(e) {} state.recognition = null; }
  document.getElementById('voiceUI').classList.add('hidden');
  const btn = document.getElementById('voiceAnalyzeBtn');
  if (btn) btn.classList.add('hidden');
}

async function analyzeVoice() {
  const t = document.getElementById('voiceTranscript').textContent.trim();
  stopVoice();
  if (t.length > 3) {
    document.getElementById('manualText').value = t;
    document.getElementById('textInputArea').classList.remove('hidden');
    document.getElementById('scanStatus').textContent = '✏️ Revisa el texto dictado y pulsa Analizar, o corrígelo si algo está mal.';
  }
}

// ── WhatsApp ───────────────────────────────────────────────────────────────────
function contactExpert() {
  const child = state.activeChild;
  const allergens = child?.allergens?.map(a => `${a.label} (${a.severity})`).join(', ') || 'no especificados';
  const msg = encodeURIComponent(`Hola, soy usuario de SafeBite.\n\nPerfil: ${child?.name || 'mi hijo'}\nAlergias: ${allergens}\n\nTengo una consulta sobre seguridad alimentaria.`);
  window.open(`https://wa.me/34946489032?text=${msg}`, '_blank');
}

// ── History ────────────────────────────────────────────────────────────────────
async function loadHistory() {
  const list = document.getElementById('historyList');
  const filter = document.getElementById('historyFilter')?.value || 'all';
  list.innerHTML = '<p class="empty-state">Cargando...</p>';
  let q = sb.from('analysis_history').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(40);
  if (state.activeChild?.id) q = q.eq('child_id', state.activeChild.id);
  if (filter !== 'all') q = q.eq('status', filter);
  const { data: scans, error } = await q;
  if (error) {
    list.innerHTML = '<p class="empty-state">Aplica la migración V1.4 para activar el historial avanzado.</p>';
    return;
  }
  if (!scans?.length) { list.innerHTML = '<p class="empty-state">No hay análisis todavía para este filtro.</p>'; return; }
  list.innerHTML = '';
  scans.forEach(scan => {
    const icon = scan.status === 'APTO' ? '🟢' : scan.status === 'PRECAUCION' ? '🟡' : scan.status === 'NO VERIFICABLE' ? '⚪' : '🔴';
    const cls  = scan.status === 'APTO' ? 'apto' : scan.status === 'PRECAUCION' ? 'precaucion' : scan.status === 'NO VERIFICABLE' ? 'no-verificable' : 'no-apto';
    const date = new Date(scan.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const item = document.createElement('button');
    item.className = 'history-item history-clickable';
    item.onclick = () => renderHistoryDetail(scan);
    item.innerHTML = '<span class="history-icon">' + icon + '</span><div style="flex:1;min-width:0"><p class="history-status ' + cls + '">' + escapeHtml(scan.status) + '</p><p class="history-explanation">' + escapeHtml(scan.input_name || scan.explanation || 'Análisis SafeBite') + '</p><p class="history-meta">' + escapeHtml(scan.input_type || '') + ' · ' + escapeHtml(scan.confidence || '') + '</p></div><span class="history-date">' + date + '</span>';
    list.appendChild(item);
  });
}

function renderHistoryDetail(scan) {
  const detail = document.getElementById('historyDetail');
  if (!detail) return;
  detail.innerHTML = '\n    <div class="detail-block"><p class="detail-label">Análisis seleccionado</p><p class="ingredients-text"><strong>' + escapeHtml(scan.status) + '</strong> · ' + escapeHtml(scan.input_name || '') + '</p><p class="ingredients-text">' + escapeHtml(scan.explanation || '') + '</p></div>\n    <div class="detail-block"><p class="detail-label">Ingredientes</p><p class="ingredients-text">' + escapeHtml(scan.ingredients_found || 'Sin ingredientes guardados.') + '</p></div>\n    <div class="result-actions-card"><button class="btn-secondary compact" onclick="copyHistoryDetail(\'' + scan.id + '\')">📋 Copiar</button><button class="btn-secondary compact" onclick="saveHistoryAsProduct(\'' + scan.id + '\', \'safe\')">⭐ Seguro</button><button class="btn-secondary compact" onclick="saveHistoryAsProduct(\'' + scan.id + '\', \'avoid\')">🚫 Evitar</button></div>\n  ';
}

async function copyHistoryDetail(id) {
  const { data } = await sb.from('analysis_history').select('*').eq('id', id).single();
  if (!data) return;
  const text = `SafeBite - Historial\nEntrada: ${data.input_name}\nEstado: ${data.status}\nConfianza: ${data.confidence || '—'}\n\n${data.explanation || ''}\n\nIngredientes: ${data.ingredients_found || '—'}`;
  navigator.clipboard?.writeText(text).then(() => alert('Análisis copiado.')).catch(() => alert(text));
}

async function saveHistoryAsProduct(id, kind) {
  const { data } = await sb.from('analysis_history').select('*').eq('id', id).single();
  if (!data) return;
  const payload = {
    user_id: data.user_id,
    child_id: data.child_id,
    analysis_id: data.id,
    kind,
    product_name: data.input_name || 'Producto del historial',
    status: data.status,
    confidence: data.confidence,
    explanation: data.explanation,
    ingredients_found: data.ingredients_found,
    risks: data.risks || [],
    hidden_allergens: data.hidden_allergens || [],
    input_type: data.input_type,
    input_name: data.input_name,
    barcode: data.input_barcode || null,
    catalog_product_id: data.catalog_product_id || null
  };
  const { error } = await sb.from('saved_products').insert(payload);
  if (error) return alert(error.message);
  alert('Guardado en lista rápida.');
  renderSavedProducts().catch(()=>{});
}

// ── Screen routing ─────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
  const t = document.getElementById(id);
  if (t) { t.classList.remove('hidden'); t.classList.add('active'); }
  if (id === 'screenHistory') loadHistory();
  if (id === 'screenAddChild') { renderEmojiPicker(); renderAllergenGrid(); }
}

// ── Loading ────────────────────────────────────────────────────────────────────
function showLoading(text='Analizando...', sub='') {
  let o = document.getElementById('loadingOverlay');
  if (!o) { o = document.createElement('div'); o.id = 'loadingOverlay'; o.className = 'loading-overlay'; document.body.appendChild(o); }
  o.innerHTML = `<div class="loading-spinner"></div><p class="loading-text">${text}</p>${sub?`<p class="loading-sub">${sub}</p>`:''}`;
  o.classList.remove('hidden');
}
function hideLoading() { const o = document.getElementById('loadingOverlay'); if (o) o.classList.add('hidden'); }

// ── Utils ──────────────────────────────────────────────────────────────────────
function toDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('No se pudo leer')); r.readAsDataURL(file); });
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

// ── Image compression ─────────────────────────────────────────────────────────
// Comprime directamente desde File (evita cargar imagen entera en memoria en móvil)
function compressImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Máximo 600px — suficiente para OCR de etiquetas, mínimo peso
      const MAX = 600;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      } else {
        if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      // Calidad 0.6 → base64 resultante ~80-150KB, bien dentro del límite de 1MB
      let result = canvas.toDataURL('image/jpeg', 0.6);

      // Doble check: si aún supera 500KB base64, reducir más
      if (result.length > 500000) {
        const canvas2 = document.createElement('canvas');
        const scale = Math.sqrt(450000 / result.length);
        canvas2.width = Math.round(width * scale);
        canvas2.height = Math.round(height * scale);
        canvas2.getContext('2d').drawImage(img, 0, 0, canvas2.width, canvas2.height);
        result = canvas2.toDataURL('image/jpeg', 0.55);
      }

      console.log('[SafeBite] Imagen comprimida:', Math.round(result.length/1024) + 'KB base64');
      resolve(result);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')); };
    img.src = url;
  });
}

// Mantener compressImage para compatibilidad con otros usos
function compressImage(dataUrl, maxWidth = 800, quality = 0.65) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
