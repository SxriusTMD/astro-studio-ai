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
    try {
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
    } catch (err) {
      console.error('[Persistence] Boot failed:', err);
      // Graceful degradation: clean slate
      try {
        localStorage.removeItem(this.getKey('active_doc'));
        localStorage.removeItem(this.getKey('active_tab'));
      } catch (e) {}
    }
  }
}

export class EngagementTracker {
  static startTime = Date.now();
  static currentSection = 'chat';
  static engagementData = {};

  static init() {
    this.engagementData = JSON.parse(localStorage.getItem(PersistenceManager.getKey('engagement')) || '{}');
    
    // Monitor tab switching to calculate time spent
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newSection = e.currentTarget.dataset.tab;
        this.recordTime();
        this.currentSection = newSection;
        this.startTime = Date.now();
      });
    });

    // Check for proactive chat on open
    const chatBtn = document.querySelector('.tab-btn[data-tab="chat"]');
    if (chatBtn) {
      chatBtn.addEventListener('click', () => {
        this.checkProactiveChat();
      });
    }
  }

  static recordTime() {
    if (!this.currentSection) return;
    
    // Strict Condition: Timer MUST NOT start unless document is loaded and summarized
    const summaryText = document.getElementById('summaryText');
    if (!summaryText || summaryText.innerText.length < 50) return;

    const timeSpent = Math.floor((Date.now() - this.startTime) / 1000);
    this.engagementData[this.currentSection] = (this.engagementData[this.currentSection] || 0) + timeSpent;
    localStorage.setItem(PersistenceManager.getKey('engagement'), JSON.stringify(this.engagementData));
  }

  static checkProactiveChat() {
    // Remove any previous bubble
    document.getElementById('suggestionBubble')?.remove();

    const sections = ['flashcards', 'summary', 'plan'];
    for (const section of sections) {
      if (this.engagementData[section] > 60) {
        const chatInputArea = document.querySelector('.chat-input-area');
        if (!chatInputArea) break;

        const topic = section === 'flashcards' ? 'las flashcards' : section === 'summary' ? 'el resumen' : 'el plan de estudio';
        const promptText = `Noté que estuviste analizando a fondo ${topic}. ¿Puedes explicarme esto en términos más simples?`;

        // Build the bubble with safe DOM
        const bubble = document.createElement('div');
        bubble.id = 'suggestionBubble';
        bubble.style.cssText = 'position:absolute;bottom:100%;left:16px;right:16px;margin-bottom:8px;padding:12px 16px;background:rgba(108,59,210,0.15);border:1px solid rgba(139,92,246,0.3);border-radius:12px;color:#d1d5db;font-size:13px;cursor:pointer;opacity:0;transition:opacity 0.4s ease;display:flex;align-items:center;gap:10px;backdrop-filter:blur(8px);z-index:10;';

        const icon = document.createElement('span');
        icon.textContent = '💡';
        icon.style.fontSize = '18px';

        const text = document.createElement('span');
        text.textContent = 'Noté que pasaste mucho tiempo en esta sección. ¿Quieres un resumen rápido?';
        text.style.flex = '1';

        const dismiss = document.createElement('span');
        dismiss.textContent = '✕';
        dismiss.style.cssText = 'color:#606088;font-size:16px;cursor:pointer;padding:0 4px;';

        bubble.appendChild(icon);
        bubble.appendChild(text);
        bubble.appendChild(dismiss);

        // Position the parent relatively
        chatInputArea.style.position = 'relative';
        chatInputArea.appendChild(bubble);

        // Fade in
        requestAnimationFrame(() => { bubble.style.opacity = '1'; });

        // Click handler: insert prompt
        const insertPrompt = () => {
          const chatInput = document.getElementById('chatInput');
          if (chatInput) chatInput.value = promptText;
          bubble.style.opacity = '0';
          setTimeout(() => bubble.remove(), 400);
          this.engagementData[section] = 0;
          localStorage.setItem(PersistenceManager.getKey('engagement'), JSON.stringify(this.engagementData));
        };

        text.addEventListener('click', insertPrompt);
        icon.addEventListener('click', insertPrompt);

        // Dismiss handler
        dismiss.addEventListener('click', (e) => {
          e.stopPropagation();
          bubble.style.opacity = '0';
          setTimeout(() => bubble.remove(), 400);
        });

        // Auto-fade after 10s
        setTimeout(() => {
          if (bubble.parentNode) {
            bubble.style.opacity = '0';
            setTimeout(() => bubble.remove(), 400);
          }
        }, 10000);

        break;
      }
    }
  }
}
