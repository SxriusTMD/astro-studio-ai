require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Pool } = require('pg');

const app = express();
const PORT = 3000;
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

app.use(express.json());

// PostgreSQL
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let dbOk = false;

(async () => {
  try {
    await pool.connect();
    dbOk = true;
    console.log('✅ PostgreSQL conectado');

await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      google_id VARCHAR(255) UNIQUE NOT NULL,
      nombre VARCHAR(255),
      email VARCHAR(255) UNIQUE,
      foto VARCHAR(500),
      plan VARCHAR(50) DEFAULT 'free',
      chat_count INT DEFAULT 0,
      exam_count INT DEFAULT 0,
      last_reset DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documentos (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        nombre VARCHAR(255),
        contenido_texto TEXT,
        tamanio INTEGER,
        paginas INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id SERIAL PRIMARY KEY,
      google_id VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      messages JSONB DEFAULT '[]',
      pdfs JSONB DEFAULT '[]'
    )
  `);
  await pool.query(`
  CREATE TABLE IF NOT EXISTS sesiones_chat (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    documento_id INTEGER REFERENCES documentos(id) ON DELETE SET NULL,
    mensajes JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  )
  `);
    console.log('✅ Tablas creadas/verificadas');
  } catch (err) {
    console.error('⚠️ PostgreSQL no disponible:', err.message);
    console.log('⚠️ La app funcionará sin BD');
  }
})();
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || "astro-studio-ai-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,       // 🔥 CLAVE
    sameSite: "none"    // 🔥 CLAVE
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://astro-studio-ai-production.up.railway.app/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  const userProfile = {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.emails?.[0]?.value || '',
    photo: profile.photos?.[0]?.value || ''
  };

  // Guardar/actualizar usuario en BD si está disponible
  if (dbOk) {
    try {
      await pool.query(`
        INSERT INTO usuarios (google_id, nombre, email, foto)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (google_id) DO UPDATE
        SET nombre = EXCLUDED.nombre, email = EXCLUDED.email, foto = EXCLUDED.foto
      `, [userProfile.id, userProfile.displayName, userProfile.email, userProfile.photo]);
    } catch (err) {
      console.error('Error guardando usuario:', err.message);
    }
  }

  done(null, userProfile);
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

// Helper: call NVIDIA NIM API
async function callNVIDIA(messages) {
  const maxRetries = 2;
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      
      const nvidiaRes = await fetch(NVIDIA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`
        },
        body: JSON.stringify({
          model: 'google/gemma-4-31b-it',
          messages
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!nvidiaRes.ok) {
        const errText = await nvidiaRes.text();
        // Reintentar solo en errores 503
        if (nvidiaRes.status === 503 && attempt < maxRetries) {
          console.log(`NVIDIA API 503 - intento ${attempt + 1}, reintentando...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
        throw new Error(`NVIDIA API error (${nvidiaRes.status}): ${errText}`);
      }
      
      const data = await nvidiaRes.json();
      return data.choices[0].message.content;
    } catch (err) {
      lastError = err;
      // Si es AbortError o 503 y quedan reintentos
      if (err.name === 'AbortError' || (err.message.includes('503') && attempt < maxRetries)) {
        console.log(`NVIDIA API timeout/503 - intento ${attempt + 1}, reintentando...`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
      }
      throw lastError;
    }
  }
  
  throw lastError || new Error('NVIDIA API error después de reintentos');
}

// Helper: reset daily counters if needed
async function resetDailyCounters(googleId) {
  const result = await pool.query(
    `UPDATE usuarios SET chat_count = 0, exam_count = 0, last_reset = CURRENT_DATE 
     WHERE google_id = $1 AND last_reset < CURRENT_DATE 
     RETURNING last_reset`,
    [googleId]
  );
  if (result.rows.length > 0) {
    console.log('✅ Contadores reseteados para', googleId, 'last_reset:', result.rows[0].last_reset);
  }
}

// GET /api/user/limits - returns current plan and usage
app.get('/api/user/limits', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    await resetDailyCounters(userId);
    
    const result = await pool.query(
      `SELECT plan, chat_count, exam_count FROM usuarios WHERE google_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    const isPremium = row.plan === 'premium';
    
    console.log('📊 Limits:', row);
    
    res.json({
      plan: row.plan,
      chat_used: row.chat_count,
      exam_used: row.exam_count,
      chat_limit: isPremium ? null : 10,
      exam_limit: isPremium ? null : 3,
      pdf_limit: isPremium ? null : 3
    });
  } catch (err) {
    console.error('User limits error:', err);
    res.status(500).json({ error: 'Error obteniendo límites' });
  }
});

// POST /api/user/increment - increments chat or exam counter
app.post('/api/user/increment', ensureAuthenticated, async (req, res) => {
  const { type } = req.body;
  if (!type || !['chat', 'exam'].includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }
  
  try {
    const userId = req.user.id;
    await resetDailyCounters(userId);
    
    const result = await pool.query(
      `SELECT plan, chat_count, exam_count FROM usuarios WHERE google_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    const isPremium = row.plan === 'premium';
    const currentCount = type === 'chat' ? row.chat_count : row.exam_count;
    const limit = type === 'chat' ? 10 : 3;
    
    if (!isPremium && currentCount >= limit) {
      return res.json({ allowed: false, used: currentCount, limit });
    }
    
    const field = type === 'chat' ? 'chat_count' : 'exam_count';
    await pool.query(
      `UPDATE usuarios SET ${field} = ${field} + 1 WHERE google_id = $1`,
      [userId]
    );
    
    res.json({ allowed: true, used: currentCount + 1, limit: isPremium ? null : limit });
  } catch (err) {
    console.error('Increment error:', err);
    res.status(500).json({ error: 'Error incrementando contador' });
  }
});

app.post('/api/chat', ensureAuthenticated, async (req, res) => {
  const { prompt, pdfContent } = req.body;

  const systemInstruction = 'Eres un asistente de estudio universitario. Tienes acceso al siguiente documento del estudiante. Responde siempre en español, de forma clara y concisa, citando partes relevantes del documento cuando sea útil.';

  const contextPrompt = pdfContent
    ? `Contexto del PDF:\n${pdfContent.slice(0, 6000)}\n\n${prompt}`
    : prompt;

  try {
    // 1. Primero llamar a NVIDIA NIM
    const text = await callNVIDIA([
      { role: 'system', content: systemInstruction },
      { role: 'user', content: contextPrompt }
    ]);
    
    // 2. SOLO si NVIDIA responde exitosamente, incrementar el contador
    const userId = req.user.id;
    const result = await pool.query(
      `UPDATE usuarios SET chat_count = chat_count + 1 WHERE google_id = $1 RETURNING chat_count`,
      [userId]
    );
    
    res.json({ text, chat_used: result.rows[0].chat_count });
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
    if (jsonMatch) {
      try {
        const plan = JSON.parse(jsonMatch[0]);
        return res.json({ plan, diasRestantes: diffDays });
      } catch (parseErr) {
        console.error('Plan JSON parse error:', parseErr.message);
      }
    }
    // Fallback: devolver el texto plano como plan legible
    return res.json({ planTexto: text, diasRestantes: diffDays, fallback: true });
  } catch (err) {
    console.error('Plan error:', err.message, err.stack);
    console.error('Request body:', JSON.stringify(req.body).slice(0, 200));
    res.status(502).json({ error: 'Error al generar el plan de estudio.' });
  }
});

app.post('/api/documentos/guardar', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });
  const { nombre, contenidoTexto, tamanio, paginas } = req.body;
  if (!nombre || !contenidoTexto) return res.status(400).json({ error: 'nombre y contenidoTexto requeridos' });

  try {
    const result = await pool.query(
      `INSERT INTO documentos (usuario_id, nombre, contenido_texto, tamanio, paginas)
       VALUES ((SELECT id FROM usuarios WHERE google_id = $1), $2, $3, $4, $5)
       RETURNING id`,
      [req.user.id, nombre, contenidoTexto, tamanio || 0, paginas || 0]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error('Guardar documento error:', err);
    res.status(500).json({ error: 'Error al guardar documento' });
  }
});

app.get('/api/documentos', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });

  try {
    const result = await pool.query(
      `SELECT id, nombre, paginas, tamanio, created_at
       FROM documentos WHERE usuario_id = (SELECT id FROM usuarios WHERE google_id = $1)
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ documentos: result.rows });
  } catch (err) {
    console.error('Listar documentos error:', err);
    res.status(500).json({ error: 'Error al listar documentos' });
  }
});

app.get('/api/documentos/:id', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });

  try {
    const result = await pool.query(
      `SELECT id, nombre, contenido_texto, paginas, tamanio, created_at
       FROM documentos WHERE id = $1 AND usuario_id = (SELECT id FROM usuarios WHERE google_id = $2)`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Obtener documento error:', err);
    res.status(500).json({ error: 'Error al obtener documento' });
  }
});

app.delete('/api/documentos/:id', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });

  try {
    await pool.query(
      `DELETE FROM documentos WHERE id = $1 AND usuario_id = (SELECT id FROM usuarios WHERE google_id = $2)`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Eliminar documento error:', err);
    res.status(500).json({ error: 'Error al eliminar documento' });
  }
});

// CHAT SESSIONS API
app.get('/api/sessions', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });
  
  try {
    const result = await pool.query(
      `SELECT id, title, created_at, updated_at, pdfs 
       FROM chat_sessions 
       WHERE google_id = $1 
       ORDER BY updated_at DESC`,
      [req.user.id]
    );
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Error al obtener sesiones' });
  }
});

app.get('/api/sessions/:id', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });
  
  try {
    const result = await pool.query(
      `SELECT * FROM chat_sessions 
       WHERE id = $1 AND google_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Error al obtener sesión' });
  }
});

app.post('/api/sessions', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });
  
  const { title, messages, pdfs } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO chat_sessions (google_id, title, messages, pdfs) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id`,
      [req.user.id, title, JSON.stringify(messages || []), JSON.stringify(pdfs || [])]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Error al crear sesión' });
  }
});

app.put('/api/sessions/:id', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });
  
  const { messages, pdfs, title } = req.body;
  
  try {
    await pool.query(
      `UPDATE chat_sessions 
       SET messages = $1, pdfs = $2, updated_at = NOW(), title = $3 
       WHERE id = $4 AND google_id = $5`,
      [JSON.stringify(messages), JSON.stringify(pdfs), title, req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Update session error:', err);
    res.status(500).json({ error: 'Error al actualizar sesión' });
  }
});

app.delete('/api/sessions/:id', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });
  
  try {
    await pool.query(
      `DELETE FROM chat_sessions 
       WHERE id = $1 AND google_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ error: 'Error al eliminar sesión' });
  }
});

app.listen(PORT, () => {
  console.log(`ðŸš€ Astro Studio AI corriendo en http://localhost:${PORT}`);
});
