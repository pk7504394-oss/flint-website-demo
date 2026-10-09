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

// Initialize Hash & Auth Listeners on Load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initAuthListener();
    handleUrlHashNavigation();
  });
  window.addEventListener('hashchange', handleUrlHashNavigation);
}

async function handleUrlHashNavigation() {
  const hash = window.location.hash;
  if (hash === '#admin-login' || hash === '#admin-setup' || hash === '#admin-dashboard') {
    const targetView = hash.replace('#admin-', '');
    await openAdminView(targetView);
  }
}

function initAuthListener() {
  if (!supabaseClient) return;
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log('FLINT Auth Event:', event);
    if (event === 'SIGNED_IN' && session?.user) {
      currentAdminUser = session.user;
      const isAdmin = await verifyAdminUser(session.user);
      if (isAdmin) {
        if (window.location.hash.startsWith('#admin')) {
          showSubView('dashboard');
          loadInquiries();
        }
      } else {
        await supabaseClient.auth.signOut();
        currentAdminUser = null;
        showAdminAlert('⛔ Access Denied: User account is not an authorized FLINT Admin.', 'error');
        showSubView('login');
      }
    } else if (event === 'SIGNED_OUT') {
      currentAdminUser = null;
      allInquiries = [];
      filteredInquiries = [];
      if (window.location.hash.startsWith('#admin')) {
        showSubView('login');
      }
    }
  });
}

// 1. One-Time Setup Check
async function checkAdminSetupStatus() {
  if (!supabaseClient) return false;
  try {
    const { data, error } = await supabaseClient.from('admin_profiles').select('id').limit(1);
    if (!error && data && data.length > 0) {
      isAdminSetupCompleted = true;
      return true;
    }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user && (session.user.email === 'pk7504395@gmail.com' || session.user.user_metadata?.role === 'admin')) {
      isAdminSetupCompleted = true;
      return true;
    }
  } catch (err) {
    console.warn('Check admin profiles warning:', err);
  }
  isAdminSetupCompleted = false;
  return false;
}

// Verify User's Admin Credentials
async function verifyAdminUser(user) {
  if (!user) return false;

  // Primary: Recognized FLINT Master Administrator email or admin role metadata
  if (user.email === 'pk7504395@gmail.com' || user.user_metadata?.role === 'admin') {
    if (supabaseClient) {
      try {
        await supabaseClient.from('admin_profiles').upsert([{
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || 'Master Administrator',
          role: 'admin'
        }], { onConflict: 'id' });
      } catch (err) {
        console.warn('Admin profile upsert notice:', err);
      }
    }
    isAdminSetupCompleted = true;
    return true;
  }

  // Secondary: Query admin_profiles table
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('admin_profiles').select('id').eq('id', user.id).maybeSingle();
      if (!error && data) {
        isAdminSetupCompleted = true;
        return true;
      }
      
      // Auto-heal fallback: If no admin_profiles record exists yet, bind this user as initial admin
      const { data: allProfiles } = await supabaseClient.from('admin_profiles').select('id').limit(1);
      if (!allProfiles || allProfiles.length === 0) {
        await supabaseClient.from('admin_profiles').insert([{
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || 'FLINT Admin',
          role: 'admin'
        }]);
        isAdminSetupCompleted = true;
        return true;
      }
    } catch (err) {
      console.warn('Verify admin user exception:', err);
    }
  }

  return false;
}

// 2. Open Admin Navigation Handler
window.openAdminView = async function(viewName = 'login') {
  const adminApp = document.getElementById('adminApp');
  if (!adminApp) return;

  adminApp.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // 1. Check existing session
  if (supabaseClient) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      const isAdmin = await verifyAdminUser(session.user);
      if (isAdmin) {
        currentAdminUser = session.user;
        showSubView('dashboard');
        loadInquiries();
        return;
      }
    }
  }

  // 2. Check setup status
  const setupDone = await checkAdminSetupStatus();

  if (viewName === 'setup') {
    if (setupDone) {
      showAdminAlert('⚠️ Admin setup is already completed. Please log in with your credentials.', 'warning');
      showSubView('login');
    } else {
      showAdminAlert('ℹ️ Welcome to FLINT Admin Setup. Create your initial admin account.', 'info');
      showSubView('setup');
    }
  } else if (viewName === 'dashboard') {
    showAdminAlert('🔒 Please log in to access the FLINT Admin Dashboard.', 'error');
    showSubView('login');
  } else {
    if (!setupDone) {
      showAdminAlert('ℹ️ No admin account found. Please complete the Initial Admin Setup first.', 'info');
      showSubView('setup');
    } else {
      showSubView('login');
    }
  }
};

window.closeAdminView = function() {
  const adminApp = document.getElementById('adminApp');
  if (adminApp) adminApp.classList.add('hidden');
  document.body.style.overflow = '';
  if (window.location.hash.startsWith('#admin')) {
    history.pushState("", document.title, window.location.pathname + window.location.search);
  }
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
  alertBox.classList.remove('hidden', 'bg-red-500/20', 'border-red-500', 'text-red-300', 'bg-emerald-500/20', 'border-emerald-500', 'text-emerald-300', 'bg-champagne-gold/20', 'border-champagne-gold', 'text-champagne-light');

  if (type === 'error') {
    alertBox.classList.add('bg-red-500/20', 'border-red-500', 'text-red-300');
  } else if (type === 'success') {
    alertBox.classList.add('bg-emerald-500/20', 'border-emerald-500', 'text-emerald-300');
  } else if (type === 'warning') {
    alertBox.classList.add('bg-amber-500/20', 'border-amber-500', 'text-amber-200');
  } else {
    alertBox.classList.add('bg-champagne-gold/20', 'border-champagne-gold', 'text-champagne-light');
  }
  alertBox.innerHTML = message;
}

// 3. ONE-TIME ADMIN SETUP HANDLER
window.handleAdminSetup = async function(e) {
  e.preventDefault();
  const name = document.getElementById('setupAdminName').value.trim();
  const rawEmail = document.getElementById('setupAdminEmail').value;
  const password = document.getElementById('setupAdminPassword').value;
  const confirmPassword = document.getElementById('setupConfirmPassword').value;

  const cleanEmail = String(rawEmail)
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

  if (!cleanEmail || !password || !name) {
    showAdminAlert('Please fill in all setup fields.', 'error');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    showAdminAlert(`⚠️ Invalid Email Format: '${cleanEmail}'. Please enter a valid email address.`, 'error');
    return;
  }

  if (password !== confirmPassword) {
    showAdminAlert('Passwords do not match. Please re-enter.', 'error');
    return;
  }
  if (password.length < 6) {
    showAdminAlert('Password must be at least 6 characters long.', 'error');
    return;
  }

  const alreadyDone = await checkAdminSetupStatus();
  if (alreadyDone) {
    showAdminAlert('⛔ Setup Locked: An admin account already exists. Only 1 admin account is allowed. <button onclick="showSubView(\'login\')" class="underline font-bold ml-2">Go to Login</button>', 'warning');
    setTimeout(() => showSubView('login'), 2000);
    return;
  }

  showAdminAlert('⏳ Creating initial FLINT Admin Account in Supabase...', 'info');

  try {
    const redirectUrl = typeof window !== 'undefined' ? (window.location.origin + '/#admin-login') : undefined;

    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email: cleanEmail,
      password: password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: name, role: 'admin' }
      }
    });

    if (authError) {
      console.warn('Supabase signUp error details:', authError);
      
      if (authError.message?.toLowerCase().includes('rate limit')) {
        showAdminAlert(`⛔ Rate Limit Notice: ${authError.message}. If you have already created your account, please <button onclick="showSubView('login')" class="underline font-bold">click here to Log In</button>.`, 'error');
      } else if (authError.message?.toLowerCase().includes('already registered') || authError.message?.toLowerCase().includes('already exists')) {
        showAdminAlert(`⚠️ Account Already Exists: An account with '${cleanEmail}' is already registered in Supabase. <button onclick="showSubView('login')" class="underline font-bold">Click here to Log In</button>.`, 'warning');
      } else {
        showAdminAlert(`❌ Account Creation Failed: ${authError.message}`, 'error');
      }
      return;
    }

    const user = authData.user;
    if (user) {
      const { error: profileErr } = await supabaseClient.from('admin_profiles').insert([{
        id: user.id,
        email: cleanEmail,
        full_name: name,
        role: 'admin'
      }]);
      if (profileErr) {
        console.warn('Admin profile insertion notice:', profileErr);
      }
    }

    isAdminSetupCompleted = true;

    if (!authData.session) {
      showAdminAlert('✓ Admin Account Created! If email confirmation is enabled in your Supabase project, check your email inbox to confirm, then <button onclick="showSubView(\'login\')" class="underline font-bold">Log In</button>.', 'success');
    } else {
      currentAdminUser = authData.user;
      showAdminAlert('✓ Admin Account Successfully Created! Loading Dashboard...', 'success');
      setTimeout(() => {
        showSubView('dashboard');
        loadInquiries();
      }, 1000);
    }
  } catch (err) {
    showAdminAlert(`❌ Setup Exception: ${err.message}`, 'error');
  }
};

// 4. ADMIN LOGIN HANDLER
window.handleAdminLogin = async function(e) {
  e.preventDefault();
  const rawEmail = document.getElementById('loginAdminEmail').value;
  const password = document.getElementById('loginAdminPassword').value;

  const cleanEmail = String(rawEmail)
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

  if (!cleanEmail || !password) {
    showAdminAlert('Please enter both email and password.', 'error');
    return;
  }

  showAdminAlert('⏳ Authenticating with Supabase Auth...', 'info');

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: cleanEmail,
      password: password
    });

    if (error) {
      console.warn('Supabase Login error:', error);
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        showAdminAlert(`⚠️ Email Not Confirmed: Account '${cleanEmail}' requires confirmation. Please run the SQL confirmation script in your Supabase Dashboard SQL Editor to mark it confirmed.`, 'warning');
      } else {
        showAdminAlert(`❌ Login Failed: ${error.message}`, 'error');
      }
      return;
    }

    if (data.user) {
      // Ensure admin profile exists in admin_profiles table
      await verifyAdminUser(data.user);

      currentAdminUser = data.user;
      isAdminSetupCompleted = true;
      showAdminAlert('✓ Authentication Successful! Redirecting to FLINT Dashboard...', 'success');

      setTimeout(() => {
        showSubView('dashboard');
        loadInquiries();
      }, 800);
    }
  } catch (err) {
    showAdminAlert(`❌ Authentication Error: ${err.message}`, 'error');
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
    tableContainer.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-ivory-muted"><span class="animate-pulse">Loading real inquiries from Supabase database...</span></td></tr>';
  }

  let inquiriesData = [];
  let fetchError = null;

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        fetchError = error.message || JSON.stringify(error);
        console.warn('Inquiries fetch error:', error);
        
        // Fallback: 'appointments' table
        const { data: apptData, error: apptError } = await supabaseClient
          .from('appointments')
          .select('*')
          .order('created_at', { ascending: false });

        if (!apptError && apptData) {
          inquiriesData = apptData;
          fetchError = null;
        }
      } else if (data) {
        inquiriesData = data;
      }
    } catch (err) {
      fetchError = err.message;
      console.warn('Inquiries fetch exception:', err);
    }
  } else {
    fetchError = 'Supabase client not initialized.';
  }

  if (fetchError) {
    showAdminAlert(`⚠️ Database Query Notice: ${fetchError}. (Ensure the <code>inquiries</code> table is created in Supabase SQL Editor).`, 'warning');
  }

  allInquiries = inquiriesData.map(item => ({
    id: item.id || Math.random().toString(36).substring(2),
    full_name: item.full_name || item.name || 'Anonymous Customer',
    org_name: item.org_name || 'Individual / Practice',
    email: item.email || item.emailAddr || 'N/A',
    phone: item.phone || item.phoneNumber || 'N/A',
    project_type: item.project_type || item.projectType || 'Corporate Workspace',
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

closeInquiryModal = function() {
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

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeInquiryModal();
  }
});
