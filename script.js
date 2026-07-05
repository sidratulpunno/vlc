(function () {
  'use strict';

  /* ============================================================
   * State
   * ============================================================ */
  const state = {
    streams: [],
    filtered: [],
    searchQuery: '',
    activeCategory: 'All',
    isLoading: false,
    editId: null,
    confirmCallback: null,
  };

  const API_URL = CONFIG.API_URL;
  const CACHE_KEY = CONFIG.CACHE_KEY || 'vlc_cloud_launcher_streams';
  const CATEGORY_COLORS = Object.assign({
    Movies: '#E53935', Sports: '#1E88E5', Anime: '#8E24AA',
    Series: '#7E57C2', TV: '#FB8C00', Music: '#43A047', Kids: '#00ACC1',
    Live: '#F4511E', Other: '#546E7A',
  }, CONFIG.CATEGORY_COLORS || {});

  let toastTimeout = null;
  let debounceTimer = null;

  /* ============================================================
   * DOM References
   * ============================================================ */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const el = {
    streamList: $('#streamList'),
    emptyState: $('#emptyState'),
    noResultsState: $('#noResultsState'),
    streamForm: $('#streamForm'),
    streamUrl: $('#streamUrl'),
    streamName: $('#streamName'),
    streamCategory: $('#streamCategory'),
    searchInput: $('#searchInput'),
    filterBtns: () => $$('.filter-btn'),
    toastContainer: $('#toastContainer'),

    confirmModal: $('#confirmModal'),
    confirmMessage: $('#confirmMessage'),
    confirmOkBtn: $('#confirmOkBtn'),
    confirmCancelBtn: $('#confirmCancelBtn'),
    editModal: $('#editModal'),
    editForm: $('#editForm'),
    editId: $('#editId'),
    editUrl: $('#editUrl'),
    editName: $('#editName'),
    editCategory: $('#editCategory'),
    editSaveBtn: $('#editSaveBtn'),
    editCancelBtn: $('#editCancelBtn'),
    exportModal: $('#exportModal'),
    exportJsonBtn: $('#exportJsonBtn'),
    exportCsvBtn: $('#exportCsvBtn'),
    importFileInput: $('#importFileInput'),
    refreshBtn: $('#refreshBtn'),
    exportBtn: $('#exportBtn'),
    saveBtn: $('#saveBtn'),
    clearBtn: $('#clearBtn'),
    themeToggle: $('#themeToggle'),
    themeIconSun: $('#themeIconSun'),
    themeIconMoon: $('#themeIconMoon'),
    themeColorMeta: $('#themeColorMeta'),
  };

  /* ============================================================
   * Toast
   * ============================================================ */
  function showToast(message, type = 'success', duration = CONFIG.TOAST_DURATION || 3000) {
    const container = el.toastContainer;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');

    const icons = {
      success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF5350" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
      warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFB74D" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    };

    toast.innerHTML = `
      ${icons[type] || ''}
      <span>${escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;

    container.appendChild(toast);

    const close = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(16px)';
      setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector('.toast-close').addEventListener('click', close);

    setTimeout(close, duration);
  }

  /* ============================================================
   * Helpers
   * ============================================================ */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitizeUrl(url) {
    if (!url) return '';
    url = url.trim();
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:', 'rtmp:', 'rtmps:', 'mmsh:', 'mmst:'].includes(parsed.protocol)) {
        return '';
      }
      return parsed.href;
    } catch {
      return '';
    }
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const now = new Date();
      const diff = now - d;
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
      return d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  }

  function getCategoryColor(cat) {
    return CATEGORY_COLORS[cat] || '#546E7A';
  }

  function debounce(fn, delay) {
    return function (...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function getBaseUrl() {
    return window.location.origin + window.location.pathname.replace(/\/$/, '');
  }

  /* ============================================================
   * Local Cache
   * ============================================================ */
  function cacheSave(streams) {
    try {
      const data = { streams, timestamp: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      // Storage full or unavailable
    }
  }

  function cacheLoad() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.streams)) return null;
      return data;
    } catch {
      return null;
    }
  }

  function cacheClear() {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
  }

  function isCacheExpired(cache) {
    if (!cache || !cache.timestamp) return true;
    const expiry = CONFIG.CACHE_EXPIRY || 300000;
    return Date.now() - cache.timestamp > expiry;
  }

  /* ============================================================
   * API
   * ============================================================ */
  async function apiCall(endpoint, method = 'GET', body = null) {
    if (!API_URL || API_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') {
      throw new Error('API URL not configured. Update config.js with your Google Apps Script Web App URL.');
    }

    const url = API_URL + '?endpoint=' + encodeURIComponent(endpoint);

    const options = { method: 'GET' };

    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      options.method = 'POST';
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }
    return result;
  }

  async function loadStreamsFromAPI() {
    const result = await apiCall('list');
    return Array.isArray(result) ? result : (result.data || []);
  }

  async function saveStreamToAPI(stream) {
    const result = await apiCall('add', 'POST', stream);
    return result;
  }

  async function updateStreamInAPI(stream) {
    const result = await apiCall('update', 'PUT', stream);
    return result;
  }

  async function deleteStreamFromAPI(id) {
    const result = await apiCall('delete', 'DELETE', { id });
    return result;
  }

  /* ============================================================
   * Stream Operations
   * ============================================================ */
  async function loadStreams(forceRefresh = false) {
    el.streamList.innerHTML = `
      <div class="loading-skeleton" aria-hidden="true">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
    `;
    state.isLoading = true;

    try {
      if (!forceRefresh) {
        const cached = cacheLoad();
        if (cached && !isCacheExpired(cached) && Array.isArray(cached.streams) && cached.streams.length > 0) {
          state.streams = cached.streams;
          applyFilters();
          state.isLoading = false;
          if (navigator.onLine) {
            loadStreamsFromAPI().then(apiStreams => {
              if (apiStreams && apiStreams.length) {
                state.streams = apiStreams;
                cacheSave(apiStreams);
                applyFilters();
              }
            }).catch(() => {});
          }
          return;
        }
      }

      if (navigator.onLine) {
        const streams = await loadStreamsFromAPI();
        state.streams = Array.isArray(streams) ? streams : [];
        cacheSave(state.streams);
      } else {
        const cached = cacheLoad();
        state.streams = cached && Array.isArray(cached.streams) ? cached.streams : [];
        if (state.streams.length === 0) {
          showToast('Offline: No cached streams available.', 'warning');
        }
      }

      applyFilters();
    } catch (err) {
      const cached = cacheLoad();
      if (cached && Array.isArray(cached.streams)) {
        state.streams = cached.streams;
        applyFilters();
        showToast('Using cached data (offline mode).', 'warning');
      } else {
        state.streams = [];
        applyFilters();
        showToast('Failed to load streams: ' + err.message, 'error');
      }
    } finally {
      state.isLoading = false;
    }
  }

  async function saveStream(event) {
    event.preventDefault();
    const urlInput = el.streamUrl.value.trim();
    const name = el.streamName.value.trim();
    const category = el.streamCategory.value;

    if (!urlInput) {
      showToast('Please enter a stream URL.', 'error');
      el.streamUrl.focus();
      return;
    }

    const sanitized = sanitizeUrl(urlInput);
    if (!sanitized) {
      showToast('Invalid URL. Please enter a valid HTTP, HTTPS, or RTMP URL.', 'error');
      el.streamUrl.focus();
      return;
    }

    const duplicate = state.streams.some(s => s.URL === sanitized);
    if (duplicate) {
      showToast('This URL already exists in your streams.', 'warning');
      return;
    }

    const stream = {
      ID: generateId(),
      Name: name || 'Unnamed Stream',
      Category: category || 'Other',
      URL: sanitized,
      Favorite: false,
      CreatedAt: new Date().toISOString(),
    };

    const btn = el.saveBtn;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
      if (navigator.onLine) {
        await saveStreamToAPI(stream);
      }
      state.streams.unshift(stream);
      cacheSave(state.streams);
      applyFilters();
      el.streamForm.reset();
      el.streamUrl.focus();
      showToast('Stream saved successfully!', 'success');
    } catch (err) {
      state.streams.unshift(stream);
      cacheSave(state.streams);
      applyFilters();
      el.streamForm.reset();
      showToast('Saved locally. Will sync when online.', 'warning');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save';
    }
  }

  async function updateStream(event) {
    event.preventDefault();
    const id = el.editId.value;
    const url = sanitizeUrl(el.editUrl.value.trim());
    const name = el.editName.value.trim();
    const category = el.editCategory.value;

    if (!url) {
      showToast('Please enter a valid URL.', 'error');
      return;
    }

    const index = state.streams.findIndex(s => s.ID === id);
    if (index === -1) {
      showToast('Stream not found.', 'error');
      return;
    }

    const updated = {
      ...state.streams[index],
      Name: name || state.streams[index].Name,
      Category: category,
      URL: url,
    };

    try {
      if (navigator.onLine) {
        await updateStreamInAPI(updated);
      }
      state.streams[index] = updated;
      cacheSave(state.streams);
      applyFilters();
      closeEditModal();
      showToast('Stream updated!', 'success');
    } catch (err) {
      state.streams[index] = updated;
      cacheSave(state.streams);
      applyFilters();
      closeEditModal();
      showToast('Updated locally. Will sync when online.', 'warning');
    }
  }

  function deleteStream(id) {
    const stream = state.streams.find(s => s.ID === id);
    if (!stream) return;
    showConfirm(
      `Delete "${stream.Name || 'Unnamed Stream'}"?`,
      async () => {
        try {
          if (navigator.onLine) {
            await deleteStreamFromAPI(id);
          }
          state.streams = state.streams.filter(s => s.ID !== id);
          cacheSave(state.streams);
          applyFilters();
          showToast('Stream deleted.', 'success');
        } catch (err) {
          state.streams = state.streams.filter(s => s.ID !== id);
          cacheSave(state.streams);
          applyFilters();
          showToast('Deleted locally. Will sync when online.', 'warning');
        }
      }
    );
  }

  function toggleFavorite(id) {
    const stream = state.streams.find(s => s.ID === id);
    if (!stream) return;
    stream.Favorite = !stream.Favorite;
    cacheSave(state.streams);
    applyFilters();
    showToast(stream.Favorite ? 'Added to favorites.' : 'Removed from favorites.');
  }

  function openInVLC(url) {
    if (!url) {
      showToast('No URL to open.', 'error');
      return;
    }

    try {
      const isAndroid = /android/i.test(navigator.userAgent);
      const isAndroidTV = isAndroid && /tv|googletv|androidtv|AFT/i.test(navigator.userAgent);

      if (isAndroid) {
        const encodedUrl = encodeURIComponent(url);
        const intentUri = `intent://${encodedUrl}#Intent;action=android.intent.action.VIEW;package=org.videolan.vlc;type=video/*;end`;
        const fallbackUri = `vlc://${url}`;

        if (isAndroidTV) {
          window.location.href = `intent://${encodedUrl}#Intent;package=org.videolan.vlc;end`;
        } else {
          window.location.href = intentUri;
        }
        setTimeout(() => {
          window.location.href = fallbackUri;
        }, 500);
        setTimeout(() => {
          showToast(
            'Unable to launch VLC. Make sure VLC for Android is installed.',
            'error',
            4000
          );
        }, 2000);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      showToast('Invalid URL for VLC.', 'error');
    }
  }

  function copyLink(url) {
    if (!url) {
      showToast('No URL to copy.', 'error');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('URL copied to clipboard!', 'success');
      }).catch(() => {
        fallbackCopy(url);
      });
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('URL copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy URL.', 'error');
    }
    document.body.removeChild(textarea);
  }

  function shareLink(name, url) {
    if (navigator.share) {
      navigator.share({
        title: name || 'Stream',
        text: `Watch this stream: ${name || ''}`,
        url: url,
      }).catch(() => {});
    } else {
      const shareText = `${name || 'Stream'}: ${url}`;
      copyLink(shareText);
    }
  }

  /* ============================================================
   * Search & Filter
   * ============================================================ */
  function applyFilters() {
    const query = state.searchQuery.toLowerCase().trim();
    const category = state.activeCategory;

    let filtered = state.streams;

    if (category !== 'All') {
      filtered = filtered.filter(s => s.Category === category);
    }

    if (query) {
      filtered = filtered.filter(s =>
        (s.Name && s.Name.toLowerCase().includes(query)) ||
        (s.URL && s.URL.toLowerCase().includes(query)) ||
        (s.Category && s.Category.toLowerCase().includes(query))
      );
    }

    filtered = sortFavorites(filtered);

    state.filtered = filtered;
    renderStreams(filtered);
  }

  function sortFavorites(streams) {
    const favorites = streams.filter(s => s.Favorite);
    const others = streams.filter(s => !s.Favorite);
    return [...favorites, ...others];
  }

  const handleSearch = debounce(function () {
    state.searchQuery = el.searchInput.value;
    applyFilters();
  }, CONFIG.DEBOUNCE_DELAY || 300);

  function handleCategoryFilter(category) {
    state.activeCategory = category;
    el.filterBtns().forEach(btn => {
      const isActive = btn.dataset.category === category;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    applyFilters();
  }

  /* ============================================================
   * Render
   * ============================================================ */
  function renderStreams(streams) {
    const list = el.streamList;
    const isEmpty = state.streams.length === 0;
    const noResults = !isEmpty && streams.length === 0;

    el.emptyState.style.display = isEmpty ? 'flex' : 'none';
    el.noResultsState.style.display = noResults ? 'flex' : 'none';

    if (isEmpty || noResults) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = streams.map(stream => createStreamCard(stream)).join('');
  }

  function createStreamCard(stream) {
    const catColor = getCategoryColor(stream.Category);
    const favIcon = stream.Favorite
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFB74D" stroke="#FFB74D" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

    const safeUrl = encodeURIComponent(stream.URL || '');
    const safeName = encodeURIComponent(stream.Name || 'Stream');
    const safeId = encodeURIComponent(stream.ID);

    return `
      <div class="stream-card ${stream.Favorite ? 'favorite' : ''}" role="listitem" data-id="${escapeHtml(stream.ID)}">
        <div class="stream-card-header">
          <div class="stream-card-body" style="flex:1;min-width:0">
            <div class="stream-card-name">${escapeHtml(stream.Name || 'Unnamed Stream')}</div>
            <div class="stream-card-meta">
              <span class="category-badge" style="background:${catColor}">${escapeHtml(stream.Category || 'Other')}</span>
              <span class="stream-card-date">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                ${formatDate(stream.CreatedAt)}
              </span>
            </div>

          </div>
        </div>
        <div class="stream-card-footer">
          <button class="btn-open-vlc" data-action="open" data-url="${safeUrl}" aria-label="Open in VLC">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Open in VLC
          </button>
          <div class="stream-card-actions">
            <button class="btn btn-secondary btn-xs" data-action="copy" data-url="${safeUrl}" aria-label="Copy URL" title="Copy URL">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="btn btn-secondary btn-xs" data-action="edit" data-id="${safeId}" aria-label="Edit stream" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn btn-secondary btn-xs" data-action="favorite" data-id="${safeId}" aria-label="${stream.Favorite ? 'Remove from favorites' : 'Add to favorites'}" title="${stream.Favorite ? 'Unfavorite' : 'Favorite'}">
              ${favIcon}
            </button>
            <button class="btn btn-secondary btn-xs" data-action="share" data-name="${safeName}" data-url="${safeUrl}" aria-label="Share" title="Share">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </button>

            <button class="btn btn-danger btn-xs" data-action="delete" data-id="${safeId}" aria-label="Delete stream" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /* ============================================================
   * Event Delegation for Stream Actions
   * ============================================================ */
  el.streamList.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const url = decodeURIComponent(btn.dataset.url || '');
    const id = decodeURIComponent(btn.dataset.id || '');
    const name = decodeURIComponent(btn.dataset.name || 'Stream');

    switch (action) {
      case 'open': openInVLC(url); break;
      case 'copy': copyLink(url); break;
      case 'edit': editStream(id); break;
      case 'favorite': toggleFavorite(id); break;
      case 'share': shareLink(name, url); break;
      case 'delete': deleteStream(id); break;
    }
  });

  /* ============================================================
   * Edit Modal
   * ============================================================ */
  function editStream(id) {
    const stream = state.streams.find(s => s.ID === id);
    if (!stream) {
      showToast('Stream not found.', 'error');
      return;
    }

    state.editId = id;
    el.editId.value = id;
    el.editUrl.value = stream.URL || '';
    el.editName.value = stream.Name || '';
    el.editCategory.value = stream.Category || 'Other';

    const categories = ['Movies', 'Sports', 'Anime', 'Series', 'TV', 'Music', 'Kids', 'Live', 'Other'];
    el.editCategory.innerHTML = categories.map(c =>
      `<option value="${c}" ${c === stream.Category ? 'selected' : ''}>${c}</option>`
    ).join('');

    openModal(el.editModal);
    el.editUrl.focus();
  }

  function closeEditModal() {
    closeModal(el.editModal);
    state.editId = null;
  }

  /* ============================================================
   * Modal Management
   * ============================================================ */
  function openModal(modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    const focusable = modal.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) {
      focusable[0].focus();
    }

    const handler = (e) => {
      if (e.key === 'Escape') {
        closeModal(modal);
      }
      if (e.key === 'Tab') {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    modal._keyHandler = handler;
    document.addEventListener('keydown', handler);
  }

  function closeModal(modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (modal._keyHandler) {
      document.removeEventListener('keydown', modal._keyHandler);
    }
  }

  /* ============================================================
   * Confirm Dialog
   * ============================================================ */
  function showConfirm(message, callback) {
    el.confirmMessage.textContent = message;
    state.confirmCallback = callback;
    openModal(el.confirmModal);
  }

  /* ============================================================
   * Export / Import
   * ============================================================ */
  function exportJSON() {
    if (state.streams.length === 0) {
      showToast('No streams to export.', 'warning');
      return;
    }
    const data = JSON.stringify(state.streams, null, 2);
    downloadFile(data, 'vlc-cloud-streams.json', 'application/json');
    showToast('Streams exported as JSON!', 'success');
  }

  function exportCSV() {
    if (state.streams.length === 0) {
      showToast('No streams to export.', 'warning');
      return;
    }
    const headers = ['ID', 'Name', 'Category', 'URL', 'Favorite', 'CreatedAt'];
    const rows = state.streams.map(s => [
      s.ID, s.Name || '', s.Category || 'Other', s.URL, s.Favorite ? 'TRUE' : 'FALSE', s.CreatedAt
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    downloadFile(csv, 'vlc-cloud-streams.csv', 'text/csv');
    showToast('Streams exported as CSV!', 'success');
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        let imported = [];

        if (file.name.endsWith('.json')) {
          imported = JSON.parse(content);
          if (!Array.isArray(imported)) throw new Error('Invalid JSON format.');
        } else if (file.name.endsWith('.csv')) {
          const lines = content.split('\n').map(l => l.trim()).filter(l => l);
          if (lines.length < 2) throw new Error('CSV file is empty.');
          const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
          const idIdx = headers.indexOf('ID');
          const nameIdx = headers.indexOf('Name');
          const catIdx = headers.indexOf('Category');
          const urlIdx = headers.indexOf('URL');
          const favIdx = headers.indexOf('Favorite');
          const dateIdx = headers.indexOf('CreatedAt');

          for (let i = 1; i < lines.length; i++) {
            const vals = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
            const url = vals[urlIdx];
            if (!url) continue;
            imported.push({
              ID: vals[idIdx] || generateId(),
              Name: vals[nameIdx] || 'Imported Stream',
              Category: vals[catIdx] || 'Other',
              URL: url,
              Favorite: vals[favIdx]?.toUpperCase() === 'TRUE',
              CreatedAt: vals[dateIdx] || new Date().toISOString(),
            });
          }
        } else {
          throw new Error('Unsupported file format. Use .json or .csv.');
        }

        if (imported.length === 0) {
          showToast('No valid streams found in file.', 'warning');
          return;
        }

        let added = 0;
        for (const s of imported) {
          const exists = state.streams.some(ex => ex.URL === s.URL);
          if (!exists) {
            s.ID = s.ID || generateId();
            s.CreatedAt = s.CreatedAt || new Date().toISOString();
            state.streams.push(s);
            added++;
          }
        }

        if (added > 0) {
          cacheSave(state.streams);
          applyFilters();

          if (navigator.onLine) {
            for (const s of imported) {
              try { await saveStreamToAPI(s); } catch {}
            }
          }

          showToast(`Imported ${added} stream(s)!`, 'success');
        } else {
          showToast('All streams already exist. Nothing imported.', 'warning');
        }
      } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  /* ============================================================
   * Pull to Refresh
   * ============================================================ */
  (function setupPullToRefresh() {
    let startY = 0;
    let pulling = false;
    const threshold = 100;
    const main = document.querySelector('.main-content');
    let indicator = null;

    main.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    main.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      const diff = e.touches[0].clientY - startY;
      if (diff > 0 && window.scrollY === 0) {
        if (!indicator) {
          indicator = document.createElement('div');
          indicator.style.cssText = 'text-align:center;padding:12px;color:var(--accent);font-size:0.85rem;font-weight:600';
          main.insertBefore(indicator, main.firstChild);
        }
        if (diff > threshold) {
          indicator.textContent = 'Release to refresh';
        } else {
          indicator.textContent = 'Pull to refresh';
        }
      }
    }, { passive: true });

    main.addEventListener('touchend', (e) => {
      if (!pulling) return;
      const diff = e.changedTouches[0].clientY - startY;
      if (diff > threshold && window.scrollY === 0) {
        loadStreams(true);
        if (indicator) {
          indicator.textContent = 'Refreshing...';
          setTimeout(() => {
            if (indicator) { indicator.remove(); indicator = null; }
          }, 1000);
        }
      } else {
        if (indicator) { indicator.remove(); indicator = null; }
      }
      pulling = false;
    }, { passive: true });
  })();

  /* ============================================================
   * Service Worker
   * ============================================================ */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  /* ============================================================
   * Theme Toggle
   * ============================================================ */
  function getTheme() {
    return localStorage.getItem('vlc-cloud-theme') || 'dark';
  }

  function setTheme(theme) {
    const isLight = theme === 'light';
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : '');
    el.themeIconSun.style.display = isLight ? 'none' : '';
    el.themeIconMoon.style.display = isLight ? '' : 'none';
    if (el.themeColorMeta) {
      el.themeColorMeta.content = isLight ? '#FFFFFF' : '#0F1115';
    }
    try { localStorage.setItem('vlc-cloud-theme', theme); } catch {}
  }

  function toggleTheme() {
    const current = getTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  /* ============================================================
   * Event Listeners
   * ============================================================ */
  function init() {
    setTheme(getTheme());
    el.streamForm.addEventListener('submit', saveStream);
    el.streamForm.addEventListener('reset', () => {
      setTimeout(() => el.streamUrl.focus(), 0);
    });

    el.searchInput.addEventListener('input', handleSearch);

    el.filterBtns().forEach(btn => {
      btn.addEventListener('click', () => handleCategoryFilter(btn.dataset.category));
      btn.addEventListener('keydown', (e) => {
        const btns = el.filterBtns();
        const idx = btns.indexOf(btn);
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const next = btns[(idx + 1) % btns.length];
          next.focus();
          next.click();
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const prev = btns[(idx - 1 + btns.length) % btns.length];
          prev.focus();
          prev.click();
        }
      });
    });

    el.themeToggle.addEventListener('click', toggleTheme);

    el.refreshBtn.addEventListener('click', () => {
      el.refreshBtn.classList.add('rotating');
      loadStreams(true).finally(() => {
        setTimeout(() => el.refreshBtn.classList.remove('rotating'), 500);
      });
    });

    el.exportBtn.addEventListener('click', () => openModal(el.exportModal));

    el.exportJsonBtn.addEventListener('click', () => {
      exportJSON();
      closeModal(el.exportModal);
    });

    el.exportCsvBtn.addEventListener('click', () => {
      exportCSV();
      closeModal(el.exportModal);
    });

    el.importFileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        importFile(e.target.files[0]);
        e.target.value = '';
        closeModal(el.exportModal);
      }
    });

    el.editForm.addEventListener('submit', updateStream);
    el.editSaveBtn.addEventListener('click', updateStream);
    el.editCancelBtn.addEventListener('click', closeEditModal);

    el.confirmOkBtn.addEventListener('click', () => {
      closeModal(el.confirmModal);
      if (typeof state.confirmCallback === 'function') {
        state.confirmCallback();
        state.confirmCallback = null;
      }
    });

    el.confirmCancelBtn.addEventListener('click', () => {
      closeModal(el.confirmModal);
      state.confirmCallback = null;
    });

    $$('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        if (modal) closeModal(modal);
      });
    });

    $$('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', () => {
        const modal = overlay.closest('.modal');
        if (modal) closeModal(modal);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.modal.open').forEach(m => closeModal(m));
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        el.searchInput.focus();
      }
    });

    window.addEventListener('online', () => {
      showToast('Back online. Syncing...', 'success');
      loadStreams(true);
    });

    window.addEventListener('offline', () => {
      showToast('You are offline. Using cached data.', 'warning');
    });

    registerSW();
    loadStreams();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
