import {
  sendChat,
  generateFlashcards as apiFlashcards,
  createStudyPlan,
  generateSummary,
  generateExam,
  generateExamInteractive,
  fetchSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession as apiDeleteSession,
  incrementCounter,
} from './api.js';
import { updatePlanIndicator, showUpgradeModal, saveToStorage, loadFromStorage } from './auth.js';
import { getCombinedContext, updateExportAllButton, mostrarToast } from './ui-components.js';
import { PersistenceManager } from './persistence.js';

let saveDebounceTimer = null;
const HISTORY_KEY = 'aerolex_history';
let currentCard = 0;
let examQuestions = [];
let examIndex = 0;
let examAnswers = [];
let selectedExamOption = null;
let examTimerInterval = null;
let examStartTime = null;
let examStartDelegationBound = false;

function startExamTimer() {
  if (examTimerInterval) clearInterval(examTimerInterval);
  examTimerInterval = setInterval(() => {
    if (!examStartTime) return;
    const elapsed = Math.floor((Date.now() - examStartTime) / 1000);
    const timerEl = document.getElementById('examTimer');
    if (timerEl) {
      timerEl.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
    }
  }, 1000);
}

const flashcardData = [
  { q: '¿Qué es el aprendizaje supervisado?', a: 'Un tipo de ML donde el modelo se entrena con datos etiquetados.' },
  { q: '¿Qué es una red neuronal?', a: 'Modelo computacional inspirado en el cerebro, compuesto por capas de neuronas interconectadas.' },
  { q: '¿Qué es el overfitting?', a: 'Cuando el modelo aprende demasiado bien los datos de entrenamiento y falla en datos nuevos.' },
];

window.askAI = async function (prompt) {
  try {
    const pdfContent = getCombinedContext();
    const data = await sendChat(prompt, pdfContent, window.currentSessionId ?? null);
    if (data.chat_used !== undefined && window.userLimits) {
      window.userLimits.chat_used = data.chat_used;
      updatePlanIndicator();
    }
    return data.text;
  } catch (err) {
    console.error('askAI error:', err);
    if (err.data && err.data.error) {
      return `⚠️ Error de la IA: ${err.data.error}`;
    }
    return `⚠️ Error de la IA: ${err.message || 'Error al conectar con la IA.'}`;
  }
};

/** Alinea roles del backend (assistant/model) con la UI (ai). */
export function normalizeChatRole(role) {
  const r = String(role ?? '').trim().toLowerCase();
  if (r === 'user' || r === 'human') return 'user';
  if (r === 'system') return 'system';
  if (r === 'assistant' || r === 'model' || r === 'bot' || r === 'ai') return 'ai';
  return 'ai';
}

export function appendSafeHTML(parent, htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  parent.replaceChildren();
  
  function sanitizeAndAppend(srcNode, destParent) {
    srcNode.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        destParent.appendChild(document.createTextNode(child.textContent));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        const safeTags = ['p', 'span', 'strong', 'em', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div'];
        if (safeTags.includes(tag)) {
          const newEl = document.createElement(tag);
          if (child.className) {
            newEl.className = child.className;
          }
          sanitizeAndAppend(child, newEl);
          destParent.appendChild(newEl);
        } else {
          destParent.appendChild(document.createTextNode(child.textContent));
        }
      }
    });
  }
  
  sanitizeAndAppend(doc.body, parent);
}

export function normalizeFlashcards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map(c => {
    const q = c.pregunta || c.front || c.q || '';
    const a = c.respuesta || c.back || c.a || '';
    return { pregunta: q, respuesta: a };
  });
}

export function renderSummaryText(container, text) {
  if (!container) return;
  container.replaceChildren();
  
  const h4 = document.createElement('h4');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'w-5 h-5 mr-2 inline-block text-green-400');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '14 2 14 8 20 8');
  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '16'); line1.setAttribute('y1', '13'); line1.setAttribute('x2', '8'); line1.setAttribute('y2', '13');
  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '16'); line2.setAttribute('y1', '17'); line2.setAttribute('x2', '8'); line2.setAttribute('y2', '17');
  const polyline2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline2.setAttribute('points', '10 9 9 9 8 9');
  
  svg.appendChild(path);
  svg.appendChild(polyline);
  svg.appendChild(line1);
  svg.appendChild(line2);
  svg.appendChild(polyline2);
  
  h4.appendChild(svg);
  h4.appendChild(document.createTextNode('Resumen de tus apuntes'));
  container.appendChild(h4);
  
  if (typeof marked !== 'undefined') {
    const sanitized = text.replace(/\$\\rightarrow\$/g, '➔');
    const rawHtml = marked.parse(sanitized);
    const textContainer = document.createElement('div');
    appendSafeHTML(textContainer, rawHtml);
    container.appendChild(textContainer);
  } else {
    const p = document.createElement('p');
    p.textContent = text;
    container.appendChild(p);
  }
}

export function renderPlanTable(tbody, items) {
  if (!tbody) return;
  tbody.replaceChildren();
  
  if (!items || items.length === 0) return;
  
  items.forEach((item, i) => {
    const d = new Date(item.fecha);
    const dateStr = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    const tagClass = i < items.length - 1 ? 'tag-cyan' : 'tag-purple';
    
    const tr = document.createElement('tr');
    
    const tdDia = document.createElement('td');
    tdDia.textContent = `Día ${item.dia}`;
    
    const tdFecha = document.createElement('td');
    tdFecha.textContent = dateStr;
    
    const tdTema = document.createElement('td');
    tdTema.textContent = item.tema || '';
    
    const tdTiempo = document.createElement('td');
    tdTiempo.textContent = item.tiempo || '';
    
    const tdTag = document.createElement('td');
    const spanTag = document.createElement('span');
    spanTag.className = `tag ${tagClass}`;
    
    if (i < items.length - 1) {
      spanTag.textContent = 'Por hacer';
    } else {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'w-4 h-4 mr-1 inline-block text-white');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      
      const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path1.setAttribute('d', 'M22 10v6M2 10l10-5 10 5-10 5z');
      const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path2.setAttribute('d', 'M6 12v5c3 3 9 3 12 0v-5');
      
      svg.appendChild(path1);
      svg.appendChild(path2);
      spanTag.appendChild(svg);
      spanTag.appendChild(document.createTextNode(' Examen'));
    }
    
    tdTag.appendChild(spanTag);
    tr.appendChild(tdDia);
    tr.appendChild(tdFecha);
    tr.appendChild(tdTema);
    tr.appendChild(tdTiempo);
    tr.appendChild(tdTag);
    
    tbody.appendChild(tr);
  });
}

export function showSummarySkeleton(container) {
  if (!container) return;
  container.replaceChildren();
  
  const h4 = document.createElement('h4');
  h4.textContent = '⏳ Analizando y sintetizando apuntes...';
  container.appendChild(h4);
  
  const skeletonBox = document.createElement('div');
  skeletonBox.style.display = 'flex';
  skeletonBox.style.flexDirection = 'column';
  skeletonBox.style.gap = '12px';
  skeletonBox.style.padding = '12px';
  
  for (let i = 0; i < 4; i++) {
    const line = document.createElement('div');
    line.className = 'skeleton skeleton-text';
    if (i === 0) line.style.height = '18px';
    if (i === 0) line.style.width = '60%';
    else if (i === 3) line.style.width = '80%';
    skeletonBox.appendChild(line);
  }
  container.appendChild(skeletonBox);
}

export function showPlanSkeleton(tbody) {
  if (!tbody) return;
  tbody.replaceChildren();
  
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 5;
  
  const skeletonBox = document.createElement('div');
  skeletonBox.style.display = 'flex';
  skeletonBox.style.flexDirection = 'column';
  skeletonBox.style.gap = '10px';
  skeletonBox.style.padding = '16px';
  
  for (let i = 0; i < 3; i++) {
    const line = document.createElement('div');
    line.className = 'skeleton skeleton-text';
    if (i === 2) line.style.width = '70%';
    skeletonBox.appendChild(line);
  }
  
  td.appendChild(skeletonBox);
  tr.appendChild(td);
  tbody.appendChild(tr);
}

export function showFlashcardsSkeleton() {
  const cardQuestion = document.getElementById('cardQuestion');
  const cardAnswer = document.getElementById('cardAnswer');
  const cardIndex = document.getElementById('cardIndex');
  
  if (cardQuestion) {
    cardQuestion.replaceChildren();
    const skel = document.createElement('div');
    skel.className = 'skeleton skeleton-text';
    skel.style.width = '85%';
    skel.style.height = '20px';
    cardQuestion.appendChild(skel);
  }
  if (cardAnswer) {
    cardAnswer.replaceChildren();
    const skel = document.createElement('div');
    skel.className = 'skeleton skeleton-text';
    skel.style.width = '90%';
    skel.style.height = '20px';
    cardAnswer.appendChild(skel);
  }
  if (cardIndex) {
    cardIndex.textContent = '⏳ Generando...';
  }
}

export function formatMessageHTML(text, roleNorm, div) {
  div.dataset.rawContent = text; // Save raw markdown for persistence
  if (roleNorm === 'system') {
    div.className = 'message system';
    div.textContent = text;
  } else if (roleNorm === 'user') {
    div.className = 'message user';
    div.textContent = text;
  } else {
    div.className = 'message ai';
    if (typeof marked !== 'undefined') {
      const sanitized = text.replace(/\$\\rightarrow\$/g, '➔');
      let html = marked.parse(sanitized);
      html = html.replace(/\[(Fuente \d+|Anexo [A-Z]|Documento Principal)\]/g, '<span class="citation-badge">$1</span>');
      html = html.replace(/---\s*$/gm, '');
      html = html.replace(/(📌 Leyenda Técnica:[^<]*)/g, '<div class="leyenda-tecnica">$1</div>');
      appendSafeHTML(div, html);
    } else {
      div.textContent = text;
    }
  }
}

/**
 * Mensajes persistidos (sesión / historial): burbujas con formato y Markdown unificado.
 */
export function appendStoredChatMessage(roleRaw, text) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  const body = String(text ?? '').trim();
  if (!body) return;

  const empty = chatMessages.querySelector('.empty-chat');
  if (empty) empty.remove();

  const roleNorm = normalizeChatRole(roleRaw);
  const div = document.createElement('div');
  formatMessageHTML(body, roleNorm, div);

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function addChatMessage(role, text) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const empty = chatMessages.querySelector('.empty-chat');
  if (empty) empty.remove();

  const roleNorm = normalizeChatRole(role);
  const div = document.createElement('div');
  formatMessageHTML(text, roleNorm, div);

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function addTypingIndicator() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const div = document.createElement('div');
  div.className = 'message ai loading';
  div.id = 'typingIndicator';
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  for (let i = 0; i < 3; i++) {
    indicator.appendChild(document.createElement('span'));
  }
  div.appendChild(indicator);
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

export async function handleChat() {
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');
  if (!chatInput || !chatSend) return;

  const text = chatInput.value.trim();
  if (!text) return;

  if (!window.pdfDocs || window.pdfDocs.length === 0) {
    mostrarToast('⚠️ Carga al menos un PDF para continuar');
    return;
  }

  const pdfCtx = getCombinedContext();
  if (!pdfCtx.trim()) {
    mostrarToast('⚠️ El PDF aún no tiene texto listo. Espera un momento y vuelve a intentar.');
    return;
  }

  if (window.userLimits && window.userLimits.plan === 'free' && window.userLimits.chat_used >= 10) {
    chatInput.disabled = true;
    chatInput.classList.add('opacity-50', 'cursor-not-allowed');
    chatSend.disabled = true;
    chatSend.classList.add('opacity-50', 'cursor-not-allowed');
    showUpgradeModal('chat');
    return;
  }

  addChatMessage('user', text);
  chatInput.value = '';
  chatInput.disabled = true;
  chatSend.disabled = true;

  addTypingIndicator();

  const response = await window.askAI(text);

  removeTypingIndicator();
  addChatMessage('ai', response);

  await saveCurrentSession();

  chatInput.disabled = false;
  chatSend.disabled = false;
  chatInput.focus();
}

export function updateCard(i) {
  currentCard = i;
  const d = flashcardData[i];
  const cardQuestion = document.getElementById('cardQuestion');
  const cardAnswer = document.getElementById('cardAnswer');
  const cardIndex = document.getElementById('cardIndex');
  const flashcard = document.getElementById('flashcard');
  if (cardQuestion) cardQuestion.textContent = d.q;
  if (cardAnswer) cardAnswer.textContent = d.a;
  if (cardIndex) cardIndex.textContent = `${i + 1} / ${flashcardData.length}`;
  if (flashcard) flashcard.classList.remove('flipped');
  document.querySelectorAll('#cardDots .dot').forEach((dot, idx) => {
    dot.classList.toggle('active', idx === i);
  });
}

export function renderFlashcards(cards) {
  const normalized = normalizeFlashcards(cards);
  if (!normalized || normalized.length === 0) return;
  document.querySelectorAll('#cardDots .dot').forEach(d => d.remove());
  flashcardData.length = 0;
  normalized.forEach(c => flashcardData.push({ q: c.pregunta, a: c.respuesta }));
  const dotsContainer = document.getElementById('cardDots');
  if (dotsContainer) {
    flashcardData.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'dot' + (i === 0 ? ' active' : '');
      dot.dataset.i = i;
      dot.addEventListener('click', () => updateCard(parseInt(dot.dataset.i)));
      dotsContainer.appendChild(dot);
    });
  }
  updateCard(0);
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCorrectLetter(question) {
  return String(question.respuesta_correcta || '').trim().charAt(0).toUpperCase();
}

function getOptionLetter(option, index) {
  const match = String(option || '').trim().match(/^([A-D])\)/i);
  return match ? match[1].toUpperCase() : String.fromCharCode(65 + index);
}

function normalizeExamQuestion(question) {
  const options = Array.isArray(question.opciones) ? question.opciones.slice(0, 4) : [];
  if (options.length < 4) return null;
  return {
    pregunta: question.pregunta || 'Pregunta sin texto',
    opciones: options,
    respuesta_correcta: getCorrectLetter(question)
  };
}

function normalizeChatSessionId(id) {
  if (id == null || id === '') return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : id;
}

function sessionIdsMatch(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function normalizeExamQuestionsFromSession(raw) {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data) || data.length === 0) return [];
  return data.map(normalizeExamQuestion).filter(Boolean);
}

/** Recalcula y muestra palabras, páginas, caracteres y lectura estimada a partir de los PDF en memoria (p. ej. tras loadSession). */
function rehydrateSummaryMetrics() {
  const pdfs = window.pdfDocs || [];
  const statWords = document.getElementById('statWords');
  const statPages = document.getElementById('statPages');
  const statChars = document.getElementById('statChars');
  const statReadTime = document.getElementById('statReadTime');

  if (!pdfs.length) {
    if (statWords) statWords.textContent = '—';
    if (statPages) statPages.textContent = '—';
    if (statChars) statChars.textContent = '—';
    if (statReadTime) statReadTime.textContent = '—';
    return;
  }

  let totalPages = 0;
  let totalWords = 0;
  let totalChars = 0;
  for (const d of pdfs) {
    const content = typeof d.content === 'string' ? d.content : '';
    totalPages += Number(d.pages) || 0;
    totalWords += content.split(/\s+/).filter(Boolean).length;
    totalChars += content.length;
  }

  if (statWords) statWords.textContent = totalWords.toLocaleString('es-ES');
  if (statPages) statPages.textContent = totalPages.toLocaleString('es-ES');
  if (statChars) statChars.textContent = totalChars.toLocaleString('es-ES');
  if (statReadTime) statReadTime.textContent = Math.ceil(totalWords / 200) + ' min';
}

function persistExamProgress() {
  const capturedSessionId = window.currentSessionId;
  if (capturedSessionId == null || capturedSessionId === '') {
    return;
  }
  if (!examQuestions.length) return;
  const sessionIdStr = String(capturedSessionId);
  try {
    localStorage.setItem(
      PersistenceManager.getKey('exam_progress'),
      JSON.stringify({
        sessionId: sessionIdStr,
        examIndex,
        examAnswers,
      })
    );
  } catch (_) {}
}

function clearExamProgressStorage() {
  try {
    localStorage.removeItem(PersistenceManager.getKey('exam_progress'));
    localStorage.removeItem('astro_anon_exam_progress');
  } catch (_) {}
}

const LEGACY_EXAM_PROGRESS_KEY = 'astro_anon_exam_progress';

function readRawExamProgressBlob() {
  for (const key of [PersistenceManager.getKey('exam_progress'), LEGACY_EXAM_PROGRESS_KEY]) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

async function waitForSessionIdAfterLoad(expectedSessionId, maxMicrotaskTicks = 15) {
  for (let i = 0; i < maxMicrotaskTicks; i++) {
    if (window.currentSessionId != null && window.currentSessionId !== '') {
      return window.currentSessionId;
    }
    await new Promise((resolve) => queueMicrotask(resolve));
  }
  if (expectedSessionId != null && expectedSessionId !== '') {
    window.currentSessionId = normalizeChatSessionId(expectedSessionId);
    return window.currentSessionId;
  }
  return window.currentSessionId;
}

function readExamProgressForSession(sessionId, options = {}) {
  const silent = options.silent === true;
  if (sessionId == null || sessionId === '') return null;
  const sid = String(sessionId);

  const keysToTry = [PersistenceManager.getKey('exam_progress'), LEGACY_EXAM_PROGRESS_KEY];
  const tried = [];

  for (const key of keysToTry) {
    try {
      const raw = localStorage.getItem(key);
      tried.push({ key, hasRaw: Boolean(raw) });
      if (!raw) continue;
      const progress = JSON.parse(raw);
      if (!progress) continue;

      if (!sessionIdsMatch(progress.sessionId, sid)) {
        continue;
      }

      return {
        examIndex: Math.max(0, Number(progress.examIndex) || 0),
        examAnswers: Array.isArray(progress.examAnswers) ? progress.examAnswers : [],
      };
    } catch (e) {
      // Ignorar error de parseo
    }
  }

  return null;
}

function mountExamRecoveringState() {
  const examContent = document.getElementById('examContent');
  if (!examContent) return;
  examContent.replaceChildren();
  const p = document.createElement('p');
  p.className = 'exam-rehydrate-loader';
  p.style.cssText = 'text-align:center;padding:28px 16px;color:var(--text-muted);font-size:14px;';
  p.textContent = '⏳ Recuperando examen…';
  examContent.appendChild(p);
}

function paintExamPanelFromHydratedState() {
  if (!examQuestions.length) return;
  const examContent = document.getElementById('examContent');
  if (!examContent) return;

  if (examAnswers.length > examIndex) {
    examAnswers = examAnswers.slice(0, examIndex);
  }

  const tsRaw = localStorage.getItem(PersistenceManager.getKey('exam_start'));
  const ts = tsRaw != null && tsRaw !== '' ? Number(tsRaw) : NaN;
  examStartTime = Number.isFinite(ts) ? ts : null;

  if (examIndex >= examQuestions.length) {
    if (examAnswers.length >= examQuestions.length) {
      renderExamResults();
    } else {
      examIndex = Math.max(0, examQuestions.length - 1);
      renderExamQuestion();
      if (examStartTime) startExamTimer();
    }
    return;
  }

  renderExamQuestion();
  if (examStartTime) startExamTimer();
}

async function rehydrateExamAfterLoad(expectedSessionId) {
  await waitForSessionIdAfterLoad(expectedSessionId);

  const progress = readRawExamProgressBlob();
  if (!examQuestions.length) return;
  paintExamPanelFromHydratedState();
}

async function recoverExamQuestionsForCurrentSession() {
  const sid = window.currentSessionId;
  if (sid == null || sid === '') {
    ensureExamStartButtonAfterLoad();
    return;
  }
  const progress = readExamProgressForSession(sid, { silent: true });
  if (!progress) {
    ensureExamStartButtonAfterLoad();
    return;
  }
  try {
    const data = await getSession(sid);
    examQuestions = normalizeExamQuestionsFromSession(data.session?.exam);
    if (!examQuestions.length) {
      clearExamProgressStorage();
      ensureExamStartButtonAfterLoad();
      return;
    }
    examIndex = Math.min(progress.examIndex, examQuestions.length);
    examAnswers = progress.examAnswers;
    await rehydrateExamAfterLoad(sid);
  } catch (e) {
    console.error('[Exam] recoverExamQuestionsForCurrentSession', e);
    ensureExamStartButtonAfterLoad();
  }
}

/**
 * Tras re-render de pestañas PDF: si el usuario está en el tab Examen y hay progreso válido,
 * pinta la pregunta de inmediato (evita el flash del botón Iniciar).
 */
export function syncExamPanelAfterRenderTabs() {
  const active = document.querySelector('.tab-btn.active')?.dataset?.tab;
  if (active !== 'exam') return;

  const sid = window.currentSessionId;
  if (sid == null || sid === '') return;

  const progress = readExamProgressForSession(sid, { silent: true });
  if (!progress) return;

  if (examQuestions.length > 0) {
    const examContent = document.getElementById('examContent');
    if (examContent?.querySelector('#startExam')) {
      examContent.replaceChildren();
    }
    paintExamPanelFromHydratedState();
    return;
  }

  mountExamRecoveringState();
  void recoverExamQuestionsForCurrentSession();
}

/** Inserta el botón Iniciar solo si el panel de examen sigue vacío (evita pisar rehidratación o resultados). */
function ensureExamStartButtonAfterLoad() {
  const examContent = document.getElementById('examContent');
  if (!examContent) return;
  if (examContent.querySelector('.exam-card') || examContent.querySelector('.exam-results')) return;
  if (examContent.querySelector('#startExam')) return;

  const sid = window.currentSessionId;
  if (sid != null && sid !== '' && readExamProgressForSession(sid, { silent: true })) return;

  examContent.replaceChildren();
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 shadow-[0_0_15px_rgba(139,92,246,0.1)]';
  btn.id = 'startExam';
  btn.textContent = 'Iniciar Examen';
  examContent.appendChild(btn);
}

function renderExamProgressNode() {
  const container = document.createElement('div');
  container.className = 'exam-progress';
  examQuestions.forEach((_, i) => {
    const step = document.createElement('div');
    step.className = `step ${i < examIndex ? 'done' : i === examIndex ? 'active' : ''}`;
    step.textContent = i + 1;
    container.appendChild(step);
  });
  return container;
}

function renderExamQuestion() {
  if (examIndex >= examQuestions.length) {
    renderExamResults();
    return;
  }
  selectedExamOption = null;
  const q = examQuestions[examIndex];
  const examContent = document.getElementById('examContent');
  if (!examContent) return;

  examContent.replaceChildren();

  // Contenedor principal con Glassmorphism
  const card = document.createElement('div');
  card.className = 'exam-card backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 shadow-[0_0_15px_rgba(139,92,246,0.1)] p-6 rounded-xl';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

  const qNumber = document.createElement('div');
  qNumber.className = 'exam-question-number text-slate-300';
  qNumber.textContent = `Pregunta ${examIndex + 1} de ${examQuestions.length}`;

  const timer = document.createElement('div');
  timer.id = 'examTimer';
  timer.style.fontFamily = "'Space Grotesk',monospace";
  timer.style.fontSize = '14px';
  timer.style.color = 'var(--accent-cyan)';
  timer.style.minWidth = '60px';
  timer.style.textAlign = 'right';
  timer.textContent = '00:00';

  header.appendChild(qNumber);
  header.appendChild(timer);
  card.appendChild(header);

  const qText = document.createElement('div');
  qText.className = 'exam-question-text text-lg font-semibold text-white mb-4';
  qText.textContent = q.pregunta || q.question;
  card.appendChild(qText);

  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'exam-options flex flex-col gap-2';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-primary mt-4 backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 shadow-[0_0_15px_rgba(139,92,246,0.1)]';
  confirmBtn.id = 'confirmAnswer';
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Confirmar respuesta';

  const optionsArray = q.opciones || q.options || [];
  optionsArray.forEach((option) => {
    const btn = document.createElement('button');
    btn.className = 'exam-option p-3 rounded-lg text-left transition-all bg-slate-800/50 hover:bg-slate-700 border border-slate-600 text-slate-200';
    btn.type = 'button';
    btn.dataset.value = option;
    btn.textContent = option;

    btn.addEventListener('click', () => {
      selectedExamOption = btn.dataset.value;
      optionsContainer.querySelectorAll('.exam-option').forEach(opt => {
        opt.classList.remove('selected', 'border-purple-500', 'bg-purple-900/30');
      });
      btn.classList.add('selected', 'border-purple-500', 'bg-purple-900/30');
      confirmBtn.disabled = false;
    });

    optionsContainer.appendChild(btn);
  });

  card.appendChild(optionsContainer);

  const actions = document.createElement('div');
  actions.style.marginTop = '16px';
  actions.style.display = 'flex';
  actions.style.gap = '10px';
  actions.style.justifyContent = 'center';
  actions.style.flexWrap = 'wrap';
  actions.appendChild(confirmBtn);
  card.appendChild(actions);

  const feedbackDiv = document.createElement('div');
  feedbackDiv.id = 'examFeedback';
  card.appendChild(feedbackDiv);

  confirmBtn.addEventListener('click', handleExamAnswer);

  examContent.appendChild(renderExamProgressNode());
  examContent.appendChild(card);
}

function handleExamAnswer() {
  if (!selectedExamOption) return;
  const q = examQuestions[examIndex];
  
  let isCorrect = false;
  let correctValue = "";
  
  if (q.correctAnswer || q.respuesta_correcta) {
    const truth = q.correctAnswer || q.respuesta_correcta;
    isCorrect = (selectedExamOption.trim().toLowerCase() === truth.trim().toLowerCase() || selectedExamOption.startsWith(truth));
    correctValue = truth;
  }

  examAnswers.push({
    pregunta: q.pregunta || q.question,
    correcta: correctValue,
    usuario: selectedExamOption,
    acierto: isCorrect
  });
  persistExamProgress();

  document.querySelectorAll('.exam-option').forEach((btn) => {
    btn.disabled = true;
    btn.classList.remove('selected', 'border-purple-500', 'bg-purple-900/30');
    
    let btnIsCorrect = (btn.dataset.value.trim().toLowerCase() === correctValue.trim().toLowerCase() || btn.dataset.value.startsWith(correctValue));

    if (btnIsCorrect) {
      btn.classList.add('correct', 'border-green-500', 'bg-green-900/30', 'text-green-300');
    }
    if (btn.dataset.value === selectedExamOption && !isCorrect) {
      btn.classList.add('incorrect', 'border-red-500', 'bg-red-900/30', 'text-red-300');
    }
  });

  document.getElementById('confirmAnswer').disabled = true;
  const feedbackDiv = document.getElementById('examFeedback');
  if (feedbackDiv) {
    feedbackDiv.replaceChildren();
    
    const fbCard = document.createElement('div');
    fbCard.className = 'exam-feedback mt-4 p-4 rounded-lg bg-slate-800/80 border border-slate-700 backdrop-blur-md shadow-[0_0_15px_rgba(139,92,246,0.1)]';

    const score = document.createElement('div');
    score.className = `score font-bold text-lg ${isCorrect ? 'text-green-400' : 'text-red-400'}`;
    score.textContent = isCorrect ? 'Correcta' : 'Incorrecta';
    fbCard.appendChild(score);

    const fbText = document.createElement('div');
    fbText.className = 'fb-text text-slate-300 mt-2';
    fbText.textContent = isCorrect 
      ? 'Bien hecho. Esa era la opción correcta.' 
      : `Tu respuesta fue: ${selectedExamOption}. La respuesta correcta es: ${correctValue}.`;
    fbCard.appendChild(fbText);

    const btnWrapper = document.createElement('div');
    btnWrapper.style.marginTop = '12px';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 shadow-[0_0_15px_rgba(139,92,246,0.1)]';
    nextBtn.id = 'nextQuestion';
    nextBtn.textContent = examIndex < examQuestions.length - 1 ? 'Siguiente pregunta' : 'Ver resultados';
    btnWrapper.appendChild(nextBtn);
    fbCard.appendChild(btnWrapper);

    feedbackDiv.appendChild(fbCard);

    nextBtn.addEventListener('click', () => {
      examIndex++;
      persistExamProgress();
      renderExamQuestion();
    });
  }
}

function renderExamResults() {
  if (examTimerInterval) { clearInterval(examTimerInterval); examTimerInterval = null; }
  localStorage.removeItem(PersistenceManager.getKey('exam_start'));
  clearExamProgressStorage();

  const totalSeconds = examStartTime ? Math.floor((Date.now() - examStartTime) / 1000) : 0;
  const timerStr = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;

  const correctCount = examAnswers.filter(a => a.acierto).length;
  const wrongCount = examAnswers.length - correctCount;
  const examContent = document.getElementById('examContent');
  if (!examContent) return;

  examContent.replaceChildren();

  const resultsCard = document.createElement('div');
  resultsCard.className = 'exam-results backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 p-6 rounded-xl shadow-[0_0_15px_rgba(139,92,246,0.1)]';

  resultsCard.appendChild(renderExamProgressNode());

  const scoreDiv = document.createElement('div');
  scoreDiv.style.textAlign = 'center';
  scoreDiv.style.margin = '24px 0';
  
  const label = document.createElement('div');
  label.style.color = 'var(--text-muted)';
  label.style.fontSize = '14px';
  label.style.marginBottom = '4px';
  label.textContent = 'Puntaje final';
  scoreDiv.appendChild(label);

  const finalScore = document.createElement('div');
  finalScore.className = 'final-score text-4xl font-bold text-white';
  finalScore.textContent = `${correctCount}/${examQuestions.length}`;
  scoreDiv.appendChild(finalScore);

  const stats = document.createElement('div');
  stats.style.marginTop = '8px';
  stats.style.fontSize = '14px';
  stats.style.color = 'var(--text-secondary)';
  stats.textContent = `${correctCount} aciertos - ${wrongCount} errores · ${timerStr}`;
  scoreDiv.appendChild(stats);

  resultsCard.appendChild(scoreDiv);

  const summaryDiv = document.createElement('div');
  summaryDiv.style.marginTop = '20px';
  
  const h4 = document.createElement('h4');
  h4.style.marginBottom = '12px';
  h4.style.textAlign = 'left';
  h4.className = 'text-lg font-semibold text-slate-200';
  h4.textContent = 'Resumen de aciertos y errores';
  summaryDiv.appendChild(h4);

  examAnswers.forEach(a => {
    const item = document.createElement('div');
    item.className = 'result-item flex gap-3 p-3 bg-slate-800/50 rounded-lg mb-2 border border-slate-700';

    const icon = document.createElement('span');
    icon.className = `r-icon font-bold ${a.acierto ? 'text-green-500' : 'text-red-500'}`;
    icon.textContent = a.acierto ? 'OK' : 'X';
    item.appendChild(icon);

    const qSpan = document.createElement('span');
    qSpan.className = 'r-question text-slate-300 flex-1';
    qSpan.textContent = (a.pregunta || '').substring(0, 70) + '...';
    item.appendChild(qSpan);

    const ansSpan = document.createElement('span');
    ansSpan.style.fontWeight = '600';
    ansSpan.style.color = a.acierto ? '#22c55e' : '#ef4444';
    ansSpan.textContent = `${(a.usuario||'').substring(0,20)} / ${(a.correcta||'').substring(0,20)}`;
    item.appendChild(ansSpan);

    summaryDiv.appendChild(item);
  });

  resultsCard.appendChild(summaryDiv);

  const actions = document.createElement('div');
  actions.className = 'exam-actions mt-6 flex justify-center gap-4';
  
  const explainBtn = document.createElement('button');
  explainBtn.className = 'btn btn-primary backdrop-blur-xl bg-purple-900/40 border border-purple-700/50 shadow-[0_0_15px_rgba(139,92,246,0.2)] text-purple-200 hover:bg-purple-800/60';
  explainBtn.id = 'explainExamErrors';
  const errors = examAnswers.filter(a => !a.acierto);
  if (errors.length === 0) {
    explainBtn.textContent = '✨ ¡Felicidades! 100% aciertos';
    explainBtn.disabled = true;
    explainBtn.style.opacity = '0.7';
  } else {
    explainBtn.textContent = '✨ Explicar errores con IA';
  }
  actions.appendChild(explainBtn);

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 shadow-[0_0_15px_rgba(139,92,246,0.1)]';
  backBtn.id = 'backToExam';
  backBtn.textContent = 'Volver a intentarlo';
  actions.appendChild(backBtn);

  resultsCard.appendChild(actions);
  examContent.appendChild(resultsCard);

  explainBtn.addEventListener('click', () => {
    const errors = examAnswers.filter(a => !a.acierto);
    if (errors.length === 0) return;

    let promptText = `Hola, acabo de terminar mi examen de AeroLex AI y tuve algunos errores. Me gustaría que me explicaras de forma didáctica por qué mis respuestas son incorrectas y cuál es la lógica de la respuesta correcta.\n\n`;
    promptText += `Aquí están las preguntas que fallé:\n\n`;
    errors.forEach((err, idx) => {
      promptText += `❌ **Pregunta ${idx + 1}:** ${err.pregunta}\n`;
      promptText += `   * Mi respuesta fue: "${err.usuario}"\n`;
      promptText += `   * La respuesta correcta es: "${err.correcta}"\n\n`;
    });
    promptText += `Por favor, ayúdame a entender estos conceptos paso a paso de manera amigable (como un tutor espacial experto).`;

    const chatTabBtn = document.querySelector('.tab-btn[data-tab="chat"]');
    if (chatTabBtn) {
      chatTabBtn.click();
    }

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = promptText;
      void handleChat();
    }
  });

  saveCurrentSession();

  backBtn.addEventListener('click', () => {
    examQuestions = [];
    examIndex = 0;
    examAnswers = [];
    selectedExamOption = null;
    clearExamProgressStorage();
    ensureExamStartButtonAfterLoad();
  });
}

export async function handleStartExam() {
  if (!window.pdfDocs || window.pdfDocs.length === 0) {
    mostrarToast('⚠️ Carga al menos un PDF para continuar');
    return;
  }

  if (window.userLimits && window.userLimits.plan === 'free' && window.userLimits.exam_used >= 3) {
    showUpgradeModal('exam');
    return;
  }

  try {
    const data = await incrementCounter('exam');
    if (!data.allowed) {
      showUpgradeModal('exam');
      return;
    }
    if (window.userLimits) {
      window.userLimits.exam_used = data.used;
      updatePlanIndicator();
    }
  } catch (e) { console.error('Increment error:', e); }

  const triggerBtn = document.getElementById('startExam');
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = 'Generando examen...';
  }

  try {
    const textContext = getCombinedContext();
    const data = await generateExamInteractive(textContext, window.currentSessionId);
    
    let parsedQuestions = data.questions || data.preguntas || [];
    examQuestions = parsedQuestions.filter(Boolean).slice(0, 5);
    
    if (examQuestions.length < 5) throw new Error('Examen sin 5 preguntas de opcion multiple');
    
    examIndex = 0;
    examAnswers = [];
    selectedExamOption = null;
    clearExamProgressStorage();

    examStartTime = Date.now();
    localStorage.setItem(PersistenceManager.getKey('exam_start'), String(examStartTime));
    startExamTimer();

    persistExamProgress();
    renderExamQuestion();
  } catch (e) {
    console.error('Start exam error:', e);
    alert('Error al generar el examen interactivo. Intenta de nuevo.');
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = 'Iniciar Examen';
    }
  }
}

// ===== SESSION MANAGEMENT =====

export async function loadSessions() {
  if (!window.userLimits?.google_id) {
    await new Promise(resolve => setTimeout(resolve, 800));
    if (!window.userLimits?.google_id) {
      return;
    }
  }
  
  try {
    const data = await fetchSessions();
    const sessions = data.sessions || [];
    renderSessionList(sessions);

    if (!window.currentSessionId) {
      import('./persistence.js').then(({ PersistenceManager }) => {
        const lastId = localStorage.getItem(PersistenceManager.getKey('last_session_id'));
        if (lastId) {
          const idNum = Number(lastId);
          if (sessions.some(s => sessionIdsMatch(s.id, idNum))) {
            const toolPanel = document.getElementById('toolPanel');
            if (toolPanel) toolPanel.classList.add('workspace-loading');
            loadSession(idNum).finally(() => {
              if (toolPanel) toolPanel.classList.remove('workspace-loading');
            });
          } else {
            localStorage.removeItem(PersistenceManager.getKey('last_session_id'));
          }
        }
      });
    }
  } catch (e) {
    console.error('Load sessions error:', e);
  }
}

export function renderSessionList(sessions) {
  const sessionList = document.getElementById('sessionList');
  if (!sessionList) return;

  if (!sessions.length) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'session-empty';
    emptyDiv.textContent = 'Sin conversaciones previas';
    sessionList.replaceChildren(emptyDiv);
    return;
  }

  const nodes = sessions.map(s => {
    const date = new Date(s.updated_at || s.created_at).toLocaleDateString('es-ES', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    const isActive = sessionIdsMatch(s.id, window.currentSessionId);
    
    const div = document.createElement('div');
    div.className = `session-item ${isActive ? 'active' : ''}`;
    div.dataset.id = s.id;
    
    const title = document.createElement('div');
    title.className = 'session-title';
    title.textContent = s.title || 'Chat';
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'session-date';
    dateDiv.textContent = date;
    
    div.appendChild(title);
    div.appendChild(dateDiv);
    
    if (s.pdfs?.length) {
      const pdfs = document.createElement('div');
      pdfs.className = 'session-pdfs';
      
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'w-4 h-4 mr-1 inline-block text-gray-400');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      
      const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path1.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
      const polyline1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline1.setAttribute('points', '14 2 14 8 20 8');
      const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line1.setAttribute('x1', '16'); line1.setAttribute('y1', '13'); line1.setAttribute('x2', '8'); line1.setAttribute('y2', '13');
      const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line2.setAttribute('x1', '16'); line2.setAttribute('y1', '17'); line2.setAttribute('x2', '8'); line2.setAttribute('y2', '17');
      const polyline2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline2.setAttribute('points', '10 9 9 9 8 9');
      
      svg.appendChild(path1);
      svg.appendChild(polyline1);
      svg.appendChild(line1);
      svg.appendChild(line2);
      svg.appendChild(polyline2);
      
      pdfs.appendChild(svg);
      pdfs.appendChild(document.createTextNode(`${s.pdfs.length} PDF(s)`));
      div.appendChild(pdfs);
    }
    
    const btn = document.createElement('button');
    btn.className = 'session-delete';
    btn.dataset.id = s.id;
    btn.textContent = '✕';
    div.appendChild(btn);
    
    return div;
  });
  
  sessionList.replaceChildren(...nodes);
}

export async function loadSession(id) {
  if (window.isLoadingSession) return;
  window.isLoadingSession = true;
  try {
    const data = await getSession(id);
    if (!data.session) {
      window.isLoadingSession = false;
      return;
    }
    const session = data.session;

    const loadedSessionId = normalizeChatSessionId(session.id);
    window.currentSessionId = loadedSessionId;

    const examProgress = readExamProgressForSession(loadedSessionId, { silent: true });
    const activeTabEarly = document.querySelector('.tab-btn.active')?.dataset?.tab;
    if (activeTabEarly === 'exam' && examProgress) {
      mountExamRecoveringState();
    }

    window.pdfDocs = session.pdfs || [];
    const savedDoc = localStorage.getItem('aerolex_active_doc');
    if (savedDoc && window.pdfDocs.some(d => String(d.id) === String(savedDoc))) {
      window.activeDocId = savedDoc;
    } else {
      window.activeDocId = window.pdfDocs.length > 0 ? window.pdfDocs[0].id : null;
    }
    window.flashcardsData = session.flashcards || null;
    window.summaryData = session.summary || null;
    window.planData = session.study_plan || null;
    window.currentExamData = session.exam || null;
    
    examQuestions = normalizeExamQuestionsFromSession(session.exam);
    examIndex = 0;
    examAnswers = [];
    if (examProgress && examQuestions.length) {
      examIndex = Math.min(examProgress.examIndex, examQuestions.length);
      examAnswers = examProgress.examAnswers;
    }

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.replaceChildren();
      const msgs = Array.isArray(session.messages) ? session.messages : [];
      if (msgs.length) {
        msgs.forEach((m) => {
          const raw = typeof m === 'string' ? { role: 'user', content: m } : m;
          const body = String(raw?.content ?? raw?.text ?? '').trim();
          if (!body) return;
          appendStoredChatMessage(raw?.role, body);
        });
      } else {
        const empty = document.createElement('div');
        empty.className = 'empty-chat';
        const icon = document.createElement('div');
        icon.className = 'icon';
        
        const img = document.createElement('img');
        img.src = 'assets/AeroLexAI_Ship_Trans.png';
        img.className = 'h-16 w-auto mx-auto opacity-80 object-contain';
        img.alt = 'AeroLex AI';
        icon.appendChild(img);
        
        const p = document.createElement('p');
        p.textContent = 'Chat cargado de sesión';
        empty.appendChild(icon);
        empty.appendChild(p);
        chatMessages.appendChild(empty);
      }
    }

    const toolPanel = document.getElementById('toolPanel');
    const dropZone = document.getElementById('dropZone');
    if (window.pdfDocs.length > 0) {
      if (dropZone) dropZone.classList.add('collapsed');
      if (toolPanel) toolPanel.style.display = 'flex';
    }

    const { renderTabs } = await import('./ui-components.js');
    renderTabs();
    rehydrateSummaryMetrics();

    if (window.flashcardsData) {
      renderFlashcards(window.flashcardsData);
      document.getElementById('exportFlashcards').style.display = 'inline-block';
      document.getElementById('exportAnkiCSV').style.display = 'inline-block';
    }
    if (window.summaryData) {
      const summaryText = document.getElementById('summaryText');
      renderSummaryText(summaryText, window.summaryData.text);
      document.getElementById('exportSummary').style.display = 'inline-block';
    }
    if (window.planData) {
      const planBody = document.getElementById('planBody');
      renderPlanTable(planBody, window.planData.items);
      document.getElementById('exportPlan').style.display = 'inline-block';
    }

    updateExportAllButton();
    await loadSessions();

    if (examQuestions.length) {
      await rehydrateExamAfterLoad(loadedSessionId);
      syncExamPanelAfterRenderTabs();
    } else {
      const orphan = readExamProgressForSession(loadedSessionId, { silent: true });
      if (orphan) {
        mountExamRecoveringState();
        try {
          const refetch = await getSession(loadedSessionId);
          examQuestions = normalizeExamQuestionsFromSession(refetch.session?.exam);
          if (examQuestions.length) {
            examIndex = Math.min(orphan.examIndex, examQuestions.length);
            examAnswers = orphan.examAnswers;
            await rehydrateExamAfterLoad(loadedSessionId);
            syncExamPanelAfterRenderTabs();
          } else {
            clearExamProgressStorage();
            const examPanel = document.getElementById('examContent');
            if (examPanel) examPanel.replaceChildren();
            ensureExamStartButtonAfterLoad();
          }
        } catch (err) {
          console.error('[Exam] Refetch sesión para examen', err);
          clearExamProgressStorage();
          const examPanel = document.getElementById('examContent');
          if (examPanel) examPanel.replaceChildren();
          ensureExamStartButtonAfterLoad();
        }
      } else {
        const examPanel = document.getElementById('examContent');
        if (examPanel) examPanel.replaceChildren();
        ensureExamStartButtonAfterLoad();
      }
    }
  } catch (e) {
    console.error('Load session error:', e);
  } finally {
    window.isLoadingSession = false;
  }
}

export function newSession() {
  window.currentSessionId = null;
  import('./persistence.js').then(({ PersistenceManager }) => {
    localStorage.removeItem(PersistenceManager.getKey('last_session_id'));
  });
  window.pdfDocs = [];
  window.activeDocId = null;
  window.flashcardsData = null;
  window.summaryData = null;
  window.planData = null;
  examQuestions = [];
  examIndex = 0;
  examAnswers = [];
  selectedExamOption = null;
  clearExamProgressStorage();

  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.replaceChildren();
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-chat';
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'icon';
    const img = document.createElement('img');
    img.src = 'assets/AeroLexAI_Ship_Trans.png';
    img.className = 'h-20 w-auto mx-auto opacity-70 object-contain';
    img.alt = 'AeroLex AI';
    iconDiv.appendChild(img);
    
    const p = document.createElement('p');
    p.textContent = 'Carga un PDF para comenzar';
    
    emptyDiv.appendChild(iconDiv);
    emptyDiv.appendChild(p);
    chatMessages.appendChild(emptyDiv);
  }
  document.getElementById('summaryText')?.replaceChildren();
  document.getElementById('planBody')?.replaceChildren();
  document.getElementById('planSubject').value = '';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 7);
  document.getElementById('planDate').value = tomorrow.toISOString().split('T')[0];
  document.getElementById('exportFlashcards').style.display = 'none';
  document.getElementById('exportAnkiCSV').style.display = 'none';
  document.getElementById('exportSummary').style.display = 'none';
  document.getElementById('exportPlan').style.display = 'none';
  const examContent = document.getElementById('examContent');
  if (examContent) {
    examContent.replaceChildren();
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 shadow-[0_0_15px_rgba(139,92,246,0.1)]';
    btn.id = 'startExam';
    btn.textContent = 'Iniciar Examen';
    examContent.appendChild(btn);
  }
  document.getElementById('dropZone').classList.remove('collapsed');
  document.getElementById('toolPanel').style.display = 'none';
  updateExportAllButton();
  loadSessions();
}

export async function deleteSession(id) {
  try {
    await apiDeleteSession(id);
    if (sessionIdsMatch(window.currentSessionId, id)) {
      newSession();
    } else {
      loadSessions();
    }
  } catch (e) {
    console.error('Delete session error:', e);
  }
}

export async function saveCurrentSession() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const messages = [];
  chatMessages.querySelectorAll('.message:not(.system):not(.loading)').forEach(el => {
    const role = el.classList.contains('user') ? 'user' : 'ai';
    const text = el.dataset.rawContent || el.textContent || '';
    if (text.trim()) messages.push({ role, content: text.trim() });
  });
  if (messages.length === 0) return;

  clearTimeout(saveDebounceTimer);
  
  // Capture state synchronously to avoid race conditions if the user switches sessions
  const targetSessionId = window.currentSessionId;
  const targetDocs = window.pdfDocs ? [...window.pdfDocs] : [];
  const targetFlashcards = window.flashcardsData ? [...window.flashcardsData] : [];
  const targetSummary = window.summaryData ? { ...window.summaryData } : null;
  const targetPlan = window.planData ? { ...window.planData } : null;
  const targetExam = examQuestions ? [...examQuestions] : [];
  const firstPdfName = targetDocs?.[0]?.name || 'Documento';

  saveDebounceTimer = setTimeout(async () => {
    const payload = {
      title: firstPdfName,
      messages,
      pdfs: targetDocs,
      flashcards: targetFlashcards,
      summary: targetSummary,
      exam: targetExam,
      study_plan: targetPlan,
    };

    try {
      if (targetSessionId) {
        await updateSession(targetSessionId, payload);
      } else {
        const data = await createSession(payload);
        window.currentSessionId = normalizeChatSessionId(data.id);
      }
      import('./persistence.js').then(({ PersistenceManager }) => {
        localStorage.setItem(PersistenceManager.getKey('last_session_id'), window.currentSessionId);
      });
      loadSessions();
    } catch (e) {
      console.error('Save session error:', e);
    }
  }, 1500);
}

// ===== HISTORY (localStorage) =====

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

export function saveToHistory(pdfName, messages) {
  if (!pdfName || messages.length < 2) return;
  const history = getHistory();
  history.unshift({
    id: Date.now(),
    pdfName,
    date: new Date().toISOString(),
    messages: messages.slice(0, 20)
  });
  if (history.length > 10) history.length = 10;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

export function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  const history = getHistory();

  if (history.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'history-empty';
    emptyDiv.textContent = 'Aún no hay sesiones guardadas.\nLas conversaciones del chat se guardan automáticamente.';
    emptyDiv.style.whiteSpace = 'pre-line';
    list.replaceChildren(emptyDiv);
    return;
  }

  const nodes = history.map(s => {
    const date = new Date(s.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const preview = s.messages.length > 0 ? s.messages[0].substring(0, 80) : '';
    
    const div = document.createElement('div');
    div.className = 'history-item';
    div.dataset.id = s.id;
    
    const title = document.createElement('div');
    title.className = 'h-name';
    
    const svg1 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg1.setAttribute("class", "w-4 h-4 mr-1 inline-block text-blue-400");
    svg1.setAttribute("viewBox", "0 0 24 24");
    svg1.setAttribute("fill", "none");
    svg1.setAttribute("stroke", "currentColor");
    svg1.setAttribute("stroke-width", "2");
    svg1.setAttribute("stroke-linecap", "round");
    svg1.setAttribute("stroke-linejoin", "round");
    const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path1.setAttribute("d", "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20");
    svg1.appendChild(path1);
    title.appendChild(svg1);
    title.appendChild(document.createTextNode(s.pdfName));
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'h-date';
    dateDiv.textContent = date;
    
    div.appendChild(title);
    div.appendChild(dateDiv);
    
    if (preview) {
      const prevDiv = document.createElement('div');
      prevDiv.className = 'h-preview';
      
      const svg2 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg2.setAttribute("class", "w-3 h-3 mr-1 inline-block text-gray-500");
      svg2.setAttribute("viewBox", "0 0 24 24");
      svg2.setAttribute("fill", "none");
      svg2.setAttribute("stroke", "currentColor");
      svg2.setAttribute("stroke-width", "2");
      svg2.setAttribute("stroke-linecap", "round");
      svg2.setAttribute("stroke-linejoin", "round");
      const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path2.setAttribute("d", "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z");
      svg2.appendChild(path2);
      prevDiv.appendChild(svg2);
      prevDiv.appendChild(document.createTextNode(`"${preview}..."`));
      div.appendChild(prevDiv);
    }
    return div;
  });

  list.replaceChildren(...nodes);

  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id);
      restoreSession(id);
    });
  });
}

export function restoreSession(id) {
  const history = getHistory();
  const session = history.find(s => s.id === id);
  if (!session) return;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="chat"]').classList.add('active');
  document.getElementById('tab-chat').classList.add('active');

  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.replaceChildren();
    const list = Array.isArray(session.messages) ? session.messages : [];
    list.forEach((entry, idx) => {
      if (typeof entry === 'string') {
        const role = idx % 2 === 0 ? 'user' : 'ai';
        appendStoredChatMessage(role, entry);
      } else if (entry && typeof entry === 'object') {
        const body = String(entry.content ?? entry.text ?? '').trim();
        if (body) appendStoredChatMessage(entry.role, body);
      }
    });
    if (!chatMessages.querySelector('.message')) {
      const empty = document.createElement('div');
      empty.className = 'empty-chat';
      const icon = document.createElement('div');
      icon.className = 'icon';
      
      const img = document.createElement('img');
      img.src = 'assets/AeroLexAI_Ship_Trans.png';
      img.className = 'h-16 w-auto mx-auto opacity-80 object-contain';
      img.alt = 'AeroLex AI';
      icon.appendChild(img);
      
      const p = document.createElement('p');
      p.textContent = 'Historial cargado';
      empty.appendChild(icon);
      empty.appendChild(p);
      chatMessages.appendChild(empty);
    }
  }
  closeHistoryPanel();
}

export function closeHistoryPanel() {
  document.getElementById('historyPanel')?.classList.remove('active');
  document.getElementById('historyOverlay')?.classList.remove('active');
}

// ===== STORAGE RESTORE =====

export function restoreFromStorage() {
  // If user is authenticated, skip legacy localStorage restoration to prevent race conditions and duplicate messages
  if (window.userLimits?.google_id || document.body.classList.contains('authenticated')) {
    return;
  }

  let restored = false;

  const chatData = loadFromStorage('chat');
  if (chatData && chatData.length > 0) {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      const separator = document.createElement('div');
      separator.className = 'session-separator';
      separator.textContent = '── Sesión anterior ──';
      separator.style.cssText = 'text-align:center;color:var(--text-muted);font-size:12px;margin:12px 0;opacity:0.6;';
      chatMessages.appendChild(separator);
      chatData.forEach((msg) => {
        if (!msg) return;
        appendStoredChatMessage(msg.role, msg.text ?? msg.content ?? '');
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
      restored = true;
    }
  }

  const flashcards = loadFromStorage('flashcards');
  if (flashcards && flashcards.length > 0) {
    window.flashcardsData = flashcards;
    renderFlashcards(flashcards);
    document.getElementById('exportFlashcards').style.display = 'inline-block';
    document.getElementById('exportAnkiCSV').style.display = 'inline-block';
    updateExportAllButton();
    restored = true;
  }

  const plan = loadFromStorage('plan');
  if (plan && plan.items && plan.items.length > 0) {
    window.planData = plan;
    const planSubject = document.getElementById('planSubject');
    if (planSubject) planSubject.value = plan.subject || '';
    const planDate = document.getElementById('planDate');
    if (planDate) planDate.value = plan.examDate || '';

    const planBody = document.getElementById('planBody');
    if (planBody) renderPlanTable(planBody, plan.items);

    document.getElementById('exportPlan').style.display = 'inline-block';
    updateExportAllButton();
    restored = true;
  }

  const summary = loadFromStorage('summary');
  if (summary && summary.text) {
    window.summaryData = summary;
    const summaryText = document.getElementById('summaryText');
    if (summaryText) {
      renderSummaryText(summaryText, summary.text);
    }
    document.getElementById('exportSummary').style.display = 'inline-block';
    updateExportAllButton();
    restored = true;
  }

  if (restored) {
    mostrarToast('✅ Tu sesión anterior fue restaurada');
  }
}

export function initCardClickHandlers() {
  const flashcard = document.getElementById('flashcard');
  const prevCardBtn = document.getElementById('prevCard');
  const nextCardBtn = document.getElementById('nextCard');

  if (flashcard) {
    flashcard.addEventListener('click', () => {
      const willBeFlipped = !flashcard.classList.contains('flipped');
      flashcard.classList.toggle('flipped');
      if (willBeFlipped) {
        import('./ui-components.js').then(m => m.incrementCardsReviewed());
      }
    });
  }
  if (prevCardBtn) prevCardBtn.addEventListener('click', () => { if (currentCard > 0) updateCard(currentCard - 1); });
  if (nextCardBtn) nextCardBtn.addEventListener('click', () => { if (currentCard < flashcardData.length - 1) updateCard(currentCard + 1); });

  document.querySelectorAll('#cardDots .dot').forEach((dot) => {
    dot.addEventListener('click', () => updateCard(parseInt(dot.dataset.i)));
  });
  updateCard(0);
}

// ===== FEATURE GENERATORS =====

export function initFlashcardGenerator() {
  const genFlashcards = document.getElementById('genFlashcards');
  if (!genFlashcards) return;

  genFlashcards.addEventListener('click', async () => {
    if (!window.pdfDocs || window.pdfDocs.length === 0) {
      mostrarToast('⚠️ Carga al menos un PDF para continuar');
      return;
    }
    genFlashcards.disabled = true;
    genFlashcards.textContent = '⏳ Generando...';
    showFlashcardsSkeleton();
    try {
      const data = await apiFlashcards(getCombinedContext(), window.currentSessionId);
      const normalized = normalizeFlashcards(data.cards);
      if (normalized && normalized.length > 0) {
        renderFlashcards(normalized);
        window.flashcardsData = normalized;
        saveToStorage('flashcards', window.flashcardsData);
        document.getElementById('exportFlashcards').style.display = 'inline-block';
        document.getElementById('exportAnkiCSV').style.display = 'inline-block';
        updateExportAllButton();
        saveCurrentSession();
      }
    } catch (e) {
      console.error('Flashcards error:', e);
      alert('⚠️ Error al generar flashcards. Intenta de nuevo.');
    }
    genFlashcards.disabled = false;
    genFlashcards.textContent = 'Generar Flashcards';
  });
}

export function initPlanGenerator() {
  const createPlanBtn = document.getElementById('createPlan');
  const planSubject = document.getElementById('planSubject');
  const planDate = document.getElementById('planDate');
  if (!createPlanBtn) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 7);
  if (planDate) planDate.value = tomorrow.toISOString().split('T')[0];

  createPlanBtn.addEventListener('click', async () => {
    if (!window.pdfDocs || window.pdfDocs.length === 0) {
      mostrarToast('⚠️ Carga al menos un PDF para continuar');
      return;
    }
    const subject = planSubject?.value.trim() || 'Materia';
    const examDate = planDate?.value;
    if (!examDate) { alert('Por favor selecciona una fecha para el examen.'); return; }

    const tbody = document.getElementById('planBody');
    if (tbody) showPlanSkeleton(tbody);

    createPlanBtn.disabled = true;
    createPlanBtn.textContent = '⏳ Generando...';

    try {
      const data = await createStudyPlan(getCombinedContext(), subject, examDate, window.currentSessionId);
      if (data.error) {
        alert(data.error);
        if (tbody) tbody.replaceChildren();
        createPlanBtn.disabled = false;
        createPlanBtn.textContent = 'Crear Plan';
        return;
      }

      if (tbody) tbody.replaceChildren();

      if (data.fallback && data.planTexto) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.style.cssText = 'white-space:pre-wrap;color:var(--text-secondary);font-size:13px;line-height:1.7;padding:16px;';
        td.textContent = data.planTexto;
        tr.appendChild(td);
        tbody?.appendChild(tr);
        window.planData = { items: [], subject, examDate, fallback: true, text: data.planTexto };
        saveToStorage('plan', window.planData);
      } else if (data.plan && data.plan.length) {
        window.planData = { items: data.plan, subject, examDate };
        saveToStorage('plan', window.planData);
        renderPlanTable(tbody, data.plan);
      }

      if (window.planData?.items?.length > 0) {
        document.getElementById('exportPlan').style.display = 'inline-block';
        updateExportAllButton();
      }
      saveCurrentSession();
      const planMsg = document.querySelector('.study-plan-section p:last-child');
      if (planMsg) planMsg.textContent = `✅ Plan de estudio para "${subject}" — ${data.diasRestantes} días hasta el examen.`;
    } catch (e) {
      console.error('Plan error:', e);
      if (tbody) tbody.replaceChildren();
      alert('⚠️ Error al generar el plan de estudio. Intenta de nuevo.');
    }

    createPlanBtn.disabled = false;
    createPlanBtn.textContent = 'Crear Plan';
  });
}

export function initSummaryGenerator() {
  const genSummary = document.getElementById('genSummary');
  const summaryText = document.getElementById('summaryText');
  if (!genSummary || !summaryText) return;

  genSummary.addEventListener('click', async () => {
    if (!window.pdfDocs || window.pdfDocs.length === 0) {
      mostrarToast('⚠️ Carga al menos un PDF para continuar');
      return;
    }

    genSummary.disabled = true;
    genSummary.textContent = '⏳ Resumiendo...';
    showSummarySkeleton(summaryText);

    try {
      const data = await generateSummary(getCombinedContext(), window.currentSessionId);
      renderSummaryText(summaryText, data.text);
      window.summaryData = { text: data.text, pdfs: window.pdfDocs.map(d => d.name) };
      saveToStorage('summary', window.summaryData);
      document.getElementById('exportSummary').style.display = 'inline-block';
      updateExportAllButton();
      saveCurrentSession();
    } catch (e) {
      console.error('Summary error:', e);
      summaryText.replaceChildren();
      const p = document.createElement('p');
      p.style.color = 'var(--text-muted)';
      p.textContent = '⚠️ Error al generar el resumen. Intenta de nuevo.';
      summaryText.appendChild(p);
    }

    genSummary.disabled = false;
    genSummary.textContent = 'Generar Resumen';
  });
}

export function initExamMode() {
  const root = document.getElementById('examContent');
  if (!root || examStartDelegationBound) return;
  examStartDelegationBound = true;
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('#startExam');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    handleStartExam();
  });
}