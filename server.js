require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
require('dns').setDefaultResultOrder('ipv4first');

const app = express();
const PORT = 3000;
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

app.use(express.json());


// ===== EMAIL CONFIG (Brevo API) =====
const { BrevoClient } = require('@getbrevo/brevo');
const brevoClient = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });

// Health check Brevo al iniciar
(async () => {
  try {
    const result = await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { email: 'aerolexai@gmail.com', name: 'AeroLex AI' },
      to: [{ email: 'aerolexai@gmail.com' }],
      subject: '? Brevo API conectada - AeroLex AI',
      htmlContent: '<p>Servidor iniciado correctamente. La API de Brevo funciona.</p>'
    });
    console.log(`? Brevo API Health Check exitoso Ã¯Â¿Â½ messageId: ${result.data?.messageId || 'OK'}`);
  } catch (err) {
    console.error('? Brevo API Health Check fallÃ¯Â¿Â½:', err.message);
    if (err.body) console.error('   Brevo detalle:', JSON.stringify(err.body, null, 2));
  }
})();

// PostgreSQL
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let dbOk = false;

(async () => {
  try {
    await pool.connect();
    dbOk = true;
    console.log('? PostgreSQL conectado');

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
    console.log('? Tablas creadas/verificadas');
    
    // MigraciÃ¯Â¿Â½n: columnas para auth por email
    try {
      await pool.query(`ALTER TABLE usuarios ALTER COLUMN google_id DROP NOT NULL`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_method VARCHAR(50) DEFAULT 'google'`);
      console.log('? MigraciÃ¯Â¿Â½n email auth completada');
    } catch (err) {
      console.error('?? MigraciÃ¯Â¿Â½n email auth:', err.message);
    }

    // MigraciÃ¯Â¿Â½n: columnas para flashcards, resumen, examen, plan en sesiones
    try {
      await pool.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS flashcards JSONB DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS summary JSONB`);
      await pool.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS exam JSONB DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS study_plan JSONB`);
      console.log('? MigraciÃ¯Â¿Â½n columnas de estudio completada');
    } catch (err) {
      console.error('?? MigraciÃ¯Â¿Â½n columnas de estudio:', err.message);
    }
  } catch (err) {
    console.error('?? PostgreSQL no disponible:', err.message);
    console.log('?? La app funcionarÃ¯Â¿Â½ sin BD');
  }
})();
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || "aerolex-ai-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,       // ?? CLAVE
    sameSite: "none"    // ?? CLAVE
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://aerolex-ai.up.railway.app/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  const userProfile = {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.emails?.[0]?.value || '',
    photo: profile.photos?.[0]?.value || ''
  };

  // Guardar/actualizar usuario en BD si estÃ¯Â¿Â½ disponible
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

app.get('/auth/email', (req, res) => {
  res.sendFile(path.join(__dirname, 'auth-email.html'));
});

app.get('/complete-profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'complete-profile.html'));
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

// ===== EMAIL/PASSWORD AUTH ENDPOINTS =====

// POST /api/auth/register - Paso 1: crear cuenta con email + password
app.post('/api/auth/register', async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseÃ¯Â¿Â½a requeridos' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Formato de email invÃ¯Â¿Â½lido' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseÃ¯Â¿Â½a debe tener al menos 6 caracteres' });

  try {
    const existente = await pool.query(`SELECT id FROM usuarios WHERE email = $1`, [email]);
    if (existente.rows.length > 0) return res.status(409).json({ error: 'Este email ya estÃ¯Â¿Â½ registrado' });

    const password_hash = await bcrypt.hash(password, 10);
    const verification_token = crypto.randomBytes(32).toString('hex');

    await pool.query(`
      INSERT INTO usuarios (google_id, email, password_hash, verification_token, is_verified, auth_method, nombre)
      VALUES ($1, $2, $3, $4, false, 'email', $5)
    `, [crypto.randomUUID(), email, password_hash, verification_token, email.split('@')[0]]);

    // Enviar correo de verificaciÃ¯Â¿Â½n
    try {
      console.log(`?? Intentando envÃ¯Â¿Â½o desde: AeroLex AI (aerolexai@gmail.com) ? ${email}`);
      const verificationUrl = `https://${req.get('host')}/api/auth/verify-email?token=${verification_token}`;
      const mailRes = await brevoClient.transactionalEmails.sendTransacEmail({
        sender: { email: 'aerolexai@gmail.com', name: 'AeroLex AI' },
        to: [{ email }],
        subject: 'Verifica tu correo - AeroLex AI',
        htmlContent: `
          <div style="background:#0a0a1a;color:#e8e8f0;font-family:Arial;padding:40px;text-align:center;border-radius:16px;">
            <div style="font-size:48px;margin-bottom:16px;">??</div>
            <h1 style="color:#8b5cf6;">AeroLex AI</h1>
            <p style="font-size:16px;margin:24px 0;">Gracias por registrarte. Haz clic en el botÃ¯Â¿Â½n para verificar tu correo:</p>
            <a href="${verificationUrl}" style="display:inline-block;background:linear-gradient(135deg,#6c3bd2,#4f46e5);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;">Verificar correo</a>
            <p style="margin-top:24px;font-size:13px;color:#9090b8;">Si no creaste esta cuenta, ignora este mensaje.</p>
          </div>
        `
      });
      console.log(`? Correo enviado vÃ¯Â¿Â½a Brevo a ${email} Ã¯Â¿Â½ messageId: ${mailRes.data?.messageId || mailRes.rawResponse?.headers?.get?.('x-message-id') || 'OK'}`);
    } catch (mailErr) {
      console.error('? Error enviando correo a', email, ':', mailErr.message);
      if (mailErr.body) console.error('   Brevo detalle:', JSON.stringify(mailErr.body, null, 2));
      return res.status(500).json({ error: 'Error al enviar el correo de verificaciÃ¯Â¿Â½n. Intenta de nuevo mÃ¯Â¿Â½s tarde.' });
    }

    res.json({ ok: true, message: 'Revisa tu correo para verificar la cuenta' });
  } catch (err) {
    console.error('? ERROR EN REGISTRO:', err);
    if (err.body) console.error('Detalle Brevo:', JSON.stringify(err.body, null, 2));
    res.status(500).json({ error: 'Error al registrar' });
  }
});

// GET /api/auth/verify-email?token=xxx - Paso 2: verificar correo
app.get('/api/auth/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Token requerido');

  try {
    const result = await pool.query(
      `SELECT id, email FROM usuarios WHERE verification_token = $1 AND is_verified = false`,
      [token]
    );
    if (result.rows.length === 0) return res.status(400).send('Token invÃ¯Â¿Â½lido o ya verificado');

    const userId = result.rows[0].id;

    await pool.query(
      `UPDATE usuarios SET is_verified = true, verification_token = NULL WHERE id = $1`,
      [userId]
    );

    // Iniciar sesiÃ¯Â¿Â½n automÃ¯Â¿Â½ticamente para que al llegar a / ya estÃ¯Â¿Â½ autenticado
    const userResult = await pool.query(
      `SELECT google_id, email, username, nombre, foto FROM usuarios WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];

    req.login({
      id: user.google_id,
      email: user.email,
      displayName: user.username || user.nombre || user.email.split('@')[0],
      photo: user.foto || '',
      authMethod: 'email',
      dbId: userId,
      needsUsername: !user.username
    }, (err) => {
      if (err) return res.redirect('/?verified=true');
      res.sendFile(path.join(__dirname, 'verify-success.html'));
    });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).send('Error al verificar');
  }
});

// GET /api/auth/check-status?email=xxx - Verificar si un email ya estÃ¯Â¿Â½ verificado
app.get('/api/auth/check-status', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  try {
    const result = await pool.query(
      `SELECT is_verified, username FROM usuarios WHERE email = $1 AND auth_method = 'email'`,
      [email]
    );
    if (result.rows.length === 0) return res.json({ exists: false, isVerified: false });
    res.json({ exists: true, isVerified: result.rows[0].is_verified, hasUsername: !!result.rows[0].username });
  } catch (err) {
    console.error('Check-status error:', err);
    res.status(500).json({ error: 'Error al verificar estado' });
  }
});

// POST /api/auth/login - Iniciar sesiÃ¯Â¿Â½n con email + password
app.post('/api/auth/login', async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseÃ¯Â¿Â½a requeridos' });

  try {
    const result = await pool.query(
      `SELECT id, google_id, email, password_hash, is_verified, username, nombre, foto FROM usuarios WHERE email = $1 AND auth_method = 'email'`,
      [email]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciales invÃ¯Â¿Â½lidas' });

    const user = result.rows[0];
    if (!user.is_verified) return res.status(403).json({ error: 'Correo no verificado', needsVerification: true });
    if (!user.password_hash) return res.status(401).json({ error: 'Credenciales invÃ¯Â¿Â½lidas' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Credenciales invÃ¯Â¿Â½lidas' });

    const needsUsername = !user.username;

    req.login({
      id: user.google_id,
      email: user.email,
      displayName: user.username || user.nombre || email.split('@')[0],
      photo: user.foto || '',
      authMethod: 'email',
      dbId: user.id,
      needsUsername
    }, (err) => {
      if (err) return res.status(500).json({ error: 'Error al iniciar sesiÃ¯Â¿Â½n' });
      res.json({ ok: true, needsUsername });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error al iniciar sesiÃ¯Â¿Â½n' });
  }
});

// GET /api/auth/check-username?username=xxx - Verificar disponibilidad
app.get('/api/auth/check-username', async (req, res) => {
  const { username } = req.query;
  if (!username || username.length < 3) return res.json({ available: false });
  try {
    const result = await pool.query(`SELECT id FROM usuarios WHERE LOWER(username) = LOWER($1)`, [username]);
    res.json({ available: result.rows.length === 0 });
  } catch (err) {
    res.json({ available: false });
  }
});

// POST /api/auth/set-username - Establecer username (requiere auth)
app.post('/api/auth/set-username', ensureAuthenticated, async (req, res) => {
  const { username } = req.body;
  if (!username || username.length < 3) return res.status(400).json({ error: 'El username debe tener al menos 3 caracteres' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Solo letras, nÃ¯Â¿Â½meros y guiÃ¯Â¿Â½n bajo' });

  try {
    const duplicado = await pool.query(`SELECT id FROM usuarios WHERE username = $1`, [username]);
    if (duplicado.rows.length > 0) return res.status(409).json({ error: 'Este nombre de usuario ya estÃ¯Â¿Â½ en uso' });

    await pool.query(
      `UPDATE usuarios SET username = $1, nombre = $1 WHERE google_id = $2`,
      [username, req.user.id]
    );

    req.user.displayName = username;
    req.user.needsUsername = false;

    res.json({ ok: true, username });
  } catch (err) {
    console.error('Set username error:', err);
    res.status(500).json({ error: 'Error al establecer username' });
  }
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
  
  throw lastError || new Error('NVIDIA API error despuÃ¯Â¿Â½s de reintentos');
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
    console.log('? Contadores reseteados para', googleId, 'last_reset:', result.rows[0].last_reset);
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
    
    console.log('?? Limits:', row);
    
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
    res.status(500).json({ error: 'Error obteniendo lÃ¯Â¿Â½mites' });
  }
});

// POST /api/user/increment - increments chat or exam counter
app.post('/api/user/increment', ensureAuthenticated, async (req, res) => {
  const { type } = req.body;
  if (!type || !['chat', 'exam'].includes(type)) {
    return res.status(400).json({ error: 'Tipo invÃ¯Â¿Â½lido' });
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

  const systemInstruction = 'Eres AeroLex AI, un Tutor Académico de Alto Nivel para estudiantes universitarios y de preparatoria. Tu propósito es analizar documentos académicos, generar resúmenes estructurados, diseñar planes de estudio, construir flashcards y preparar exámenes de práctica. Responde siempre en español.\n\nDIRECTRICES:\n1. (SALUDO) Preséntate como AeroLex AI ÚNICAMENTE en el primer mensaje de la sesión. En mensajes posteriores, omite toda presentación.\n2. (TONO) Estrictamente profesional, técnico y preciso. Sin lenguaje informal, sin jerga coloquial, sin salutaciones efusivas.\n3. (RESPUESTA DIRECTA) Prohibido usar frases introductorias como "Con respecto a tu pregunta..." o "En relación a...". Ve directamente al análisis técnico o la respuesta académica.\n4. (RIGOR) Trata todas las disciplinas —ciencias, humanidades, artes, tecnología— con el mismo nivel de profundidad analítica.\n\nESTRUCTURA RECOMENDADA:\n- Inicia con el análisis o la respuesta directa.\n- Usa estructuras claras: definición, contexto, ejemplos, aplicación.\n- Incluye conceptos clave, datos relevantes y referencias cruzadas.\n- Cuando sea útil, genera preguntas de verificación al final.\n\nFORMATO:\n- Usa ### para títulos de sección, **negritas** para términos clave, - para listas.\n- Separa párrafos con \n\n.\n- Iconos sobrios (🌌 📘) solo cuando aporten jerarquía visual.\n\nCITAS:\n- Referencia documentos con [1], [2]. Al final: [1] Nombre del archivo.';

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

  const prompt = 'Genera exactamente 5 flashcards de estudio basadas en este documento. Responde ÃƒÅ¡NICAMENTE con un array JSON vÃƒÂ¡lido con este formato: [{"pregunta":"...","respuesta":"..."}]. Sin texto extra, sin markdown, solo el JSON puro.\n\nDocumento:\n' + pdfContent.slice(0, 6000);

  try {
    const text = await callNVIDIA([
      { role: 'user', content: prompt }
    ]);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No se encontrÃƒÂ³ JSON en la respuesta');
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

  const prompt = 'Genera un resumen estructurado de este documento con estas secciones exactas en espaÃƒÂ±ol: INTRODUCCIÃƒâ€œN, PUNTOS CLAVE (lista de 5 bullets), y CONCLUSIÃƒâ€œN. Formato limpio y claro.\n\nDocumento:\n' + pdfContent.slice(0, 6000);

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
    if (!jsonMatch) throw new Error('No se encontrÃƒÂ³ JSON en la respuesta');
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
    return res.json({ error: 'Ã¢Å¡Â Ã¯Â¸Â El tiempo es muy corto. Quedan menos de 3 dÃƒÂ­as para el examen.', plan: [] });
  }

  const prompt = `Genera un plan de estudio dÃƒÂ­a por dÃƒÂ­a para preparar un examen de "${materia}" usando el contenido de este documento. Hay ${diffDays} dÃƒÂ­as hasta el examen. Asigna temas del documento a cada dÃƒÂ­a de forma progresiva. Responde ÃƒÅ¡NICAMENTE con un array JSON vÃƒÂ¡lido con este formato: [{"dia": 1, "fecha": "YYYY-MM-DD", "tema": "...", "tiempo": "2 h"}]. Sin texto extra, sin markdown, solo el JSON puro.\n\nDocumento:\n${pdfContent.slice(0, 6000)}`;

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
      `SELECT id, google_id, title, created_at, updated_at, messages, pdfs,
              flashcards, summary, exam, study_plan
       FROM chat_sessions
       WHERE id = $1 AND google_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SesiÃ¯Â¿Â½n no encontrada' });
    }
    const session = result.rows[0];
    console.log('?? GET session:', {
      id: session.id,
      messagesCount: session.messages?.length,
      hasFlashcards: Array.isArray(session.flashcards) && session.flashcards.length > 0,
      hasSummary: !!session.summary,
      hasExam: Array.isArray(session.exam) && session.exam.length > 0,
      hasStudyPlan: !!session.study_plan,
      pdfs: session.pdfs?.length || 0
    });
    res.json({ session });
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Error al obtener sesiÃ¯Â¿Â½n' });
  }
});

app.post('/api/sessions', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });

  const { title, messages, pdfs, flashcards, summary, exam, study_plan } = req.body;
  
  console.log('?? POST /api/sessions', { 
    title, 
    messagesCount: messages?.length,
    hasFlashcards: Array.isArray(flashcards) && flashcards.length > 0,
    hasSummary: !!summary,
    hasExam: Array.isArray(exam) && exam.length > 0,
    hasStudyPlan: !!study_plan
  });

  try {
    const result = await pool.query(
      `INSERT INTO chat_sessions (google_id, title, messages, pdfs, flashcards, summary, exam, study_plan)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        req.user.id, title,
        JSON.stringify(messages || []),
        JSON.stringify(pdfs || []),
        JSON.stringify(flashcards || []),
        summary ? JSON.stringify(summary) : null,
        JSON.stringify(exam || []),
        study_plan ? JSON.stringify(study_plan) : null
      ]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Error al crear sesiÃ¯Â¿Â½n' });
  }
});

app.put('/api/sessions/:id', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });

  const { messages, pdfs, title, flashcards, summary, exam, study_plan } = req.body;
  
  console.log('?? PUT /api/sessions/:id', { 
    id: req.params.id, 
    messagesCount: messages?.length,
    hasFlashcards: Array.isArray(flashcards) && flashcards.length > 0,
    hasSummary: !!summary,
    hasExam: Array.isArray(exam) && exam.length > 0,
    hasStudyPlan: !!study_plan,
    title 
  });

  try {
    await pool.query(
      `UPDATE chat_sessions
       SET messages = $1, pdfs = $2, updated_at = NOW(), title = $3,
           flashcards = $4, summary = $5, exam = $6, study_plan = $7
       WHERE id = $8 AND google_id = $9`,
      [
        JSON.stringify(messages),
        JSON.stringify(pdfs),
        title,
        JSON.stringify(flashcards || []),
        summary ? JSON.stringify(summary) : null,
        JSON.stringify(exam || []),
        study_plan ? JSON.stringify(study_plan) : null,
        req.params.id, req.user.id
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Update session error:', err);
    res.status(500).json({ error: 'Error al actualizar sesiÃ¯Â¿Â½n' });
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
    res.status(500).json({ error: 'Error al eliminar sesiÃ¯Â¿Â½n' });
  }
});

app.listen(PORT, () => {
  console.log(`Ã°Å¸Å’Å’ AeroLex AI corriendo en http://localhost:${PORT}`);
});


