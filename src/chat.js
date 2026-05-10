import {
  sendChat,
  generateFlashcards as apiFlashcards,
  createStudyPlan,
  generateSummary,
  generateExam,
  fetchSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession as apiDeleteSession,
  incrementCounter,
} from './api.js';
import { updatePlanIndicator, showUpgradeModal, saveToStorage, loadFromStorage } from './auth.js';
import { getCombinedContext, updateExportAllButton, mostrarToast } from './ui-components.js';

let saveDebounceTimer = null;
const HISTORY_KEY = 'aerolex_history';
let currentCard = 0;
let examQuestions = [];
let examIndex = 0;
let examAnswers = [];
let selectedExamOption = null;

const flashcardData = [
  { q: '¿Qué es el aprendizaje supervisado?', a: 'Un tipo de ML donde el modelo se entrena con datos etiquetados.' },
  { q: '¿Qué es una red neuronal?', a: 'Modelo computacional inspirado en el cerebro, compuesto por capas de neuronas interconectadas.' },
  { q: '¿Qué es el overfitting?', a: 'Cuando el modelo aprende demasiado bien los datos de entrenamiento y falla en datos nuevos.' },
];

window.askAI = async function (prompt) {
  try {
    const data = await sendChat(prompt, getCombinedContext());
    if (data.chat_used !== undefined && window.userLimits) {
      window.userLimits.chat_used = data.chat_used;
      updatePlanIndicator();
    }
    saveCurrentSession();
    return data.text;
  } catch (err) {
    console.error('askAI error:', err);
    return '⚠️ Lo siento, hubo un error al conectar con la IA. Por favor intenta de nuevo.';
  }
};

export function addChatMessage(role, text) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const empty = chatMessages.querySelector('.empty-chat');
  if (empty) empty.remove();

  const div = document.createElement('div');
  if (role === 'system') {
    div.className = 'message system self-center bg-transparent border-none text-[#606088] text-xs px-3 py-1.5 text-center';
    div.textContent = text;
  } else if (role === 'user') {
    div.className = 'message user self-end bg-gradient-to-br from-[#6c3bd2] to-[#4f46e5] text-white rounded-br-md max-w-[70%] md:max-w-[60%] px-3 py-3 rounded-2xl text-sm leading-relaxed animate-[messageIn_0.3s_ease] whitespace-pre-wrap';
    div.textContent = text;
  } else {
    div.className = 'message ai self-start bg-[#12123a] text-[#e8e8f0] border border-[#1e1e4a] rounded-bl-md max-w-[85%] px-3 py-3 rounded-2xl text-sm leading-relaxed animate-[messageIn_0.3s_ease] whitespace-pre-wrap';
    if (typeof marked !== 'undefined') {
      let html = marked.parse(text);
      html = html.replace(/\[(Fuente \d+|Anexo [A-Z]|Documento Principal)\]/g, '<span class="citation-badge">$1</span>');
      html = html.replace(/---\s*$/gm, '');
      html = html.replace(/(📌 Leyenda Técnica:[^<]*)/g, '<div class="leyenda-tecnica">$1</div>');
      div.innerHTML = html;
    } else {
      div.textContent = text;
    }
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function addTypingIndicator() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const div = document.createElement('div');
  div.className = 'message ai loading self-start bg-transparent border-none rounded-2xl text-sm leading-relaxed whitespace-pre-wrap px-3 py-3';
  div.id = 'typingIndicator';
  div.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
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

  if (window.userLimits && window.userLimits.plan === 'free' && window.userLimits.chat_used >= 10) {
    showUpgradeModal('chat');
    return;
  }

  addChatMessage('user', text);
  chatInput.value = '';
  chatInput.disabled = true;
  chatSend.disabled = true;

  addTypingIndicator();

  const docsInfo = window.pdfDocs.map(d => d.name).join(', ');
  const systemBlock = `El usuario ha cargado ${window.pdfDocs.length} documento(s): ${docsInfo}. Cuando respondas, indica entre corchetes de qué documento viene cada información. Ejemplo: [nombre.pdf]`;
  const contextPrompt = `${systemBlock}\n\nContexto del PDF:\n${getCombinedContext().slice(0, 4000)}\n\nPregunta: ${text}`;
  const response = await window.askAI(contextPrompt);

  removeTypingIndicator();
  addChatMessage('ai', response);

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
  if (!cards || cards.length === 0) return;
  document.querySelectorAll('#cardDots .dot').forEach(d => d.remove());
  flashcardData.length = 0;
  cards.forEach(c => flashcardData.push({ q: c.pregunta, a: c.respuesta }));
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

function renderExamProgress() {
  let html = '<div class="exam-progress">';
  examQuestions.forEach((_, i) => {
    const cls = i < examIndex ? 'done' : i === examIndex ? 'active' : '';
    html += `<div class="step ${cls}">${i + 1}</div>`;
  });
  html += '</div>';
  return html;
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

  const optionsHtml = q.opciones.map((option, i) => {
    const letter = getOptionLetter(option, i);
    return `<button class="exam-option" type="button" data-letter="${letter}">${escapeHTML(option)}</button>`;
  }).join('');

  examContent.innerHTML = `
    ${renderExamProgress()}
    <div class="exam-card">
      <div class="exam-question-number">Pregunta ${examIndex + 1} de ${examQuestions.length}</div>
      <div class="exam-question-text">${escapeHTML(q.pregunta)}</div>
      <div class="exam-options">${optionsHtml}</div>
      <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-primary" id="confirmAnswer" disabled>Confirmar respuesta</button>
      </div>
      <div id="examFeedback"></div>
    </div>
  `;

  const confirmBtn = document.getElementById('confirmAnswer');
  document.querySelectorAll('.exam-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedExamOption = btn.dataset.letter;
      document.querySelectorAll('.exam-option').forEach((optionBtn) => optionBtn.classList.remove('selected'));
      btn.classList.add('selected');
      confirmBtn.disabled = false;
    });
  });
  confirmBtn.addEventListener('click', handleExamAnswer);
}

function handleExamAnswer() {
  if (!selectedExamOption) return;
  const q = examQuestions[examIndex];
  const correctLetter = getCorrectLetter(q);
  const isCorrect = selectedExamOption === correctLetter;

  examAnswers.push({
    pregunta: q.pregunta,
    correcta: correctLetter,
    usuario: selectedExamOption,
    acierto: isCorrect
  });

  document.querySelectorAll('.exam-option').forEach((btn) => {
    btn.disabled = true;
    btn.classList.remove('selected');
    if (btn.dataset.letter === correctLetter) btn.classList.add('correct');
    if (btn.dataset.letter === selectedExamOption && !isCorrect) btn.classList.add('incorrect');
  });

  document.getElementById('confirmAnswer').disabled = true;
  const feedbackDiv = document.getElementById('examFeedback');
  if (feedbackDiv) {
    feedbackDiv.innerHTML = `
      <div class="exam-feedback">
        <div class="score ${isCorrect ? 'high' : 'low'}">${isCorrect ? 'Correcta' : 'Incorrecta'}</div>
        <div class="fb-text">
          ${isCorrect ? 'Bien hecho. Esa era la opcion correcta.' : `Tu respuesta fue ${selectedExamOption}. La respuesta correcta es ${correctLetter}.`}
        </div>
        <div style="margin-top:12px;">
          <button class="btn btn-primary" id="nextQuestion">
            ${examIndex < examQuestions.length - 1 ? 'Siguiente pregunta' : 'Ver resultados'}
          </button>
        </div>
      </div>
    `;
  }

  document.getElementById('nextQuestion').addEventListener('click', () => {
    examIndex++;
    renderExamQuestion();
  });
}

function renderExamResults() {
  const correctCount = examAnswers.filter(a => a.acierto).length;
  const wrongCount = examAnswers.length - correctCount;
  const examContent = document.getElementById('examContent');
  if (!examContent) return;

  const resultsHtml = examAnswers.map((a) => {
    const color = a.acierto ? '#22c55e' : '#ef4444';
    return `<div class="result-item">
      <span class="r-icon">${a.acierto ? 'OK' : 'X'}</span>
      <span class="r-question">${escapeHTML(a.pregunta).substring(0, 70)}...</span>
      <span style="font-weight:600;color:${color};">${a.usuario} / ${a.correcta}</span>
    </div>`;
  }).join('');

  examContent.innerHTML = `
    <div class="exam-results">
      <div class="exam-progress">${examQuestions.map((_, i) => `<div class="step done">${i + 1}</div>`).join('')}</div>
      <div style="text-align:center;margin:24px 0;">
        <div style="color:var(--text-muted);font-size:14px;margin-bottom:4px;">Puntaje final</div>
        <div class="final-score">${correctCount}/${examQuestions.length}</div>
        <div style="margin-top:8px;font-size:14px;color:var(--text-secondary);">
          ${correctCount} aciertos - ${wrongCount} errores
        </div>
      </div>
      <div style="margin-top:20px;">
        <h4 style="margin-bottom:12px;text-align:left;">Resumen de aciertos y errores</h4>
        ${resultsHtml}
      </div>
      <div class="exam-actions">
        <button class="btn btn-primary" id="retryExam">Reintentar</button>
        <button class="btn btn-secondary" id="backToExam">Nuevo examen</button>
      </div>
    </div>
  `;

  document.getElementById('retryExam').addEventListener('click', () => {
    examIndex = 0;
    examAnswers = [];
    selectedExamOption = null;
    renderExamQuestion();
  });

  saveCurrentSession();

  document.getElementById('backToExam').addEventListener('click', () => {
    examQuestions = [];
    examIndex = 0;
    examAnswers = [];
    selectedExamOption = null;
    examContent.innerHTML = '<button class="btn btn-primary" id="startExam">Iniciar Examen</button>';
    document.getElementById('startExam').addEventListener('click', handleStartExam);
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
    const data = await generateExam(getCombinedContext());
    examQuestions = (data.preguntas || []).map(normalizeExamQuestion).filter(Boolean).slice(0, 5);
    if (examQuestions.length < 5) throw new Error('Examen sin 5 preguntas de opcion multiple');
    examIndex = 0;
    examAnswers = [];
    selectedExamOption = null;
    renderExamQuestion();
  } catch (e) {
    console.error('Start exam error:', e);
    alert('Error al generar el examen. Intenta de nuevo.');
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = 'Iniciar Examen';
    }
  }
}

// ===== SESSION MANAGEMENT =====

export async function loadSessions() {
  try {
    const data = await fetchSessions();
    const sessions = data.sessions || [];
    renderSessionList(sessions);

    if (!window.currentSessionId) {
      import('./persistence.js').then(({ PersistenceManager }) => {
        const lastId = localStorage.getItem(PersistenceManager.getKey('last_session_id'));
        if (lastId) {
          const idNum = Number(lastId);
          if (sessions.some(s => s.id === idNum)) {
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
    const isActive = s.id === window.currentSessionId;
    
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
      pdfs.textContent = `📄 ${s.pdfs.length} PDF(s)`;
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
  try {
    const data = await getSession(id);
    if (!data.session) return;
    const session = data.session;

    window.currentSessionId = session.id;
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
    examQuestions = session.exam || [];
    examIndex = 0;
    examAnswers = [];

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.innerHTML = '<div class="empty-chat"><div class="icon">🚀</div><p>Chat cargado de sesión</p></div>';
      if (session.messages && session.messages.length) {
        session.messages.forEach(m => addChatMessage(m.role, m.content));
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

    if (window.flashcardsData) {
      renderFlashcards(window.flashcardsData);
      document.getElementById('exportFlashcards').style.display = 'inline-block';
    }
    if (window.summaryData) {
      const summaryText = document.getElementById('summaryText');
      if (summaryText) {
        summaryText.innerHTML = `<h4>📝 Resumen de tus apuntes</h4>${window.summaryData.text.replace(/\n/g, '<br>')}`;
      }
      document.getElementById('exportSummary').style.display = 'inline-block';
    }
    if (window.planData) {
      const planBody = document.getElementById('planBody');
      if (planBody && window.planData.items) {
        planBody.innerHTML = '';
        window.planData.items.forEach((item, i) => {
          const d = new Date(item.fecha);
          const dateStr = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
          const tagClass = i < window.planData.items.length - 1 ? 'tag-cyan' : 'tag-purple';
          const label = i < window.planData.items.length - 1 ? 'Por hacer' : '📝 Examen';
          planBody.innerHTML += `<tr>
            <td>Día ${item.dia}</td>
            <td>${dateStr}</td>
            <td>${item.tema}</td>
            <td>${item.tiempo}</td>
            <td><span class="tag ${tagClass}">${label}</span></td>
          </tr>`;
        });
      }
      document.getElementById('exportPlan').style.display = 'inline-block';
    }

    updateExportAllButton();
    loadSessions();
  } catch (e) {
    console.error('Load session error:', e);
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

  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.innerHTML = '<div class="empty-chat"><div class="icon">🚀</div><p>Carga un PDF para comenzar</p></div>';
  }
  document.getElementById('summaryText').innerHTML = '';
  document.getElementById('planBody').innerHTML = '';
  document.getElementById('planSubject').value = '';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 7);
  document.getElementById('planDate').value = tomorrow.toISOString().split('T')[0];
  document.getElementById('exportFlashcards').style.display = 'none';
  document.getElementById('exportSummary').style.display = 'none';
  document.getElementById('exportPlan').style.display = 'none';
  document.getElementById('examContent').innerHTML = '<button class="btn btn-primary" id="startExam">Iniciar Examen</button>';
  document.getElementById('dropZone').classList.remove('collapsed');
  document.getElementById('toolPanel').style.display = 'none';
  updateExportAllButton();
  loadSessions();
}

export async function deleteSession(id) {
  try {
    await apiDeleteSession(id);
    if (window.currentSessionId === id) {
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
    const text = el.textContent || '';
    if (text.trim()) messages.push({ role, content: text.trim() });
  });
  if (messages.length === 0) return;

  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    const firstPdfName = window.pdfDocs?.[0]?.name || 'Documento';
    const payload = {
      title: firstPdfName,
      messages,
      pdfs: window.pdfDocs || [],
      flashcards: window.flashcardsData || [],
      summary: window.summaryData || null,
      exam: examQuestions || [],
      study_plan: window.planData || null,
    };

    try {
      if (window.currentSessionId) {
        await updateSession(window.currentSessionId, payload);
      } else {
        const data = await createSession(payload);
        window.currentSessionId = data.id;
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
    title.textContent = `📘 ${s.pdfName}`;
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'h-date';
    dateDiv.textContent = date;
    
    div.appendChild(title);
    div.appendChild(dateDiv);
    
    if (preview) {
      const prevDiv = document.createElement('div');
      prevDiv.className = 'h-preview';
      prevDiv.textContent = `💬 "${preview}..."`;
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
    chatMessages.innerHTML = '<div class="empty-chat"><div class="icon">🚀</div><p>Historial cargado</p></div>';
    session.messages.forEach(msg => addChatMessage('user', msg));
  }
  closeHistoryPanel();
}

export function closeHistoryPanel() {
  document.getElementById('historyPanel')?.classList.remove('open');
  document.getElementById('historyOverlay')?.classList.remove('open');
}

// ===== STORAGE RESTORE =====

export function restoreFromStorage() {
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
      chatData.forEach(msg => addChatMessage(msg.role, msg.text));
      chatMessages.scrollTop = chatMessages.scrollHeight;
      restored = true;
    }
  }

  const flashcards = loadFromStorage('flashcards');
  if (flashcards && flashcards.length > 0) {
    window.flashcardsData = flashcards;
    renderFlashcards(flashcards);
    document.getElementById('exportFlashcards').style.display = 'inline-block';
    updateExportAllButton();
    restored = true;
  }

  const plan = loadFromStorage('plan');
  if (plan && plan.items && plan.items.length > 0) {
    window.planData = plan;
    document.getElementById('planSubject').value = plan.subject || '';
    document.getElementById('planDate').value = plan.examDate || '';
    document.getElementById('exportPlan').style.display = 'inline-block';
    updateExportAllButton();
    restored = true;
  }

  const summary = loadFromStorage('summary');
  if (summary && summary.text) {
    window.summaryData = summary;
    const summaryText = document.getElementById('summaryText');
    if (summaryText) {
      summaryText.innerHTML = `<h4>📝 Resumen de tus apuntes</h4>${summary.text.replace(/\n/g, '<br>')}`;
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

  if (flashcard) flashcard.addEventListener('click', () => flashcard.classList.toggle('flipped'));
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
    try {
      const data = await apiFlashcards(getCombinedContext());
      if (data.cards && data.cards.length > 0) {
        renderFlashcards(data.cards);
        window.flashcardsData = data.cards.map(c => ({ pregunta: c.pregunta, respuesta: c.respuesta }));
        saveToStorage('flashcards', window.flashcardsData);
        document.getElementById('exportFlashcards').style.display = 'inline-block';
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

    createPlanBtn.disabled = true;
    createPlanBtn.textContent = '⏳ Generando...';

    try {
      const data = await createStudyPlan(getCombinedContext(), subject, examDate);
      if (data.error) {
        alert(data.error);
        createPlanBtn.disabled = false;
        createPlanBtn.textContent = 'Crear Plan';
        return;
      }

      const tbody = document.getElementById('planBody');
      if (tbody) tbody.innerHTML = '';

      if (data.fallback && data.planTexto) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" style="white-space:pre-wrap;color:var(--text-secondary);font-size:13px;line-height:1.7;padding:16px;">${data.planTexto.replace(/\n/g, '<br>')}</td>`;
        tbody?.appendChild(tr);
        window.planData = { items: [], subject, examDate, fallback: true, text: data.planTexto };
        saveToStorage('plan', window.planData);
      } else if (data.plan && data.plan.length) {
        window.planData = { items: data.plan, subject, examDate };
        saveToStorage('plan', window.planData);
        data.plan.forEach((item, i) => {
          const d = new Date(item.fecha);
          const dateStr = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
          const tagClass = i < data.plan.length - 1 ? 'tag-cyan' : 'tag-purple';
          const label = i < data.plan.length - 1 ? 'Por hacer' : '📝 Examen';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>Día ${item.dia}</td>
            <td>${dateStr}</td>
            <td>${item.tema}</td>
            <td>${item.tiempo}</td>
            <td><span class="tag ${tagClass}">${label}</span></td>
          `;
          tbody?.appendChild(tr);
        });
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
    summaryText.innerHTML = '<p style="color:var(--text-muted);">⏳ Generando resumen inteligente...</p>';

    try {
      const data = await generateSummary(getCombinedContext());
      summaryText.innerHTML = `<h4>📝 Resumen de tus apuntes</h4>${data.text.replace(/\n/g, '<br>')}`;
      window.summaryData = { text: data.text, pdfs: window.pdfDocs.map(d => d.name) };
      saveToStorage('summary', window.summaryData);
      document.getElementById('exportSummary').style.display = 'inline-block';
      updateExportAllButton();
      saveCurrentSession();
    } catch (e) {
      console.error('Summary error:', e);
      summaryText.innerHTML = '<p style="color:var(--text-muted);">⚠️ Error al generar el resumen. Intenta de nuevo.</p>';
    }

    genSummary.disabled = false;
    genSummary.textContent = 'Generar Resumen';
  });
}

export function initExamMode() {
  const startExam = document.getElementById('startExam');
  if (startExam) startExam.addEventListener('click', handleStartExam);
}