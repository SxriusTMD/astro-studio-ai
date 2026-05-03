require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = 3000;
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'astro-studio-ai-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'http://localhost:3000/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  const user = {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.emails?.[0]?.value || '',
    photo: profile.photos?.[0]?.value || ''
  };
  done(null, user);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'No autenticado' });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['email', 'profile'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.user || null });
});

async function callNVIDIA(messages) {
  const nvidiaRes = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`
    },
    body: JSON.stringify({
      model: 'google/gemma-4-31b-it',
      messages
    })
  });
  if (!nvidiaRes.ok) {
    const errText = await nvidiaRes.text();
    throw new Error(`NVIDIA API error (${nvidiaRes.status}): ${errText}`);
  }
  const data = await nvidiaRes.json();
  return data.choices[0].message.content;
}

app.post('/api/chat', ensureAuthenticated, async (req, res) => {
  const { prompt, pdfContent } = req.body;

  const systemInstruction = 'Eres un asistente de estudio universitario. Tienes acceso al siguiente documento del estudiante. Responde siempre en espaÃ±ol, de forma clara y concisa, citando partes relevantes del documento cuando sea Ãºtil.';

  const contextPrompt = pdfContent
    ? `Contexto del PDF:\n${pdfContent.slice(0, 6000)}\n\n${prompt}`
    : prompt;

  try {
    const text = await callNVIDIA([
      { role: 'system', content: systemInstruction },
      { role: 'user', content: contextPrompt }
    ]);
    res.json({ text });
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Error al conectar con la IA.' });
  }
});

app.post('/api/flashcards', ensureAuthenticated, async (req, res) => {
  const { pdfContent } = req.body;
  if (!pdfContent) return res.status(400).json({ error: 'pdfContent requerido' });

  const prompt = 'Genera exactamente 5 flashcards de estudio basadas en este documento. Responde ÃšNICAMENTE con un array JSON vÃ¡lido con este formato: [{"pregunta":"...","respuesta":"..."}]. Sin texto extra, sin markdown, solo el JSON puro.\n\nDocumento:\n' + pdfContent.slice(0, 6000);

  try {
    const text = await callNVIDIA([
      { role: 'user', content: prompt }
    ]);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No se encontrÃ³ JSON en la respuesta');
    const cards = JSON.parse(jsonMatch[0]);
    res.json({ cards });
  } catch (err) {
    console.error('Flashcards error:', err);
    res.status(502).json({ error: 'Error al generar flashcards.' });
  }
});

app.post('/api/resumen', ensureAuthenticated, async (req, res) => {
  const { pdfContent } = req.body;
  if (!pdfContent) return res.status(400).json({ error: 'pdfContent requerido' });

  const prompt = 'Genera un resumen estructurado de este documento con estas secciones exactas en espaÃ±ol: INTRODUCCIÃ“N, PUNTOS CLAVE (lista de 5 bullets), y CONCLUSIÃ“N. Formato limpio y claro.\n\nDocumento:\n' + pdfContent.slice(0, 6000);

  try {
    const text = await callNVIDIA([
      { role: 'user', content: prompt }
    ]);
    res.json({ text });
  } catch (err) {
    console.error('Resumen error:', err);
    res.status(502).json({ error: 'Error al generar resumen.' });
  }
});

app.post('/api/examen', ensureAuthenticated, async (req, res) => {
  const { pdfContent } = req.body;
  if (!pdfContent) return res.status(400).json({ error: 'pdfContent requerido' });

  const prompt = 'Genera exactamente 5 preguntas de opcion multiple basadas en este documento. Cada pregunta debe tener 4 opciones identificadas como A), B), C) y D). Responde UNICAMENTE con un array JSON valido con este formato exacto: [{"pregunta":"...","opciones":["A) ...","B) ...","C) ...","D) ..."],"respuesta_correcta":"A"}]. En respuesta_correcta usa solo una letra: "A", "B", "C" o "D". Sin texto extra, sin markdown, solo el JSON puro.\n\nDocumento:\n' + pdfContent.slice(0, 6000);

  try {
    const text = await callNVIDIA([{ role: 'user', content: prompt }]);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No se encontrÃ³ JSON en la respuesta');
    const preguntas = JSON.parse(jsonMatch[0]);
    res.json({ preguntas });
  } catch (err) {
    console.error('Examen error:', err);
    res.status(502).json({ error: 'Error al generar el examen.' });
  }
});

app.post('/api/plan', ensureAuthenticated, async (req, res) => {
  const { pdfContent, materia, fechaExamen } = req.body;
  if (!pdfContent || !materia || !fechaExamen) {
    return res.status(400).json({ error: 'pdfContent, materia y fechaExamen requeridos' });
  }

  const hoy = new Date();
  const examen = new Date(fechaExamen);
  const diffMs = examen - hoy;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 3) {
    return res.json({ error: 'âš ï¸ El tiempo es muy corto. Quedan menos de 3 dÃ­as para el examen.', plan: [] });
  }

  const prompt = `Genera un plan de estudio dÃ­a por dÃ­a para preparar un examen de "${materia}" usando el contenido de este documento. Hay ${diffDays} dÃ­as hasta el examen. Asigna temas del documento a cada dÃ­a de forma progresiva. Responde ÃšNICAMENTE con un array JSON vÃ¡lido con este formato: [{"dia": 1, "fecha": "YYYY-MM-DD", "tema": "...", "tiempo": "2 h"}]. Sin texto extra, sin markdown, solo el JSON puro.\n\nDocumento:\n${pdfContent.slice(0, 6000)}`;

  try {
    const text = await callNVIDIA([{ role: 'user', content: prompt }]);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No se encontrÃ³ JSON en la respuesta');
    const plan = JSON.parse(jsonMatch[0]);
    res.json({ plan, diasRestantes: diffDays });
  } catch (err) {
    console.error('Plan error:', err);
    res.status(502).json({ error: 'Error al generar el plan de estudio.' });
  }
});

app.listen(PORT, () => {
  console.log(`ðŸš€ Astro Studio AI corriendo en http://localhost:${PORT}`);
});
