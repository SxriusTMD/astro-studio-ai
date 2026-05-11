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

// Forzar charset utf-8 en todas las respuestas para evitar corrupciones
app.use((req, res, next) => {
  res.charset = 'utf-8';
  next();
});
// ===== PRODUCTION CONFIG =====
const CLIENT_URL = process.env.CLIENT_URL || 'https://www.aerolexai.com';
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS — allow credentials for cookie-based auth
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [CLIENT_URL, 'https://aerolexai.com', 'https://www.aerolexai.com'];
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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

  } catch (err) {
    console.error('? Brevo API Health Check falló:', err.message);
    if (err.body) console.error('   Brevo detalle:', JSON.stringify(err.body, null, 2));
  }
})();

// PostgreSQL
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  client_encoding: 'UTF8'
});
let dbOk = false;

(async () => {
  try {
    await pool.connect();
    dbOk = true;


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

    
    // Migración: columnas para auth por email
    try {
      await pool.query(`ALTER TABLE usuarios ALTER COLUMN google_id DROP NOT NULL`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_method VARCHAR(50) DEFAULT 'google'`);

    } catch (err) {
      console.error('?? Migración email auth:', err.message);
    }

    // Migración: columnas para flashcards, resumen, examen, plan en sesiones
    try {
      await pool.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS flashcards JSONB DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS summary JSONB`);
      await pool.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS exam JSONB DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS study_plan JSONB`);

    } catch (err) {
      console.error('?? Migración columnas de estudio:', err.message);
    }
  } catch (err) {
    console.error('?? PostgreSQL no disponible:', err.message);

  }
})();
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || "aerolex-ai-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${CLIENT_URL}/auth/google/callback`
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
        ON CONFLICT (email) DO UPDATE
        SET nombre = EXCLUDED.nombre, google_id = EXCLUDED.google_id, foto = EXCLUDED.foto
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
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Formato de email inválido' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  try {
    const existente = await pool.query(`SELECT id FROM usuarios WHERE email = $1`, [email]);
    if (existente.rows.length > 0) return res.status(409).json({ error: 'Este email ya está registrado' });

    const password_hash = await bcrypt.hash(password, 10);
    const verification_token = crypto.randomBytes(32).toString('hex');

    await pool.query(`
      INSERT INTO usuarios (google_id, email, password_hash, verification_token, is_verified, auth_method, nombre)
      VALUES ($1, $2, $3, $4, false, 'email', $5)
    `, [crypto.randomUUID(), email, password_hash, verification_token, email.split('@')[0]]);

    // Enviar correo de verificación
    try {

      const verificationUrl = `https://${req.get('host')}/api/auth/verify-email?token=${verification_token}`;
      const mailRes = await brevoClient.transactionalEmails.sendTransacEmail({
        sender: { email: 'aerolexai@gmail.com', name: 'AeroLex AI' },
        to: [{ email }],
        subject: 'Verifica tu correo - AeroLex AI',
        htmlContent: `
          <div style="background:#0a0a1a;color:#e8e8f0;font-family:Arial;padding:40px;text-align:center;border-radius:16px;">
            <div style="font-size:48px;margin-bottom:16px;">??</div>
            <h1 style="color:#8b5cf6;">AeroLex AI</h1>
            <p style="font-size:16px;margin:24px 0;">Gracias por registrarte. Haz clic en el botón para verificar tu correo:</p>
            <a href="${verificationUrl}" style="display:inline-block;background:linear-gradient(135deg,#6c3bd2,#4f46e5);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;">Verificar correo</a>
            <p style="margin-top:24px;font-size:13px;color:#9090b8;">Si no creaste esta cuenta, ignora este mensaje.</p>
          </div>
        `
      });

    } catch (mailErr) {
      console.error('? Error enviando correo a', email, ':', mailErr.message);
      if (mailErr.body) console.error('   Brevo detalle:', JSON.stringify(mailErr.body, null, 2));
      return res.status(500).json({ error: 'Error al enviar el correo de verificación. Intenta de nuevo más tarde.' });
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
    if (result.rows.length === 0) return res.status(400).send('Token inválido o ya verificado');

    const userId = result.rows[0].id;

    await pool.query(
      `UPDATE usuarios SET is_verified = true, verification_token = NULL WHERE id = $1`,
      [userId]
    );

    // Iniciar sesión automáticamente para que al llegar a / ya está autenticado
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

// GET /api/auth/check-status?email=xxx - Verificar si un email ya está verificado
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

// POST /api/auth/login - Iniciar sesión con email + password
app.post('/api/auth/login', async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  try {
    const result = await pool.query(
      `SELECT id, google_id, email, password_hash, is_verified, username, nombre, foto FROM usuarios WHERE email = $1 AND auth_method = 'email'`,
      [email]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });

    const user = result.rows[0];
    if (!user.is_verified) return res.status(403).json({ error: 'Correo no verificado', needsVerification: true });
    if (!user.password_hash) return res.status(401).json({ error: 'Credenciales inválidas' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });

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
      if (err) return res.status(500).json({ error: 'Error al iniciar sesión' });
      res.json({ ok: true, needsUsername });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
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
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Solo letras, números y guión bajo' });

  try {
    const duplicado = await pool.query(`SELECT id FROM usuarios WHERE username = $1`, [username]);
    if (duplicado.rows.length > 0) return res.status(409).json({ error: 'Este nombre de usuario ya está en uso' });

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
          messages,
          max_tokens: 4096
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!nvidiaRes.ok) {
        const errText = await nvidiaRes.text();
        if (nvidiaRes.status === 503 && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
        throw new Error(`NVIDIA API error (${nvidiaRes.status}): ${errText}`);
      }
      
      const data = await nvidiaRes.json();
      return data.choices[0].message.content;
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError' || (err.message.includes('503') && attempt < maxRetries)) {
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
  // contadores reseteados
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
    
    res.json({
      google_id: userId,
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
  const { prompt, pdfContent, sessionId } = req.body;

  const now = new Date();
  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const diaSemana = diasSemana[now.getDay()];
  const dia = String(now.getDate()).padStart(2, '0');
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const anio = now.getFullYear();
  const fechaStr = `${diaSemana}, ${dia}/${mes}/${anio}`;

  const systemInstruction = `Eres AeroLex AI, un analista académico de alto nivel especializado en procesamiento documental. Tu función es procesar documentos, extraer información estructurada y generar resúmenes, flashcards, planes de estudio y exámenes. Responde siempre en español.

INFORMACIÓN DE SISTEMA: Hoy es ${fechaStr}. Utiliza esta fecha exacta como base absoluta para cualquier cálculo de tiempo o plan de estudio.

Para la creación de Planes de Estudio, el rango mínimo permitido es de 3 días. Ajusta la distribución de temas proporcionalmente a los días exactos solicitados por el usuario, sin exceder la fecha límite.

LÓGICA DE INTERACCIÓN:
1. (SALUDO CONTEXTUAL) SI el usuario saluda explícitamente ("Hola", "Buenas", "Hey") O es evidente que inicia una conversación: responde con un saludo breve y profesional. Ejemplo: "AeroLex AI a su disposición. Iniciando análisis documental riguroso." SI es una pregunta de seguimiento técnico: PROHIBIDO saludar. Ve directo al análisis.
2. (INTENCIÓN PROACTIVA) Si el usuario no formula una pregunta técnica pero hay documentos cargados, genera proactivamente un "Resumen Ejecutivo" de 3 puntos clave sobre el contenido del documento. No digas que no tienes instrucciones.

REGLAS DE FORMATO:
1. (PRIVACIDAD EN CITAS) PROHIBIDO mencionar nombres de archivos, extensiones .pdf o rutas. OBLIGATORIO usar etiquetas genéricas: [Fuente 1], [Anexo A], [Documento Principal].
2. (ESTRUCTURA) Usa **negritas** para conceptos clave. Usa listas tabuladas (-) para hallazgos técnicos.
3. (CIERRE) Inserta --- y la sección "📌 Leyenda Técnica:" con una frase que resuma el valor académico de la respuesta.
4. (TONO) Mentoría de postgrado. Técnico, riguroso, profesional. Sin opiniones ni subjetividad.
5. (REGLA DE FORMATO OBLIGATORIA) Estás obligado a usar viñetas (bullet points), **negritas** y saltos de línea dobles para separar conceptos. NUNCA respondas con un solo párrafo de texto continuo.`;

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
    
    // 3. Persistencia atómica de mensajes
    if (sessionId != null && sessionId !== '') {
      try {
        const nuevosMensajes = [
          { role: 'user', content: prompt },
          { role: 'ai', content: text }
        ];
        await pool.query(
          `UPDATE chat_sessions SET messages = COALESCE(messages, '[]'::jsonb) || $1::jsonb WHERE id = $2 AND google_id = $3`,
          [JSON.stringify(nuevosMensajes), sessionId, userId]
        );
      } catch (errDb) {
        console.error('Error guardando mensaje atómico:', errDb);
      }
    }
    
    res.json({ text, chat_used: result.rows[0].chat_count });
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Error al conectar con la IA.' });
  }
});

app.post('/api/flashcards', ensureAuthenticated, async (req, res) => {
  const { pdfContent, sessionId } = req.body;
  if (!pdfContent) return res.status(400).json({ error: 'pdfContent requerido' });

  const prompt = 'Genera exactamente 5 flashcards de estudio basadas en este documento. Responde ÚNICAMENTE con un array JSON válido con este formato: [{"pregunta":"...","respuesta":"..."}]. Sin texto extra, sin markdown, solo el JSON puro.\n\nDocumento:\n' + pdfContent.slice(0, 6000);

  try {
    const text = await callNVIDIA([
      { role: 'user', content: prompt }
    ]);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No se encontró JSON en la respuesta');
    const cards = JSON.parse(jsonMatch[0]);
    
    if (sessionId != null && sessionId !== '') {
      try {
        await pool.query(
          `UPDATE chat_sessions SET flashcards = $1::jsonb WHERE id = $2 AND google_id = $3`,
          [JSON.stringify(cards), sessionId, req.user.id]
        );
      } catch (errDb) {
        console.error('Error guardando flashcards atómicamente:', errDb);
      }
    }
    
    res.json({ cards });
  } catch (err) {
    console.error('Flashcards error:', err);
    res.status(502).json({ error: 'Error al generar flashcards.' });
  }
});

app.post('/api/resumen', ensureAuthenticated, async (req, res) => {
  const { pdfContent, sessionId } = req.body;
  if (!pdfContent) return res.status(400).json({ error: 'pdfContent requerido' });

  const prompt = 'Genera un resumen estructurado de este documento con estas secciones exactas en español: INTRODUCCIÓN, PUNTOS CLAVE (lista de 5 bullets), y CONCLUSIÓN. Formato limpio y claro.\n\nDocumento:\n' + pdfContent.slice(0, 6000);

  try {
    const text = await callNVIDIA([
      { role: 'user', content: prompt }
    ]);
    
    if (sessionId != null && sessionId !== '') {
      try {
        await pool.query(
          `UPDATE chat_sessions SET summary = $1::jsonb WHERE id = $2 AND google_id = $3`,
          [JSON.stringify({ text }), sessionId, req.user.id]
        );
      } catch (errDb) {
        console.error('Error guardando resumen atómicamente:', errDb);
      }
    }
    
    res.json({ text });
  } catch (err) {
    console.error('Resumen error:', err);
    res.status(502).json({ error: 'Error al generar resumen.' });
  }
});

app.post('/api/examen', ensureAuthenticated, async (req, res) => {
  const { pdfContent, sessionId } = req.body;
  if (!pdfContent) return res.status(400).json({ error: 'pdfContent requerido' });

  const prompt = 'Genera exactamente 5 preguntas de opcion multiple basadas en este documento. Cada pregunta debe tener 4 opciones identificadas como A), B), C) y D). Responde UNICAMENTE con un array JSON valido con este formato exacto: [{"pregunta":"...","opciones":["A) ...","B) ...","C) ...","D) ..."],"respuesta_correcta":"A"}]. En respuesta_correcta usa solo una letra: "A", "B", "C" o "D". Sin texto extra, sin markdown, solo el JSON puro.\n\nDocumento:\n' + pdfContent.slice(0, 6000);

  try {
    const text = await callNVIDIA([{ role: 'user', content: prompt }]);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No se encontró JSON en la respuesta');
    const preguntas = JSON.parse(jsonMatch[0]);
    
    if (sessionId != null && sessionId !== '') {
      try {
        await pool.query(
          `UPDATE chat_sessions SET exam = $1::jsonb WHERE id = $2 AND google_id = $3`,
          [JSON.stringify(preguntas), sessionId, req.user.id]
        );
      } catch (errDb) {
        console.error('Error guardando examen atómicamente:', errDb);
      }
    }
    
    res.json({ preguntas });
  } catch (err) {
    console.error('Examen error:', err);
    res.status(502).json({ error: 'Error al generar el examen.' });
  }
});

app.post('/api/plan', ensureAuthenticated, async (req, res) => {
  const { pdfContent, materia, fechaExamen, sessionId } = req.body;
  if (!pdfContent || !materia || !fechaExamen) {
    return res.status(400).json({ error: 'pdfContent, materia y fechaExamen requeridos' });
  }

  const hoy = new Date();
  const examen = new Date(fechaExamen);
  const diffMs = examen - hoy;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 3) {
    return res.json({ error: '⚠️ El tiempo es muy corto. Quedan menos de 3 días para el examen.', plan: [] });
  }

  const now = new Date();
  const hoyStr = now.toISOString().split('T')[0];
  const prompt = `Genera un plan de estudio día por día para preparar un examen de "${materia}" usando el contenido de este documento. La fecha de HOY es ${hoyStr}. Hay ${diffDays} días hasta el examen (${fechaExamen}). El rango mínimo del plan es de 3 días. Asigna temas del documento a cada día de forma progresiva, comenzando desde HOY (${hoyStr}) y distribuyendo equitativamente. Responde ÚNICAMENTE con un array JSON válido con este formato: [{"dia": 1, "fecha": "YYYY-MM-DD", "tema": "...", "tiempo": "2 h"}]. Sin texto extra, sin markdown, solo el JSON puro.\n\nDocumento:\n${pdfContent.slice(0, 6000)}`;

  try {
    const text = await callNVIDIA([{ role: 'user', content: prompt }]);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    let planDataToSave = null;
    let responseData = { diasRestantes: diffDays };

    if (jsonMatch) {
      try {
        const plan = JSON.parse(jsonMatch[0]);
        planDataToSave = { items: plan, subject: materia, examDate: fechaExamen };
        responseData.plan = plan;
      } catch (parseErr) {
        console.error('Plan JSON parse error:', parseErr.message);
        planDataToSave = { items: [], subject: materia, examDate: fechaExamen, fallback: true, text };
        responseData.planTexto = text;
        responseData.fallback = true;
      }
    } else {
      // Fallback: devolver el texto plano como plan legible
      planDataToSave = { items: [], subject: materia, examDate: fechaExamen, fallback: true, text };
      responseData.planTexto = text;
      responseData.fallback = true;
    }

    if (sessionId != null && sessionId !== '') {
      try {
        await pool.query(
          `UPDATE chat_sessions SET study_plan = $1::jsonb WHERE id = $2 AND google_id = $3`,
          [JSON.stringify(planDataToSave), sessionId, req.user.id]
        );
      } catch (errDb) {
        console.error('Error guardando plan atómicamente:', errDb);
      }
    }

    return res.json(responseData);
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
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }
    const session = result.rows[0];
    res.json({ session });
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Error al obtener sesión' });
  }
});

app.post('/api/sessions', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });

  const { title, messages, pdfs, flashcards, summary, exam, study_plan } = req.body;

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
    res.status(500).json({ error: 'Error al crear sesión' });
  }
});

app.put('/api/sessions/:id', ensureAuthenticated, async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: 'BD no disponible' });

  const { messages, pdfs, title, flashcards, summary, exam, study_plan } = req.body;

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
  console.log(`🚀 AeroLex AI corriendo en http://localhost:${PORT}`);
});


