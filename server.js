require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { supabase } = require('./src/supabaseClient');
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

// ===== EMAIL CONFIG (Nodemailer SMTP & Brevo API Fallback) =====
const { BrevoClient } = require('@getbrevo/brevo');
const brevoClient = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Test SMTP connection at startup
transporter.verify((error) => {
  if (error) {
    console.error('❌ Nodemailer SMTP Connection error:', error.message);
  } else {
    console.log('🚀 Nodemailer SMTP Connection established successfully!');
  }
});

async function sendMail({ to, subject, htmlContent }) {
  try {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const info = await transporter.sendMail({
          from: `"AeroLex AI" <${process.env.EMAIL_USER}>`,
          to,
          subject,
          html: htmlContent
        });
        console.log('✅ Email sent via Nodemailer SMTP:', info.messageId);
        return { success: true, method: 'nodemailer', id: info.messageId };
      } catch (smtpError) {
        console.error('❌ Nodemailer SMTP failed, falling back to Brevo:', smtpError.message);
      }
    }

    if (process.env.BREVO_API_KEY) {
      try {
        const result = await brevoClient.transactionalEmails.sendTransacEmail({
          sender: { email: 'aerolexai@gmail.com', name: 'AeroLex AI' },
          to: [{ email: to }],
          subject,
          htmlContent
        });
        console.log('✅ Email sent via Brevo:', result);
        return { success: true, method: 'brevo', result };
      } catch (brevoError) {
        console.warn('❌ Brevo API failed:', brevoError.message);
      }
    }

    console.warn('⚠️ No mail transporter configured or all mail delivery methods failed');
    return { success: false, error: 'No mail transporter configured' };
  } catch (err) {
    console.warn('⚠️ sendMail failed completely:', err.message);
    return { success: false, error: err.message };
  }
}

// Health check al iniciar
(async () => {
  try {
    await sendMail({
      to: 'aerolexai@gmail.com',
      subject: '📧 Sistema de Correo Conectado - AeroLex AI',
      htmlContent: '<p>Servidor iniciado correctamente. El sistema de correo funciona.</p>'
    });
  } catch (err) {
    console.error('❌ Sistema de Correo Health Check falló:', err.message);
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
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS active_minutes INTEGER DEFAULT 0`);

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

  try {
    await syncUserToDB(userProfile.email, userProfile.displayName);
  } catch (err) {
    console.error('Error sincronizando usuario en Supabase:', err.message);
  }

  done(null, userProfile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'No autenticado' });
}

async function syncUserToDB(email, name) {
  if (!supabase) {
    console.warn('Supabase no configurado: faltan SUPABASE_URL o SUPABASE_KEY');
    return null;
  }

  if (!email) {
    console.warn('Supabase sync omitido: email requerido');
    return null;
  }

  const { data: existingUser, error: selectError } = await supabase
    .from('users')
    .select('email, name, plan, chat_count')
    .eq('email', email)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Supabase user lookup failed: ${selectError.message}`);
  }

  if (existingUser) {
    const { data, error } = await supabase
      .from('users')
      .update({ name: name || existingUser.name || email.split('@')[0] })
      .eq('email', email)
      .select('email, name, plan, chat_count')
      .single();

    if (error) {
      throw new Error(`Supabase user sync failed: ${error.message}`);
    }

    return data;
  }

  const { data, error } = await supabase
    .from('users')
    .insert({
      email,
      name: name || email.split('@')[0],
      plan: 'free',
      chat_count: 0
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Supabase user sync failed: ${error.message}`);
  }

  return data;
}

async function getSupabaseUserForLimits(authUser) {
  if (!supabase) {
    throw new Error('Supabase no configurado: faltan SUPABASE_URL o SUPABASE_KEY');
  }

  const email = authUser?.email;
  if (!email) {
    throw new Error('Usuario autenticado sin email para validar limites');
  }

  const { data, error } = await supabase
    .from('users')
    .select('email, name, plan, chat_count')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase limit lookup failed: ${error.message}`);
  }

  if (data) return data;

  return syncUserToDB(email, authUser.displayName || email.split('@')[0]);
}

async function incrementSupabaseChatCount(email, currentCount) {
  if (!supabase || !email) return null;

  const nextCount = Number(currentCount || 0) + 1;
  const { data, error } = await supabase
    .from('users')
    .update({ chat_count: nextCount })
    .eq('email', email)
    .select('chat_count')
    .single();

  if (error) {
    throw new Error(`Supabase chat_count increment failed: ${error.message}`);
  }

  return data?.chat_count ?? nextCount;
}

function isProPlan(plan) {
  const normalized = String(plan || '').toLowerCase();
  return normalized === 'pro' || normalized === 'premium';
}

async function getSupabaseAuthenticatedUser(req) {
  const user = await getSupabaseUserForLimits(req.user);
  return {
    ...user,
    isPro: isProPlan(user?.plan)
  };
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
      const mailRes = await sendMail({
        to: email,
        subject: 'Verifica tu correo - AeroLex AI',
        htmlContent: `
          <div style="background:#0a0a1a;color:#e8e8f0;font-family:Arial;padding:40px;text-align:center;border-radius:16px;">
            <div style="font-size:48px;margin-bottom:16px;">🚀</div>
            <h1 style="color:#8b5cf6;">AeroLex AI</h1>
            <p style="font-size:16px;margin:24px 0;">Gracias por registrarte. Haz clic en el botón para verificar tu correo:</p>
            <a href="${verificationUrl}" style="display:inline-block;background:linear-gradient(135deg,#6c3bd2,#4f46e5);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;">Verificar correo</a>
            <p style="margin-top:24px;font-size:13px;color:#9090b8;">Si no creaste esta cuenta, ignora este mensaje.</p>
          </div>
        `
      });
      if (!mailRes || !mailRes.success) {
        console.warn('⚠️ Registro exitoso, pero falló el envío del correo de verificación a:', email, mailRes?.error);
      }
    } catch (mailErr) {
      console.warn('⚠️ Error enviando correo a', email, ':', mailErr.message);
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
    const displayName = user.username || user.nombre || user.email.split('@')[0];

    try {
      await syncUserToDB(user.email, displayName);
    } catch (err) {
      console.error('Error sincronizando usuario en Supabase:', err.message);
    }

    req.login({
      id: user.google_id,
      email: user.email,
      displayName,
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
    const displayName = user.username || user.nombre || email.split('@')[0];

    try {
      await syncUserToDB(user.email, displayName);
    } catch (err) {
      console.error('Error sincronizando usuario en Supabase:', err.message);
    }

    req.login({
      id: user.google_id,
      email: user.email,
      displayName,
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

// POST /api/auth/reset-password - Recuperación de contraseña con Supabase
app.post('/api/auth/reset-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `https://${req.get('host')}/complete-profile`
    });
    if (error) throw error;
    res.json({ ok: true, message: 'Te hemos enviado un enlace de recuperación' });
  } catch (err) {
    console.error('Error en resetPasswordForEmail:', err.message);
    res.status(500).json({ error: err.message || 'Error al enviar correo de recuperación' });
  }
});

// POST /api/auth/update-email - Actualizar email del usuario autenticado en Supabase y local
app.post('/api/auth/update-email', ensureAuthenticated, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });

  try {
    const userId = req.user.google_id || req.user.id;
    
    // Ejecutar Supabase updateUserById
    const { data, error } = await supabase.auth.admin.updateUserById(userId, { email });
    if (error) throw error;
    
    // También actualizamos en la BD local
    await pool.query(`UPDATE usuarios SET email = $1 WHERE google_id = $2`, [email, userId]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando email:', err.message);
    res.status(500).json({ error: err.message || 'Error al actualizar email en Supabase' });
  }
});


// POST /api/supabase/update - Sync active_minutes to Supabase users table and local usuarios table
app.post('/api/supabase/update', ensureAuthenticated, async (req, res) => {
  const { table, data, matchField, matchValue } = req.body;
  if (!table || !data || !matchField || !matchValue) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos' });
  }

  // Permite sincronizar minutos activos para el usuario logueado
  if (table === 'users' && matchField === 'id') {
    // Seguridad extra: verificar que el usuario que actualiza es el mismo autenticado
    const userId = req.user.google_id || req.user.id;
    if (String(matchValue) !== String(userId)) {
      return res.status(403).json({ error: 'No autorizado a actualizar datos de otro usuario' });
    }

    try {
      const activeMinutes = data.active_minutes;
      
      // 1. Actualizar en Supabase real si está configurado
      let supabaseResult = null;
      if (supabase) {
        const { data: sData, error: sError } = await supabase
          .from('users')
          .update({ active_minutes: activeMinutes })
          .eq('id', userId)
          .select();
        
        if (sError) {
          console.warn('Supabase active_minutes sync warning:', sError.message);
        } else {
          supabaseResult = sData;
        }
      }

      // 2. Actualizar en la BD PostgreSQL local
      await pool.query(
        `UPDATE usuarios SET active_minutes = $1 WHERE google_id = $2 OR email = $3`,
        [activeMinutes, userId, req.user.email]
      );

      return res.json({ ok: true, data: supabaseResult });
    } catch (err) {
      console.error('Error in /api/supabase/update:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Operación no permitida' });
});

// POST /api/supabase/select - Query real top users from Supabase or local PostgreSQL as fallback
app.post('/api/supabase/select', ensureAuthenticated, async (req, res) => {
  const { table, select, order, ascending, limit } = req.body;
  if (!table || !select || !order) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos' });
  }

  if (table === 'users') {
    try {
      let topUsers = [];
      let loadedFromSupabase = false;

      // 1. Intentar consultar Supabase si está disponible
      if (supabase) {
        try {
          const { data: sData, error: sError } = await supabase
            .from('users')
            .select('id, email, name, active_minutes, avatar_url, foto')
            .order('active_minutes', { ascending: false })
            .limit(limit || 5);
          
          if (!sError && sData) {
            topUsers = sData;
            loadedFromSupabase = true;
          } else if (sError) {
            console.warn('Supabase select error, falling back to local DB:', sError.message);
          }
        } catch (sErr) {
          console.warn('Supabase exception, falling back to local DB:', sErr.message);
        }
      }

      // 2. Si Supabase no está configurado o falló, usar la BD local de PostgreSQL como fallback
      if (!loadedFromSupabase) {
        const localResult = await pool.query(
          `SELECT google_id as id, email, nombre as name, active_minutes, foto 
           FROM usuarios 
           ORDER BY COALESCE(active_minutes, 0) DESC 
           LIMIT $1`,
          [limit || 5]
        );
        topUsers = localResult.rows;
      }

      // Mapear los campos para que sean compatibles con el frontend (name, full_name, etc.)
      const formattedUsers = topUsers.map(u => ({
        id: u.id,
        email: u.email,
        full_name: u.name, // Soportar ambos full_name y name
        name: u.name,
        active_minutes: u.active_minutes || 0,
        avatar_url: u.avatar_url || u.foto || ''
      }));

      return res.json({ data: formattedUsers });
    } catch (err) {
      console.error('Error in /api/supabase/select:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Operación no permitida' });
});


// Helper: text chunking & RAG-lite context selections
function chunkText(text, chunkSize = 4000) {
  if (!text) return [];
  const paragraphs = text.split(/\n+/);
  const chunks = [];
  let currentChunk = '';
  
  for (const p of paragraphs) {
    if ((currentChunk.length + p.length) > chunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = p;
    } else {
      currentChunk += '\n' + p;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

function getRelevantChunksForQuery(query, fullText, maxChunks = 3, chunkSize = 4000) {
  if (!fullText) return '';
  const chunks = chunkText(fullText, chunkSize);
  if (chunks.length <= maxChunks) return fullText;
  
  const queryWords = String(query || '').toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);
    
  if (queryWords.length === 0) {
    return getEvenlyDistributedChunks(fullText, maxChunks, chunkSize);
  }
  
  const scoredChunks = chunks.map((chunk, index) => {
    const chunkTextLower = chunk.toLowerCase();
    let score = 0;
    queryWords.forEach(word => {
      const occurrences = (chunkTextLower.match(new RegExp(word, 'g')) || []).length;
      score += occurrences;
    });
    return { chunk, score, index };
  });
  
  scoredChunks.sort((a, b) => b.score - a.score || a.index - b.index);
  
  const selected = scoredChunks.slice(0, maxChunks);
  selected.sort((a, b) => a.index - b.index);
  
  return selected.map(s => s.chunk).join('\n\n[...]\n\n');
}

function getEvenlyDistributedChunks(fullText, maxChunks = 3, chunkSize = 4000) {
  if (!fullText) return '';
  const chunks = chunkText(fullText, chunkSize);
  if (chunks.length <= maxChunks) return fullText;
  
  const selectedChunks = [];
  const total = chunks.length;
  for (let i = 0; i < maxChunks; i++) {
    const targetIdx = Math.floor((i * (total - 1)) / (maxChunks - 1));
    selectedChunks.push(chunks[targetIdx]);
  }
  
  return selectedChunks.join('\n\n[...]\n\n');
}

// Helper: call NVIDIA NIM API
async function callNVIDIA(messages, options = {}) {
  const maxRetries = 2;
  let lastError;
  
  const model = options.model || 'meta/llama-3.1-8b-instruct';
  const temperature = options.temperature !== undefined ? options.temperature : 0.7;
  const max_tokens = options.max_tokens || 4096;
  
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
          model,
          messages,
          temperature,
          max_tokens
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
    let plan = row?.plan || 'free';
    let chatUsed = row?.chat_count || 0;
    try {
      const supabaseUser = await getSupabaseUserForLimits(req.user);
      if (supabaseUser) {
        plan = supabaseUser.plan || plan;
        chatUsed = supabaseUser.chat_count ?? chatUsed;
      }
    } catch (supabaseErr) {
      console.error('Supabase limits merge error:', supabaseErr.message);
    }

    const isPremium = isProPlan(plan);
    
    res.json({
      google_id: userId,
      plan,
      chat_used: chatUsed,
      exam_used: row?.exam_count || 0,
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

// POST /api/user/increment - increment a counter
app.post('/api/user/increment', ensureAuthenticated, async (req, res) => {
  const { type } = req.body;
  if (!['chat', 'exam'].includes(type)) return res.status(400).json({ error: 'Tipo inválido' });
  
  try {
    const column = type === 'chat' ? 'chat_count' : 'exam_count';
    const result = await pool.query(
      `UPDATE usuarios SET ${column} = ${column} + 1 WHERE google_id = $1 RETURNING ${column}`,
      [req.user.id]
    );
    res.json({ [type + '_used']: result.rows[0][column] });
  } catch (err) {
    console.error('Increment error:', err);
    res.status(500).json({ error: 'Error al incrementar contador' });
  }
});

// POST /api/user/upgrade-success - Simulates a successful payment webhook
app.post('/api/user/upgrade-success', ensureAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE usuarios SET plan = 'premium' WHERE google_id = $1 RETURNING plan`,
      [req.user.id]
    );
    res.json({ success: true, plan: result.rows[0].plan });
  } catch (err) {
    console.error('Upgrade error:', err);
    res.status(500).json({ error: 'Error al actualizar el plan' });
  }
});

app.post('/api/documents', ensureAuthenticated, async (req, res) => {
  const { file_name, extracted_text, summary } = req.body;
  if (!file_name || !extracted_text) {
    return res.status(400).json({ error: 'file_name y extracted_text requeridos' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Supabase no configurado' });
  }

  try {
    const user = await getSupabaseAuthenticatedUser(req);
    if (!user.isPro) {
      return res.status(403).json({ error: 'Pro plan required', code: 'PRO_REQUIRED' });
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_email: user.email,
        file_name,
        extracted_text,
        summary: summary || ''
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ document: data });
  } catch (err) {
    console.error('Supabase document save error:', err.message);
    res.status(500).json({ error: 'Error al guardar documento en la nube' });
  }
});

app.get('/api/documents', ensureAuthenticated, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase no configurado' });
  }

  try {
    const user = await getSupabaseAuthenticatedUser(req);
    if (!user.isPro) {
      return res.status(403).json({ error: 'Pro plan required', code: 'PRO_REQUIRED' });
    }

    const { data, error } = await supabase
      .from('documents')
      .select('id, user_email, file_name, extracted_text, summary, created_at')
      .eq('user_email', user.email)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ documents: data || [] });
  } catch (err) {
    console.error('Supabase documents fetch error:', err.message);
    res.status(500).json({ error: 'Error al obtener documentos de la nube' });
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

  const systemInstruction = `Eres AeroLex AI, un copiloto y tutor de estudio de élite. Tu identidad está inspirada en misiones de exploración espacial y el descubrimiento cósmico. Tu tono es sumamente inteligente, entusiasta, empático y motivador. NUNCA menciones que eres un modelo de lenguaje de terceros. Tu misión es guiar de forma dinámica a estudiantes de preparatoria y universidad en México para dominar sus materias y PDFs. Responde siempre en español.

INFORMACIÓN DE SISTEMA: Hoy es ${fechaStr}. Utiliza esta fecha exacta como base absoluta para cualquier cálculo de tiempo o plan de estudio.

Para la creación de Planes de Estudio, el rango mínimo permitido es de 3 días. Ajusta la distribución de temas proporcionalmente a los días exactos solicitados por el usuario, sin exceder la fecha límite.

LÓGICA DE INTERACCIÓN:
1. (SALUDO CONTEXTUAL) Si el usuario saluda explícitamente ("Hola", "Buenas", "Hey", "Qué tal", "Saludos") o inicia de forma casual la conversación: Responde de forma sumamente cálida, amigable y motivadora. Usa emojis espaciales (🚀, ✨, 🛰️). Ejemplo: "¡Hola! 🚀 Qué gusto tenerte a bordo de AeroLex AI hoy. Estoy listo para ayudarte a despegar con tus materias y repasar tus PDFs. ¿Qué tema o documento te gustaría que exploremos hoy?" Si la pregunta es puramente técnica o de seguimiento, ve directo al grano de forma clara.
2. (INTENCIÓN PROACTIVA) Si hay documentos cargados y el usuario te saluda o hace preguntas casuales de conversación, NO generes un resumen del documento de inmediato; en su lugar, entabla un diálogo amigable y pregúntale si quiere que le hagas un resumen, flashcards o un examen de los documentos cargados. Solo si el usuario te pide expresamente procesar o analizar un documento sin dar instrucciones específicas, genera proactivamente un "Resumen Ejecutivo" de 3 puntos clave sobre el contenido.

REGLAS DE FORMATO Y ESTILO:
1. (PRIVACIDAD EN CITAS) PROHIBIDO mencionar nombres de archivos con extensiones .pdf o rutas reales en tus respuestas. OBLIGATORIO usar etiquetas genéricas cuando cites información: [Fuente 1], [Anexo A], [Documento Principal].
2. (ESTRUCTURA MÓVIL Y CLARA) Usa **negritas** para resaltar conceptos y términos clave. Usa viñetas estructuradas (-) para listas o ideas puntuales.
3. (CIERRE) Inserta una línea de separación (---) y al final de tu respuesta agrega una sección llamada "📌 Leyenda Técnica:" con una frase inspiradora o dato curioso que motive el estudio o resuma la importancia académica de lo aprendido.
4. (TONO DE APRENDIZAJE) Actúa como un tutor experto, claro y directo. Usa explicaciones sencillas y ejemplos prácticos para explicar temas difíciles. Sé empático, profesional y alienta siempre al estudiante, sin usar metáforas confusas.
5. (FORMATO DE PARRAFO) Deja siempre saltos de línea dobles entre secciones y viñetas para que la lectura sea sumamente fluida y touch-friendly en dispositivos móviles. NUNCA generes bloques densos o de un solo párrafo de texto continuo.
6. REGLA DE FORMATO: NO utilices sintaxis LaTeX ni ecuaciones matemáticas (como $\rightarrow$). Utiliza EXCLUSIVAMENTE caracteres Unicode estándar (ejemplo: -> o ➔) para las flechas y viñetas.`;

  const contextPrompt = pdfContent
    ? `Contexto del PDF:\n${getRelevantChunksForQuery(prompt, pdfContent)}\n\n${prompt}`
    : prompt;

  try {
    // 0. Server-Side Guardrail: Check real limits in Supabase before calling AI
    let supabaseUser;
    try {
      supabaseUser = await getSupabaseUserForLimits(req.user);
    } catch (limitErr) {
      console.error('Supabase limit validation error:', limitErr.message);
      return res.status(503).json({ error: 'Error validating limits', code: 'LIMIT_VALIDATION_FAILED' });
    }

    const plan = String(supabaseUser?.plan || 'free').toLowerCase();
    const chatCount = Number(supabaseUser?.chat_count || 0);
    const isUnlimited = plan === 'pro' || plan === 'premium';

    if (!isUnlimited && chatCount >= 10) {
      return res.status(403).json({ error: 'Limit reached', code: 'LIMIT_EXCEEDED' });
    }

    // 1. Primero llamar a NVIDIA NIM
    const text = await callNVIDIA([
      { role: 'system', content: systemInstruction },
      { role: 'user', content: contextPrompt }
    ]);
    
    // 2. SOLO si NVIDIA responde exitosamente, incrementar el contador
    const userId = req.user.id;
    let chatUsed = chatCount;
    if (!isUnlimited) {
      try {
        chatUsed = await incrementSupabaseChatCount(supabaseUser.email, chatCount);
      } catch (incrementErr) {
        console.error('Supabase chat_count increment error:', incrementErr.message);
        chatUsed = chatCount;
      }
    }
    
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
    
    res.json({ text, chat_used: chatUsed });
  } catch (err) {
    console.error("🔥 ERROR CRÍTICO EN /api/chat:", err);
    res.status(500).json({ error: "Fallo en el motor de IA" });
  }
});

app.post('/api/flashcards', ensureAuthenticated, async (req, res) => {
  const { extracted_text, sessionId } = req.body;
  if (!extracted_text) return res.status(400).json({ error: 'extracted_text requerido' });

  const prompt = 'Genera de 5 a 10 flashcards de estudio (conceptos clave) basadas en este documento. Responde ÚNICAMENTE con un array JSON puro (sin markdown) con este formato exacto: [{"front":"Concepto o pregunta corta","back":"Definición o respuesta detallada"}].\n\nDocumento:\n' + getEvenlyDistributedChunks(extracted_text, 3);

  try {
    const text = await callNVIDIA([
      { role: 'user', content: prompt }
    ], { model: 'meta/llama-3.1-8b-instruct', temperature: 0.2 });
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

  const prompt = 'Genera un resumen estructurado de este documento con estas secciones exactas en español: INTRODUCCIÓN, PUNTOS CLAVE (lista de 5 bullets), y CONCLUSIÓN. Formato limpio y claro.\n\nDocumento:\n' + getEvenlyDistributedChunks(pdfContent, 3);

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

  const prompt = 'Genera exactamente 5 preguntas de opcion multiple basadas en este documento. Cada pregunta debe tener 4 opciones identificadas como A), B), C) y D). Responde UNICAMENTE con un array JSON valido con este formato exacto: [{"pregunta":"...","opciones":["A) ...","B) ...","C) ...","D) ..."],"respuesta_correcta":"A"}]. En respuesta_correcta usa solo una letra: "A", "B", "C" o "D". Sin texto extra, sin markdown, solo el JSON puro.\n\nDocumento:\n' + getEvenlyDistributedChunks(pdfContent, 3);

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

app.post('/api/exam', ensureAuthenticated, async (req, res) => {
  const { extracted_text, sessionId } = req.body;
  if (!extracted_text) return res.status(400).json({ error: 'extracted_text requerido' });

  const prompt = 'Genera exactamente 5 preguntas de opcion multiple basadas en este documento. Responde UNICAMENTE con un array JSON puro (sin markdown, sin bloques de código) con este formato exacto: [{"question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": "A"}]. En correctAnswer usa solo el texto exacto de la opción correcta. Documento:\n' + getEvenlyDistributedChunks(extracted_text, 3);

  try {
    const text = await callNVIDIA([{ role: 'user', content: prompt }]);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No se encontró JSON en la respuesta');
    const questions = JSON.parse(jsonMatch[0]);
    
    // Si necesitas persistencia en bd
    if (sessionId != null && sessionId !== '') {
      try {
        await pool.query(
          `UPDATE chat_sessions SET exam = $1::jsonb WHERE id = $2 AND google_id = $3`,
          [JSON.stringify(questions), sessionId, req.user.id]
        );
      } catch (errDb) {
        console.error('Error guardando exam atómicamente:', errDb);
      }
    }
    
    res.json({ questions });
  } catch (err) {
    console.error('Exam error:', err);
    res.status(502).json({ error: 'Error al generar el examen interactivo.' });
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
  
  const systemPrompt = `Eres un planeador de estudio de alta precisión de AeroLex AI. REGLA CRÍTICA: NO INVENTES TEMAS GENÉRICOS (ej. 'Introducción', 'Conceptos básicos'). Extrae los nombres de los temas EXACTOS y ESPECÍFICOS directamente del documento proporcionado. Si el texto habla de 'Matrices Inversas por Gauss', ese debe ser el título del día. Responde ÚNICAMENTE con un array JSON válido con este formato: [{"dia": 1, "fecha": "YYYY-MM-DD", "tema": "...", "tiempo": "2 h"}]. Sin texto extra, sin markdown, solo el JSON puro. REGLA DE FORMATO: NO utilices sintaxis LaTeX ni ecuaciones matemáticas (como $\rightarrow$). Utiliza EXCLUSIVAMENTE caracteres Unicode estándar (ejemplo: -> o ➔) para las flechas y viñetas.`;
  
  const prompt = `Genera un plan de estudio día por día para preparar un examen de "${materia}" usando el contenido de este documento. La fecha de HOY es ${hoyStr}. Hay ${diffDays} días hasta el examen (${fechaExamen}). El rango mínimo del plan es de 3 días. Asigna temas del documento a cada día de forma progresiva, comenzando desde HOY (${hoyStr}) y distribuyendo equitativamente.\n\nDocumento:\n${getEvenlyDistributedChunks(pdfContent, 3)}`;

  try {
    const text = await callNVIDIA([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ], { model: 'meta/llama-3.1-8b-instruct', temperature: 0.2, max_tokens: 1024 });

    let cleanText = text || '';
    // Quitar backticks de Markdown
    cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();

    const startIdx = cleanText.indexOf('[');
    const endIdx = cleanText.lastIndexOf(']');

    let planDataToSave = null;
    let responseData = { diasRestantes: diffDays };

    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
      const jsonString = cleanText.substring(startIdx, endIdx + 1).trim();
      try {
        const plan = JSON.parse(jsonString);
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
    res.status(500).json({ error: "Fallo en el motor de IA" });
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


