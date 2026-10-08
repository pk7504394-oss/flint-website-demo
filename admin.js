// =========================================================================
// FLINT ADMIN PANEL & INQUIRY MANAGEMENT ENGINE
// Supabase Auth + RLS + One-Time Setup + Inquiry Management
// =========================================================================

const SUPABASE_PROJECT_ID = 'kjncgruwubukuizrszjs';
const SUPABASE_URL = 'https://kjncgruwubukuizrszjs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_WonWtBPtkXVTzIWTt8ut3A_cYsGb8jM';

let supabaseClient = null;
try {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (err) {
  console.warn('Supabase SDK initialization warning:', err);
}

// In-Memory Admin State
let currentAdminUser = null;
let allInquiries = [];
let filteredInquiries = [];
let currentInquiryDetail = null;
let currentPage = 1;
const itemsPerPage = 8;
let isAdminSetupCompleted = false;

// 1. One-Time Setup Check
async function checkAdminSetupStatus() {
  if (!supabaseClient) return false;
  try {
    const { data, error } = await supabaseClient.from('admin_profiles').select('id').limit(1);
    if (!error && data && data.length > 0) {
      isAdminSetupCompleted = true;
      return true;
    }
  } catch (err) {
    console.warn('Check admin profiles warning:', err);
  }
  return false;
}

// 2. Open Admin Navigation Handler
window.openAdminView = async function(viewName = 'login') {
  const adminApp = document.getElementById('adminApp');
  if (!adminApp) return;

  adminApp.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Check auth session
  if (supabaseClient) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      currentAdminUser = session.user;
      showSubView('dashboard');
      loadInquiries();
      return;
    }
  }

  // Check if one-time setup already done
  await checkAdminSetupStatus();

  if (viewName === 'setup') {
    if (isAdminSetupCompleted) {
      showAdminAlert('Admin setup is already completed. Redirecting to Login...', 'warning');
      setTimeout(() => showSubView('login'), 1500);
      return;
    }
    showSubView('setup');
  } else {
    showSubView('login');
  }
};

window.closeAdminView = function() {
  const adminApp = document.getElementById('adminApp');
  if (adminApp) adminApp.classList.add('hidden');
  document.body.style.overflow = '';
};

function showSubView(viewName) {
  const loginView = document.getElementById('adminLoginView');
  const setupView = document.getElementById('adminSetupView');
  const dashboardView = document.getElementById('adminDashboardView');
  const setupNoticeLink = document.getElementById('setupNoticeLink');

  if (loginView) loginView.classList.add('hidden');
  if (setupView) setupView.classList.add('hidden');
  if (dashboardView) dashboardView.classList.add('hidden');

  if (setupNoticeLink) {
    if (isAdminSetupCompleted) {
      setupNoticeLink.classList.add('hidden');
    } else {
      setupNoticeLink.classList.remove('hidden');
    }
  }

  if (viewName === 'dashboard') {
    if (dashboardView) dashboardView.classList.remove('hidden');
  } else if (viewName === 'setup') {
    if (setupView) setupView.classList.remove('hidden');
  } else {
    if (loginView) loginView.classList.remove('hidden');
  }
}

function showAdminAlert(message, type = 'info') {
  const alertBox = document.getElementById('adminAlertBox');
  if (!alertBox) return;
  alertBox.classList.remove('hidden', 'bg-red-500/20', 'border-red-500', 'bg-emerald-500/20', 'border-emerald-500', 'bg-champagne-gold/20', 'border-champagne-gold');

  if (type === 'error') {
    alertBox.classList.add('bg-red-500/20', 'border-red-500', 'text-red-300');
  } else if (type === 'success') {
    alertBox.classList.add('bg-emerald-500/20', 'border-emerald-500', 'text-emerald-300');
  } else {
    alertBox.classList.add('bg-champagne-gold/20', 'border-champagne-gold', 'text-champagne-light');
  }
  alertBox.innerHTML = message;
}

// 3. ONE-TIME ADMIN SETUP HANDLER
window.handleAdminSetup = async function(e) {
  e.preventDefault();
  const name = document.getElementById('setupAdminName').value.trim();
  const email = document.getElementById('setupAdminEmail').value.trim();
  const password = document.getElementById('setupAdminPassword').value;
  const confirmPassword = document.getElementById('setupConfirmPassword').value;

  if (password !== confirmPassword) {
    showAdminAlert('Passwords do not match. Please re-enter passwords.', 'error');
    return;
  }
  if (password.length < 6) {
    showAdminAlert('Password must be at least 6 characters long.', 'error');
    return;
  }

  // Double check setup status
  const alreadyDone = await checkAdminSetupStatus();
  if (alreadyDone) {
    showAdminAlert('One-time setup has already been completed. Account creation disabled.', 'error');
    setTimeout(() => showSubView('login'), 1500);
    return;
  }

  showAdminAlert('⏳ Creating initial FLINT Admin Account...', 'info');

  try {
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, role: 'admin' }
      }
    });

    if (authError) {
      showAdminAlert(`Setup Failed: ${authError.message}`, 'error');
      return;
    }

    const userId = authData.user ? authData.user.id : null;
    if (userId) {
      // Create admin profile entry to block future setups
      await supabaseClient.from('admin_profiles').insert([{
        id: userId,
        email: email,
        full_name: name,
        role: 'admin'
      }]);
    }

    isAdminSetupCompleted = true;
    currentAdminUser = authData.user;
    showAdminAlert('✓ Admin Account Created! Logging into FLINT Admin Dashboard...', 'success');
    
    setTimeout(() => {
      showSubView('dashboard');
      loadInquiries();
    }, 1200);
  } catch (err) {
    showAdminAlert(`Setup Error: ${err.message}`, 'error');
  }
};

// 4. ADMIN LOGIN HANDLER
window.handleAdminLogin = async function(e) {
  e.preventDefault();
  const email = document.getElementById('loginAdminEmail').value.trim();
  const password = document.getElementById('loginAdminPassword').value;

  showAdminAlert('⏳ Authenticating Admin Credentials...', 'info');

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showAdminAlert(`Login Failed: ${error.message}`, 'error');
      return;
    }

    currentAdminUser = data.user;
    showAdminAlert('✓ Login Successful! Loading Admin Dashboard...', 'success');

    setTimeout(() => {
      showSubView('dashboard');
      loadInquiries();
    }, 1000);
  } catch (err) {
    showAdminAlert(`Authentication Error: ${err.message}`, 'error');
  }
};

// 5. ADMIN LOGOUT HANDLER
window.handleAdminLogout = async function() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  currentAdminUser = null;
  allInquiries = [];
  filteredInquiries = [];
  showSubView('login');
  showAdminAlert('Logged out successfully.', 'info');
};

// 6. FETCH & MANAGE INQUIRIES FROM SUPABASE
window.loadInquiries = async function() {
  const tableContainer = document.getElementById('inquiriesTableBody');
  if (tableContainer) {
    tableContainer.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-ivory-muted"><span class="animate-pulse">Loading inquiries from Supabase...</span></td></tr>';
  }

  let inquiriesData = [];

  if (supabaseClient) {
    try {
      // Primary: 'inquiries' table
      const { data, error } = await supabaseClient.from('inquiries').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        inquiriesData = data;
      } else {
        // Fallback: 'appointments' table
        const { data: apptData } = await supabaseClient.from('appointments').select('*').order('created_at', { ascending: false });
        if (apptData) inquiriesData = apptData;
      }
    } catch (err) {
      console.warn('Inquiries fetch warning:', err);
    }
  }

  allInquiries = inquiriesData.map(item => ({
    id: item.id || Math.random().toString(36).substring(2),
    full_name: item.full_name || item.name || 'Anonymous Customer',
    org_name: item.org_name || 'Individual / Practice',
    email: item.email || item.emailAddr || 'N/A',
    phone: item.phone || item.phoneNumber || 'N/A',
    project_type: item.project_type || item.projectType || 'Corporate Headquarters',
    carpet_area: item.carpet_area || item.carpetArea || 'Standard Scope',
    project_scope: item.project_scope || item.projectScope || 'No detailed scope notes provided.',
    status: item.status || 'New',
    created_at: item.created_at || new Date().toISOString()
  }));

  updateMetricCards();
  applyFiltersAndRender();
};

function updateMetricCards() {
  const totalCountEl = document.getElementById('metricTotalInquiries');
  const newCountEl = document.getElementById('metricNewInquiries');
  const inProgressCountEl = document.getElementById('metricInProgressInquiries');
  const completedCountEl = document.getElementById('metricCompletedInquiries');

  if (totalCountEl) totalCountEl.textContent = allInquiries.length;
  if (newCountEl) newCountEl.textContent = allInquiries.filter(i => i.status === 'New').length;
  if (inProgressCountEl) inProgressCountEl.textContent = allInquiries.filter(i => i.status === 'In Progress' || i.status === 'Contacted').length;
  if (completedCountEl) completedCountEl.textContent = allInquiries.filter(i => i.status === 'Completed').length;
}

window.applyFiltersAndRender = function() {
  const searchQuery = (document.getElementById('inquirySearchInput')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('inquiryStatusFilter')?.value || 'All';
  const sortOrder = document.getElementById('inquirySortSelect')?.value || 'newest';

  filteredInquiries = allInquiries.filter(item => {
    const matchesSearch = item.full_name.toLowerCase().includes(searchQuery) ||
                          item.email.toLowerCase().includes(searchQuery) ||
                          item.phone.toLowerCase().includes(searchQuery) ||
                          item.org_name.toLowerCase().includes(searchQuery) ||
                          item.project_scope.toLowerCase().includes(searchQuery);

    const matchesStatus = (statusFilter === 'All') || (item.status === statusFilter);

    return matchesSearch && matchesStatus;
  });

  if (sortOrder === 'newest') {
    filteredInquiries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else {
    filteredInquiries.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  currentPage = 1;
  renderTable();
};

function renderTable() {
  const tableBody = document.getElementById('inquiriesTableBody');
  const paginationControls = document.getElementById('paginationControls');
  if (!tableBody) return;

  if (filteredInquiries.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="p-12 text-center text-ivory-muted">
          <span class="material-symbols-outlined text-4xl block mb-2 text-champagne-gold">inbox</span>
          No inquiries found matching your filters.
        </td>
      </tr>
    `;
    if (paginationControls) paginationControls.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filteredInquiries.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filteredInquiries.slice(startIndex, startIndex + itemsPerPage);

  tableBody.innerHTML = paginatedItems.map(item => {
    const formattedDate = new Date(item.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    const formattedTime = new Date(item.created_at).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit'
    });

    let statusBadgeClass = 'bg-champagne-gold/20 text-champagne-gold border-champagne-gold/40';
    if (item.status === 'Contacted') statusBadgeClass = 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    if (item.status === 'In Progress') statusBadgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    if (item.status === 'Completed') statusBadgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    if (item.status === 'Cancelled') statusBadgeClass = 'bg-red-500/20 text-red-300 border-red-500/40';

    return `
      <tr class="border-b border-white/5 hover:bg-card-surface/60 transition-colors">
        <td class="p-4 font-spec-code-sm text-spec-code-sm text-ivory-muted">
          <div class="text-ivory-primary font-medium">${formattedDate}</div>
          <div>${formattedTime}</div>
        </td>
        <td class="p-4">
          <div class="font-headline-sm text-headline-sm text-ivory-primary font-headline-serif">${escapeHtml(item.full_name)}</div>
          <div class="text-xs text-champagne-light font-spec-code">${escapeHtml(item.org_name)}</div>
        </td>
        <td class="p-4 font-spec-code text-spec-code text-ivory-secondary">
          <div><a href="mailto:${escapeHtml(item.email)}" class="hover:text-champagne-gold">${escapeHtml(item.email)}</a></div>
          <div><a href="tel:${escapeHtml(item.phone)}" class="hover:text-champagne-gold">${escapeHtml(item.phone)}</a></div>
        </td>
        <td class="p-4 font-body-sm text-body-sm text-ivory-secondary">
          <div class="text-ivory-primary font-medium">${escapeHtml(item.project_type)}</div>
          <div class="text-xs text-ivory-muted">${escapeHtml(item.carpet_area)}</div>
        </td>
        <td class="p-4">
          <select onchange="updateInquiryStatus('${item.id}', this.value)" class="px-2.5 py-1 text-xs rounded border font-spec-code focus:outline-none cursor-pointer ${statusBadgeClass}">
            <option value="New" ${item.status === 'New' ? 'selected' : ''} class="bg-royal-black text-ivory-primary">New</option>
            <option value="Contacted" ${item.status === 'Contacted' ? 'selected' : ''} class="bg-royal-black text-ivory-primary">Contacted</option>
            <option value="In Progress" ${item.status === 'In Progress' ? 'selected' : ''} class="bg-royal-black text-ivory-primary">In Progress</option>
            <option value="Completed" ${item.status === 'Completed' ? 'selected' : ''} class="bg-royal-black text-ivory-primary">Completed</option>
            <option value="Cancelled" ${item.status === 'Cancelled' ? 'selected' : ''} class="bg-royal-black text-ivory-primary">Cancelled</option>
          </select>
        </td>
        <td class="p-4 text-right">
          <button onclick="openInquiryModal('${item.id}')" class="px-3 py-1.5 bg-card-surface border border-white/10 text-ivory-primary font-label-caps text-label-caps uppercase hover:border-champagne-gold hover:text-champagne-gold transition-colors">
            View Details
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Pagination Controls
  if (paginationControls && totalPages > 1) {
    paginationControls.innerHTML = `
      <div class="flex items-center justify-between pt-4 border-t border-white/10 font-spec-code-sm text-spec-code-sm text-ivory-muted">
        <div>Showing Page ${currentPage} of ${totalPages} (${filteredInquiries.length} Inquiries)</div>
        <div class="flex gap-2">
          <button onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''} class="px-3 py-1 bg-charcoal-monolith border border-white/10 text-ivory-primary disabled:opacity-40 hover:border-champagne-gold">Previous</button>
          <button onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''} class="px-3 py-1 bg-charcoal-monolith border border-white/10 text-ivory-primary disabled:opacity-40 hover:border-champagne-gold">Next</button>
        </div>
      </div>
    `;
  } else if (paginationControls) {
    paginationControls.innerHTML = '';
  }
}

window.changePage = function(delta) {
  currentPage += delta;
  renderTable();
};

window.updateInquiryStatus = async function(inquiryId, newStatus) {
  const target = allInquiries.find(i => i.id === inquiryId);
  if (target) {
    target.status = newStatus;
  }
  updateMetricCards();

  if (supabaseClient) {
    try {
      await supabaseClient.from('inquiries').update({ status: newStatus }).eq('id', inquiryId);
      await supabaseClient.from('appointments').update({ status: newStatus }).eq('id', inquiryId);
    } catch (err) {
      console.warn('Update inquiry status error:', err);
    }
  }
};

window.openInquiryModal = function(inquiryId) {
  const item = allInquiries.find(i => i.id === inquiryId);
  if (!item) return;

  currentInquiryDetail = item;
  const modal = document.getElementById('inquiryDetailModal');
  if (!modal) return;

  document.getElementById('detailCustomerName').textContent = item.full_name;
  document.getElementById('detailCustomerOrg').textContent = item.org_name;
  document.getElementById('detailEmail').textContent = item.email;
  document.getElementById('detailEmail').href = `mailto:${item.email}`;
  document.getElementById('detailPhone').textContent = item.phone;
  document.getElementById('detailPhone').href = `tel:${item.phone}`;
  document.getElementById('detailProjectType').textContent = item.project_type;
  document.getElementById('detailCarpetArea').textContent = item.carpet_area;
  document.getElementById('detailScopeNotes').textContent = item.project_scope;
  document.getElementById('detailCreatedAt').textContent = new Date(item.created_at).toLocaleString();

  modal.classList.remove('hidden');
};

window.closeInquiryModal = function() {
  const modal = document.getElementById('inquiryDetailModal');
  if (modal) modal.classList.add('hidden');
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Global Keyboard Handler for Esc key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeInquiryModal();
  }
});
