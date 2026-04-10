const express = require('express');
const path    = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const connectDB = require('./database/db');
const app = express();

// ── Conectar a MongoDB ──────────────────────────────────────────────────────
connectDB();

// ── Middlewares básicos ─────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ── Motor de vistas ─────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Archivos estáticos ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── Sesiones ────────────────────────────────────────────────────────────────
app.use(session({
    secret: process.env.SESSION_SECRET || 'secreto',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 horas
}));

// ── Rutas ───────────────────────────────────────────────────────────────────
app.use('/', require('./routes/auth.routes'));
app.use('/ventas', require('./routes/ventas.routes'));

// ── Iniciar servidor ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor corriendo en http://localhost:${PORT}`));
