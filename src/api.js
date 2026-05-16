async function request(url, options = {}) {
  const config = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  const res = await fetch(url, config);
  if (!res.ok) {
    const err = new Error(`API ${res.status}`);
    err.status = res.status;
    try { err.data = await res.json(); } catch {}
    throw err;
  }
  return res.json();
}

export async function fetchMe(signal) {
  const res = await fetch('/api/me', { credentials: 'include', signal });
  return res.json();
}

export async function fetchUserLimits() {
  return request('/api/user/limits');
}

export async function incrementCounter(type) {
  return request('/api/user/increment', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}

export async function upgradeToPro() {
  return request('/api/user/upgrade-success', { method: 'POST' });
}

export async function sendChat(prompt, pdfContent, sessionId = null) {
  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      prompt,
      pdfContent,
      sessionId: sessionId != null && sessionId !== '' ? sessionId : null,
    }),
  });
}

export async function generateFlashcards(pdfContent, sessionId = null) {
  return request('/api/flashcards', {
    method: 'POST',
    body: JSON.stringify({ pdfContent, sessionId: sessionId != null && sessionId !== '' ? sessionId : null }),
  });
}

export async function createStudyPlan(pdfContent, materia, fechaExamen, sessionId = null) {
  return request('/api/plan', {
    method: 'POST',
    body: JSON.stringify({ pdfContent, materia, fechaExamen, sessionId: sessionId != null && sessionId !== '' ? sessionId : null }),
  });
}

export async function generateSummary(pdfContent, sessionId = null) {
  return request('/api/resumen', {
    method: 'POST',
    body: JSON.stringify({ pdfContent, sessionId: sessionId != null && sessionId !== '' ? sessionId : null }),
  });
}

export async function generateExamInteractive(extracted_text, sessionId = null) {
  return request('/api/exam', {
    method: 'POST',
    body: JSON.stringify({ extracted_text, sessionId: sessionId != null && sessionId !== '' ? sessionId : null }),
  });
}

export async function generateExam(pdfContent, sessionId = null) {
  return request('/api/examen', {
    method: 'POST',
    body: JSON.stringify({ pdfContent, sessionId: sessionId != null && sessionId !== '' ? sessionId : null }),
  });
}

export async function fetchSessions() {
  return request('/api/sessions');
}

export async function getSession(id) {
  return request(`/api/sessions/${id}`);
}

export async function createSession(data) {
  return request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSession(id, data) {
  return request(`/api/sessions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSession(id) {
  return request(`/api/sessions/${id}`, { method: 'DELETE' });
}

export async function fetchDocuments() {
  return request('/api/documentos');
}

export async function getDocument(id) {
  return request(`/api/documentos/${id}`);
}

export async function deleteDocument(id) {
  return request(`/api/documentos/${id}`, { method: 'DELETE' });
}

export async function saveDocument(data) {
  return request('/api/documentos/guardar', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function saveCloudDocument(data) {
  return request('/api/documents', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchCloudDocuments() {
  return request('/api/documents');
}
