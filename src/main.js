import { initAuth, fetchUserLimits, clearStorage } from './auth.js';
import {
  handleChat, initCardClickHandlers, initFlashcardGenerator,
  initPlanGenerator, initSummaryGenerator, initExamMode,
  newSession
} from './chat.js';
import {
  initStars, toggleSidebarDesktop, closeMobileDrawer,
  initExportButtons, initToastSave, initHistoryPanel,
  initTabs, initDragDrop, initLibraryPanel, initUpgradeModal,
  initUserDropdownClose, initSidebarEvents, initHeaderScroll,
  initSessionClickDelegation
} from './ui-components.js';

function init() {
  if (window.location.protocol === 'file:') {
    window.location.replace('/');
    return;
  }

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  window.pdfDocs = [];
  window.activeDocId = null;
  window.userLimits = null;
  window.flashcardsData = null;
  window.planData = null;
  window.summaryData = null;
  window.currentSessionId = null;

  initStars();
  fetchUserLimits();
  initTabs();
  initDragDrop();
  initExportButtons();
  initToastSave();
  initHistoryPanel();
  initLibraryPanel();
  initUpgradeModal();
  initUserDropdownClose();
  initSidebarEvents();
  initHeaderScroll();
  initSessionClickDelegation();
  initCardClickHandlers();
  initFlashcardGenerator();
  initPlanGenerator();
  initSummaryGenerator();
  initExamMode();

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    clearStorage();
    window.location.href = '/auth/logout';
  });

  document.getElementById('userProfile')?.addEventListener('click', async () => {
    const { toggleUserMenu } = await import('./auth.js');
    toggleUserMenu();
  });

  document.getElementById('menuLogout')?.addEventListener('click', () => {
    clearStorage();
    window.location.href = '/auth/logout';
  });

  document.getElementById('menuUpgrade')?.addEventListener('click', async () => {
    const { showUpgradeModal, closeUserMenu } = await import('./auth.js');
    showUpgradeModal('plan');
    closeUserMenu();
  });

  document.getElementById('chatSend')?.addEventListener('click', handleChat);
  document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleChat();
  });

  if (window.location.search.includes('verified=true')) {
    const msgEl = document.getElementById('verifySuccessMsg');
    if (msgEl) {
      msgEl.style.display = 'block';
      msgEl.className = 'auth-msg success';
      msgEl.textContent = '✅ Correo verificado. Cierra esta pestaña y continúa en la ventana anterior.';
    }
  }

  (async () => {
    try {
      await initAuth();
      const { PersistenceManager } = await import('./persistence.js');
      await PersistenceManager.restoreWorkspace();
      
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) {
        chatMessages.addEventListener('scroll', () => PersistenceManager.saveScrollPositions());
      }
      const pdfViewer = document.getElementById('pdfViewer');
      if (pdfViewer) {
        pdfViewer.addEventListener('scroll', () => PersistenceManager.saveScrollPositions());
      }
    } catch (err) {
      console.error('[AeroLex Failsafe] Render error:', err);
      document.body.classList.remove('auth-checking', 'authenticated');
      document.body.classList.add('unauthenticated');
    }
  })();

  console.log('🌌 AeroLex AI — IA conectada');
  console.log('🤖 Modelo: Gemma-4-31B-IT via NVIDIA NIM');
  console.log('📌 Para cambiar de modelo, reemplaza window.askAI()');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}