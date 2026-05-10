export class PersistenceManager {
  static get googleId() {
    return window.userLimits?.google_id || 'anon';
  }

  static getKey(key) {
    return `astro_${this.googleId}_${key}`;
  }

  static saveActiveState(docId, tabId, sidebarState) {
    if (docId) localStorage.setItem(this.getKey('active_doc'), docId);
    if (tabId) localStorage.setItem(this.getKey('active_tab'), tabId);
    if (sidebarState !== undefined) localStorage.setItem(this.getKey('sidebar_open'), sidebarState);
  }

  static saveScrollPositions() {
    const chat = document.getElementById('chatMessages');
    const pdf = document.getElementById('pdfViewer');
    if (chat) localStorage.setItem(this.getKey('scroll_chat'), chat.scrollTop);
    if (pdf) localStorage.setItem(this.getKey('scroll_pdf'), pdf.scrollTop);
  }

  static restoreScrollPositions() {
    const chat = document.getElementById('chatMessages');
    const pdf = document.getElementById('pdfViewer');
    const chatScroll = localStorage.getItem(this.getKey('scroll_chat'));
    const pdfScroll = localStorage.getItem(this.getKey('scroll_pdf'));
    if (chat && chatScroll) chat.scrollTop = Number(chatScroll);
    if (pdf && pdfScroll) pdf.scrollTop = Number(pdfScroll);
  }

  static async restoreWorkspace() {
    // 1. Restore Sidebar
    const sidebarOpen = localStorage.getItem(this.getKey('sidebar_open'));
    if (sidebarOpen === 'true') {
      document.body.classList.remove('sidebar-closed');
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.style.display = 'flex';
    } else if (sidebarOpen === 'false') {
      document.body.classList.add('sidebar-closed');
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.style.display = 'none';
    }

    // 2. Restore Active Tab
    const tabId = localStorage.getItem(this.getKey('active_tab'));
    if (tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
      const content = document.getElementById(`tab-${tabId}`);
      if (btn && content) {
        btn.classList.add('active');
        content.classList.add('active');
      }
    }

    // 3. Silent PDF Recovery
    const docId = localStorage.getItem(this.getKey('active_doc'));
    if (docId) {
      window.activeDocId = docId;
      const isInMemory = window.pdfDocs?.some(d => String(d.id) === String(docId));
      if (!isInMemory) {
        try {
          const { getDocument } = await import('./api.js');
          const data = await getDocument(docId);
          if (data && data.documento) {
            window.pdfDocs = window.pdfDocs || [];
            // Prevent duplicates
            if (!window.pdfDocs.some(d => String(d.id) === String(docId))) {
               window.pdfDocs.push({
                 id: data.documento.id,
                 name: data.documento.nombre,
                 content: data.documento.contenido,
                 pages: data.documento.paginas
               });
            }
            const { renderTabs } = await import('./ui-components.js');
            renderTabs();
            const dropZone = document.getElementById('dropZone');
            const toolPanel = document.getElementById('toolPanel');
            if (dropZone) dropZone.classList.add('collapsed');
            if (toolPanel) toolPanel.style.display = 'flex';
          }
        } catch (e) {
          console.error('[Persistence] Silent PDF Recovery failed:', e);
          localStorage.removeItem(this.getKey('active_doc'));
        }
      }
    }
    
    // 4. Restore scroll positions
    setTimeout(() => this.restoreScrollPositions(), 100);
  }
}
