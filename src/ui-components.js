import { saveDocument, fetchDocuments, getDocument, deleteDocument as apiDeleteDocument } from './api.js';
import { showUpgradeModal, saveToStorage } from './auth.js';
import { addChatMessage, saveCurrentSession, loadSession, newSession, loadSessions, renderHistory } from './chat.js';

// ===== STARS CANVAS =====

export function initStars() {
  const canvas = document.getElementById('stars-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];
  const STAR_COUNT = 180;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.8 + 0.3,
        alpha: Math.random() * 0.7 + 0.3,
        speed: Math.random() * 0.005 + 0.002,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function draw(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = timestamp * 0.001;
    for (const s of stars) {
      const twinkle = Math.sin(t * s.speed * 60 + s.phase) * 0.5 + 0.5;
      const alpha = s.alpha * (0.4 + twinkle * 0.6);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  resize();
  createStars();
  requestAnimationFrame(draw);

  window.addEventListener('resize', () => {
    resize();
    createStars();
  });
}

// ===== SIDEBAR =====

export function toggleSidebarDesktop() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const isOpen = sidebar.style.display === 'flex';
  if (isOpen) {
    sidebar.style.display = 'none';
    document.body.classList.add('sidebar-closed');
    localStorage.setItem('sidebarOpen', 'false');
  } else {
    sidebar.style.display = 'flex';
    document.body.classList.remove('sidebar-closed');
    localStorage.setItem('sidebarOpen', 'true');
  }
}

export function toggleSidebar() {
  if (window.innerWidth <= 768) {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebarOverlay');
    if (!s || !o) return;
    if (s.classList.contains('open')) {
      s.classList.remove('open');
      o.classList.remove('open');
      s.style.display = '';
    } else {
      s.style.display = 'flex';
      s.classList.add('open');
      o.classList.add('open');
    }
  } else {
    toggleSidebarDesktop();
  }
}

export function closeMobileDrawer() {
  const sidebarEl = document.getElementById('sidebar');
  const sidebarOverlayEl = document.getElementById('sidebarOverlay');
  if (!sidebarEl || !sidebarOverlayEl) return;
  sidebarEl.classList.remove('open');
  sidebarOverlayEl.classList.remove('open');
  sidebarEl.style.display = '';
}

export function openMobileDrawer() {
  const sidebarEl = document.getElementById('sidebar');
  const sidebarOverlayEl = document.getElementById('sidebarOverlay');
  if (!sidebarEl || !sidebarOverlayEl) return;
  sidebarEl.style.display = 'flex';
  sidebarEl.classList.add('open');
  sidebarOverlayEl.classList.add('open');
}

// ===== TOAST =====

export function mostrarToast(msg) {
  const el = document.getElementById('toast');
  const txt = document.getElementById('toastText');
  const actions = document.querySelector('.toast-actions');
  if (el && txt) {
    txt.textContent = msg;
    if (actions) actions.style.display = 'none';
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      if (actions) actions.style.display = '';
    }, 3500);
  }
}

// ===== EXPORT BUTTON =====

export function updateExportAllButton() {
  const btn = document.getElementById('exportAllBtn');
  if (!btn) return;
  const hasContent = window.flashcardsData?.length > 0 || window.summaryData || window.planData?.items?.length > 0;
  btn.disabled = !hasContent;
  btn.style.opacity = hasContent ? '1' : '0.5';
  btn.style.cursor = hasContent ? 'pointer' : 'not-allowed';
}

// ===== PDF HELPERS =====

export function getCombinedContext() {
  if (!window.pdfDocs || window.pdfDocs.length === 0) return '';
  return window.pdfDocs.map((doc, i) =>
    `=== DOCUMENTO ${i + 1}: ${doc.name} ===\n${doc.content}`
  ).join('\n\n');
}

// ===== DRAG & DROP / FILE HANDLING =====

export async function handleFile(file) {
  if (file.type && file.type !== 'application/pdf') {
    alert('Solo se aceptan archivos PDF.');
    return;
  }

  if (!window.pdfjsLib) {
    alert('No se pudo cargar PDF.js. Revisa tu conexion o el script de PDF.js.');
    return;
  }

  if (window.pdfDocs.some(d => d.name === file.name)) {
    mostrarToast(`📄 '${file.name}' ya está cargado`);
    return;
  }

  if (window.userLimits && window.userLimits.plan === 'free' && window.pdfDocs.length >= 3) {
    showUpgradeModal('pdf');
    return;
  }

  const fileInfo = document.getElementById('fileInfo');
  const fileName = document.getElementById('fileName');
  const pageCount = document.getElementById('pageCount');
  const fileSize = document.getElementById('fileSize');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');
  const textPreview = document.getElementById('textPreview');
  const statWords = document.getElementById('statWords');
  const statPages = document.getElementById('statPages');
  const statChars = document.getElementById('statChars');
  const statReadTime = document.getElementById('statReadTime');

  if (fileInfo) fileInfo.classList.add('visible');
  if (fileName) fileName.textContent = file.name;
  if (fileSize) fileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  if (pageCount) pageCount.textContent = totalPages;
  if (progressFill) progressFill.style.width = '0%';
  if (progressLabel) progressLabel.textContent = 'Extrayendo texto...';

  let fullText = '';
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';

    const pct = Math.round((i / totalPages) * 100);
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressLabel) progressLabel.textContent = `Página ${i} de ${totalPages}`;
  }

  const docId = Date.now() + Math.random();
  window.pdfDocs.push({ id: docId, name: file.name, content: fullText, pages: totalPages });
  window.activeDocId = docId;

  if (textPreview) textPreview.textContent = fullText.slice(0, 500) + (fullText.length > 500 ? '...' : '');
  if (progressFill) progressFill.style.width = '100%';
  if (progressLabel) progressLabel.textContent = '✅ Listo';

  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  const charCount = fullText.length;
  if (statWords) statWords.textContent = wordCount.toLocaleString();
  if (statPages) statPages.textContent = totalPages;
  if (statChars) statChars.textContent = charCount.toLocaleString();
  if (statReadTime) statReadTime.textContent = Math.ceil(wordCount / 200) + ' min';

  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  if (statusBadge) statusBadge.className = 'status-badge online';
  if (statusText) statusText.textContent = `${file.name} — Listo para análisis`;

  document.getElementById('dropZone').classList.add('collapsed');
  document.getElementById('toolPanel').style.display = 'flex';

  renderTabs();

  mostrarToast(`✅ Documento cargado: ${file.name}`);
  saveCurrentSession();
}

export function renderTabs() {
  const pdfTabs = document.getElementById('pdf-tabs');
  if (!pdfTabs) return;

  pdfTabs.innerHTML = '';
  window.pdfDocs.forEach((doc, i) => {
    const tab = document.createElement('span');
    tab.className = 'pdf-tab' + (doc.id === window.activeDocId ? ' active' : '');
    tab.dataset.id = doc.id;
    tab.innerHTML = `📄 <span class="tab-name">${doc.name}</span> <span class="pdf-tab-close" data-id="${doc.id}">✕</span>`;
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('pdf-tab-close')) return;
      window.activeDocId = doc.id;
      renderTabs();
    });
    tab.querySelector('.pdf-tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      removeDoc(doc.id);
    });
    pdfTabs.appendChild(tab);
  });

  const addTab = document.createElement('span');
  addTab.className = 'pdf-tab pdf-tab-add';
  addTab.textContent = '+';
  addTab.addEventListener('click', () => document.getElementById('fileInput').click());
  pdfTabs.appendChild(addTab);
}

export function removeDoc(id) {
  window.pdfDocs = window.pdfDocs.filter(d => d.id !== id);
  if (window.activeDocId === id) {
    window.activeDocId = window.pdfDocs.length > 0 ? window.pdfDocs[0].id : null;
  }

  document.getElementById('toolPanel').style.display = window.pdfDocs.length > 0 ? 'flex' : 'none';
  document.getElementById('fileInfo')?.classList.remove('visible');
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');

  if (window.pdfDocs.length === 0) {
    document.getElementById('dropZone')?.classList.remove('collapsed');
    document.getElementById('fileName').textContent = '';
    document.getElementById('textPreview').textContent = '';
    document.getElementById('pageCount').textContent = '0';
    document.getElementById('statWords').textContent = '0';
    document.getElementById('statPages').textContent = '0';
    document.getElementById('statChars').textContent = '0';
    document.getElementById('statReadTime').textContent = '0';
    if (statusBadge) statusBadge.className = 'status-badge offline';
    if (statusText) statusText.textContent = 'Sin documento cargado';
  } else {
    if (statusBadge) statusBadge.className = 'status-badge online';
    if (statusText) statusText.textContent = `${window.pdfDocs.length} documento(s) cargado(s)`;
  }

  renderTabs();
}

// ===== LIBRARY =====

export async function loadLibrary() {
  try {
    const data = await fetchDocuments();
    const list = document.getElementById('libraryList');
    if (!list) return;
    if (!data.documentos?.length) {
      list.innerHTML = '<div class="history-empty">No hay documentos guardados</div>';
      return;
    }
    list.innerHTML = data.documentos.map(d => `
      <div class="history-item" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="h-name">📄 ${d.nombre}</div>
          <div class="h-date">${new Date(d.created_at).toLocaleDateString('es-ES')} · ${d.paginas} pág</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-small btn-primary" data-id="${d.id}">Cargar</button>
          <button class="btn btn-small btn-secondary" data-id="${d.id}" style="color:#f87171;">✕</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.btn-primary[data-id]').forEach(btn => {
      btn.addEventListener('click', () => loadDocument(btn.dataset.id));
    });
    list.querySelectorAll('.btn-secondary[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await apiDeleteDocument(btn.dataset.id);
        loadLibrary();
      });
    });
  } catch (e) {
    console.error('Library error:', e);
  }
}

export async function loadDocument(docId) {
  try {
    const data = await getDocument(docId);
    const doc = {
      id: Date.now() + Math.random(),
      name: data.nombre,
      content: data.contenido_texto || '',
      pages: data.paginas || 0
    };
    window.pdfDocs.push(doc);
    window.activeDocId = doc.id;

    document.getElementById('fileName').textContent = doc.name;
    document.getElementById('pageCount').textContent = doc.pages;
    document.getElementById('fileSize').textContent = data.tamanio ? (data.tamanio / 1024).toFixed(1) + ' KB' : 'N/A';
    document.getElementById('fileInfo').classList.add('visible');

    const wordCount = doc.content.split(/\s+/).filter(Boolean).length;
    const charCount = doc.content.length;
    document.getElementById('statWords').textContent = wordCount.toLocaleString();
    document.getElementById('statPages').textContent = doc.pages;
    document.getElementById('statChars').textContent = charCount.toLocaleString();
    document.getElementById('statReadTime').textContent = Math.ceil(wordCount / 200) + ' min';
    document.getElementById('textPreview').textContent = doc.content.slice(0, 500) + (doc.content.length > 500 ? '...' : '');

    document.getElementById('status-badge').className = 'status-badge online';
    document.getElementById('status-text').textContent = `${doc.name} — Cargado desde biblioteca`;
    document.getElementById('dropZone').classList.add('collapsed');
    document.getElementById('toolPanel').style.display = 'flex';

    renderTabs();
    closeLibrary();
    mostrarToast(`📄 ${doc.name} cargado desde biblioteca`);
    saveCurrentSession();
  } catch (e) {
    console.error('Load document error:', e);
  }
}

export function closeLibrary() {
  document.getElementById('libraryPanel')?.classList.remove('open');
  document.getElementById('libraryOverlay')?.classList.remove('open');
}

// ===== EXPORT PDF =====

function hexToRgb(hex) {
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
}

function drawHeader(doc, title) {
  doc.setFillColor(15, 15, 42);
  doc.rect(0, 0, doc.internal.pageSize.width, 20, 'F');
  doc.setFontSize(14);
  doc.setTextColor(139, 92, 246);
  doc.text('AeroLex AI', 15, 12);
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('Tu asistente de estudio galáctico', 15, 17);
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(title, doc.internal.pageSize.width - 20, 12, { align: 'right' });
  doc.setDrawColor(139, 92, 246);
  doc.setLineWidth(0.5);
  doc.line(15, 21, doc.internal.pageSize.width - 15, 21);
}

function drawFooter(doc, filename) {
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  doc.setDrawColor(139, 92, 246);
  doc.setLineWidth(0.3);
  doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);
  doc.setFontSize(7);
  doc.setTextColor(102, 102, 102);
  doc.text(new Date().toLocaleDateString('es-ES'), 15, pageHeight - 10);
  doc.text('Generado por AeroLex AI', pageWidth / 2, pageHeight - 10, { align: 'center' });
  const pageCount = doc.internal.getNumberOfPages();
  doc.text('Pagina ' + doc.internal.getCurrentPageInfo().pageNumber + ' de ' + pageCount, pageWidth - 15, pageHeight - 10, { align: 'right' });
}

function drawBox(doc, x, y, width, height, label, text, colorHex) {
  const color = hexToRgb(colorHex);
  doc.setDrawColor(...color);
  doc.setLineWidth(1);
  doc.rect(x, y, width, height);
  doc.setFillColor(255, 255, 255);
  const labelWidth = doc.getTextWidth(label) + 4;
  doc.rect(x + 2, y - 5, labelWidth, 5, 'F');
  doc.setFontSize(8);
  doc.setTextColor(...color);
  doc.text(label, x + 4, y - 1);
  doc.setFontSize(11);
  doc.setTextColor(26, 26, 26);
  const lines = doc.splitTextToSize(text, width - 10);
  let textY = y + 10;
  for (let i = 0; i < lines.length && textY < y + height; i++) {
    doc.text(lines[i], x + 5, textY);
    textY += 4;
  }
}

function exportFlashcardsPDF() {
  if (!window.flashcardsData?.length) { mostrarToast('Genera flashcards primero'); return; }
  if (!window.jspdf) { mostrarToast('Error: jsPDF no cargado'); return; }

  const doc = new window.jspdf.jsPDF({ format: 'A4' });
  const pdfName = 'AeroLex_Flashcards_' + new Date().toISOString().split('T')[0] + '.pdf';
  drawHeader(doc, 'Flashcards de Estudio');
  doc.setFontSize(10);
  doc.setTextColor(102, 102, 102);
  doc.text(`Basadas en: ${window.pdfDocs.map(d => d.name).join(', ') || 'PDFs cargados'}`, 15, 28);
  let yPos = 35;
  window.flashcardsData.forEach((card, i) => {
    if (yPos > 250) { doc.addPage(); drawHeader(doc, 'Flashcards de Estudio (cont.)'); yPos = 35; }
    doc.setFontSize(9); doc.setTextColor(128, 128, 128);
    doc.text(`Tarjeta ${i + 1} / ${window.flashcardsData.length}`, 15, yPos);
    yPos += 5;
    drawBox(doc, 15, yPos, 180, 20, 'PREGUNTA', card.pregunta, '#8b5cf6');
    yPos += 25;
    drawBox(doc, 15, yPos, 180, 20, 'RESPUESTA', card.respuesta, '#10b981');
    yPos += 30;
    if (i < window.flashcardsData.length - 1) {
      doc.setLineHeightFactor(1); doc.setDrawColor(200, 200, 200);
      doc.setLineDash([1, 2]); doc.line(15, yPos - 5, 195, yPos - 5); doc.setLineDash([]);
    }
  });
  drawFooter(doc, pdfName);
  doc.save(pdfName);
}

function exportSummaryPDF() {
  if (!window.summaryData) { mostrarToast('Genera resumen primero'); return; }
  if (!window.jspdf) { mostrarToast('Error: jsPDF no cargado'); return; }

  const doc = new window.jspdf.jsPDF({ format: 'A4' });
  const pdfName = 'AeroLex_Resumen_' + new Date().toISOString().split('T')[0] + '.pdf';
  drawHeader(doc, 'Resumen de Estudio');
  doc.setFontSize(10); doc.setTextColor(102, 102, 102);
  doc.text(`Basado en: ${window.summaryData.pdfs.join(', ')} | ${new Date().toLocaleDateString('es-ES')}`, 15, 28);
  let yPos = 40;
  const lines = doc.splitTextToSize(window.summaryData.text, 180);
  for (let i = 0; i < lines.length; i++) {
    if (yPos > 270) { doc.addPage(); drawHeader(doc, 'Resumen de Estudio (cont.)'); yPos = 35; }
    doc.setFontSize(11); doc.setTextColor(26, 26, 26);
    doc.text(lines[i], 15, yPos);
    yPos += 6;
  }
  drawFooter(doc, pdfName);
  doc.save(pdfName);
}

function exportPlanPDF() {
  if (!window.planData?.items?.length) { mostrarToast('Genera plan primero'); return; }
  if (!window.jspdf) { mostrarToast('Error: jsPDF no cargado'); return; }

  const doc = new window.jspdf.jsPDF({ format: 'A4' });
  const pdfName = 'AeroLex_Plan_' + new Date().toISOString().split('T')[0] + '.pdf';
  drawHeader(doc, 'Plan de Estudio');
  doc.setFontSize(10); doc.setTextColor(102, 102, 102);
  doc.text(`Materia: ${window.planData.subject} | Examen: ${new Date(window.planData.examDate).toLocaleDateString('es-ES')}`, 15, 28);
  let yPos = 40;

  doc.setFontSize(10); doc.setTextColor(255, 255, 255); doc.setFillColor(139, 92, 246);
  doc.rect(15, yPos - 10, 180, 8, 'F');
  doc.text('Día', 20, yPos - 5); doc.text('Fecha', 50, yPos - 5);
  doc.text('Tema', 90, yPos - 5); doc.text('Duración', 145, yPos - 5); doc.text('Estado', 175, yPos - 5);
  yPos += 5;

  window.planData.items.forEach((item, i) => {
    if (yPos > 250) { doc.addPage(); drawHeader(doc, 'Plan de Estudio (cont.)'); yPos = 50; }
    const isLast = i === window.planData.items.length - 1;
    doc.setFillColor(...hexToRgb(isLast ? '#fef3c7' : (i % 2 === 0 ? '#ffffff' : '#f8f7ff')));
    doc.rect(15, yPos - 5, 180, 8, 'F');
    doc.setFontSize(10); doc.setTextColor(...hexToRgb(isLast ? '#92400e' : '#1a1a1a'));
    const d = new Date(item.fecha);
    const dateStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    doc.text(`Día ${item.dia}`, 20, yPos); doc.text(dateStr, 50, yPos);
    doc.text(item.tema.substring(0, 25), 90, yPos); doc.text(item.tiempo, 145, yPos);
    doc.text(isLast ? 'Examen' : 'Por hacer', 175, yPos);
    yPos += 10;
  });
  drawFooter(doc, pdfName);
  doc.save(pdfName);
}

function exportAllPDF() {
  if (!window.jspdf) { mostrarToast('Error: jsPDF no cargado'); return; }

  const hasFlashcards = window.flashcardsData?.length > 0;
  const hasSummary = window.summaryData;
  const hasPlan = window.planData?.items?.length > 0;

  if (!hasFlashcards && !hasSummary && !hasPlan) {
    mostrarToast('No hay contenido para exportar');
    return;
  }

  const doc = new window.jspdf.jsPDF({ format: 'A4' });
  const pdfName = 'AeroLex_Completo_' + new Date().toISOString().split('T')[0] + '.pdf';
  let isFirst = true;

  if (hasFlashcards) {
    if (!isFirst) doc.addPage();
    drawHeader(doc, 'Flashcards');
    let yPos = 35;
    window.flashcardsData.forEach((card, i) => {
      if (yPos > 250) { doc.addPage(); yPos = 35; }
      doc.setFontSize(9); doc.setTextColor(128, 128, 128);
      doc.text(`Tarjeta ${i + 1}`, 15, yPos); yPos += 5;
      drawBox(doc, 15, yPos, 180, 20, 'PREGUNTA', card.pregunta, '#8b5cf6');
      yPos += 25;
      drawBox(doc, 15, yPos, 180, 20, 'RESPUESTA', card.respuesta, '#10b981');
      yPos += 30;
    });
    isFirst = false;
  }

  if (hasSummary) {
    if (!isFirst) doc.addPage();
    drawHeader(doc, 'Resumen');
    let yPos = 40;
    const lines = doc.splitTextToSize(window.summaryData.text, 180);
    for (let i = 0; i < lines.length; i++) {
      if (yPos > 270) { doc.addPage(); yPos = 35; }
      doc.setFontSize(11); doc.setTextColor(26, 26, 26);
      doc.text(lines[i], 15, yPos); yPos += 6;
    }
    isFirst = false;
  }

  if (hasPlan) {
    if (!isFirst) doc.addPage();
    drawHeader(doc, 'Plan de Estudio');
    let yPos = 40;
    window.planData.items.forEach((item) => {
      if (yPos > 250) { doc.addPage(); yPos = 40; }
      doc.setFontSize(10);
      const d = new Date(item.fecha);
      const dateStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      doc.text(`${item.dia} | ${dateStr} | ${item.tema} | ${item.tiempo}`, 15, yPos);
      yPos += 10;
    });
  }

  drawFooter(doc, pdfName);
  doc.save(pdfName);
}

export function initExportButtons() {
  document.getElementById('exportFlashcards')?.addEventListener('click', exportFlashcardsPDF);
  document.getElementById('exportSummary')?.addEventListener('click', exportSummaryPDF);
  document.getElementById('exportPlan')?.addEventListener('click', exportPlanPDF);
  document.getElementById('exportAllBtn')?.addEventListener('click', exportAllPDF);
}

// ===== TOAST SAVE =====

export function initToastSave() {
  document.getElementById('toastSave')?.addEventListener('click', async () => {
    if (!window.pdfDocs?.length) return;
    try {
      const doc = window.pdfDocs.find(d => d.id === window.activeDocId) || window.pdfDocs[0];
      await saveDocument({
        nombre: doc.name,
        contenidoTexto: doc.content,
        tamanio: null,
        paginas: doc.pages
      });
      mostrarToast('✅ Documento guardado en tu biblioteca');
    } catch (e) {
      console.error('Save error:', e);
      mostrarToast('❌ Error al guardar documento');
    }
  });

  document.getElementById('toastDismiss')?.addEventListener('click', () => {
    document.getElementById('toast')?.classList.remove('show');
  });
}

// ===== HISTORY PANEL =====

export function initHistoryPanel() {
  document.getElementById('historyBtn')?.addEventListener('click', () => {
    renderHistory();
    document.getElementById('historyPanel')?.classList.add('open');
    document.getElementById('historyOverlay')?.classList.add('open');
  });

  document.getElementById('closeHistory')?.addEventListener('click', () => {
    import('./chat.js').then(m => m.closeHistoryPanel());
  });

  document.getElementById('historyOverlay')?.addEventListener('click', () => {
    import('./chat.js').then(m => m.closeHistoryPanel());
  });

  document.getElementById('clearHistory')?.addEventListener('click', () => {
    localStorage.removeItem('aerolex_history');
    renderHistory();
  });
}

// ===== TAB SWITCHING =====

export function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetPanel = document.getElementById('tab-' + btn.dataset.tab);
      if (!targetPanel) return;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      targetPanel.classList.add('active');
    });
  });
}

// ===== DRAG & DROP EVENTS =====

export function initDragDrop() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const btnChangePdf = document.getElementById('btnChangePdf');

  if (uploadBtn) uploadBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput?.click(); });
  if (dropZone) dropZone.addEventListener('click', () => fileInput?.click());
  if (btnChangePdf) btnChangePdf.addEventListener('click', (e) => { e.stopPropagation(); fileInput?.click(); });

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length) {
        const f = files[0];
        if (!f.type || f.type === 'application/pdf') handleFile(f);
        else alert('Solo se aceptan archivos PDF.');
      }
    });
  }
}

// ===== LIBRARY PANEL =====

export function initLibraryPanel() {
  document.getElementById('libraryBtn')?.addEventListener('click', () => {
    loadLibrary();
    document.getElementById('libraryPanel')?.classList.add('open');
    document.getElementById('libraryOverlay')?.classList.add('open');
  });

  document.getElementById('closeLibrary')?.addEventListener('click', closeLibrary);
  document.getElementById('libraryOverlay')?.addEventListener('click', closeLibrary);
}

// ===== UPGRADE MODAL =====

export function initUpgradeModal() {
  document.getElementById('closeUpgrade')?.addEventListener('click', () => {
    import('./auth.js').then(m => m.closeUpgradeModal());
  });
  document.getElementById('upgradeOverlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) import('./auth.js').then(m => m.closeUpgradeModal());
  });
  document.getElementById('getPremiumBtn')?.addEventListener('click', () => mostrarToast('🚀 Función Premium — próximamente'));
  document.getElementById('backFreeBtn')?.addEventListener('click', () => {
    import('./auth.js').then(m => m.closeUpgradeModal());
  });
}

// ===== USER DROPDOWN OUTSIDE CLICK =====

export function initUserDropdownClose() {
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('userDropdown');
    const container = document.getElementById('userProfile');
    if (dropdown && container && !dropdown.contains(e.target) && !container.contains(e.target)) {
      import('./auth.js').then(m => m.closeUserMenu());
    }
  });
}

// ===== SIDEBAR SESSION LIST EVENTS =====

export function initSidebarEvents() {
  document.getElementById('newChatBtn')?.addEventListener('click', () => {
    if (window.innerWidth <= 768) closeMobileDrawer();
    newSession();
  });

  document.getElementById('sidebarOverlay')?.addEventListener('click', closeMobileDrawer);

  document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);

  document.getElementById('sessionList')?.addEventListener('click', function(e) {
    const item = e.target.closest('.session-item');
    if (item && window.innerWidth <= 768) closeMobileDrawer();
  });
}

// ===== HEADER SCROLL =====

export function initHeaderScroll() {
  window.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    if (!header) return;
    if (window.scrollY > 30) header.classList.add('header-compact');
    else header.classList.remove('header-compact');
  }, { passive: true });
}

// ===== SESSION CLICK DELEGATION =====

export function initSessionClickDelegation() {
  document.getElementById('sessionList')?.addEventListener('click', async (e) => {
    const item = e.target.closest('.session-item');
    const del = e.target.closest('.session-delete');
    if (del) {
      e.stopPropagation();
      const { deleteSession } = await import('./chat.js');
      deleteSession(del.dataset.id);
      return;
    }
    if (item) {
      const { loadSession } = await import('./chat.js');
      loadSession(item.dataset.id);
    }
  });
}