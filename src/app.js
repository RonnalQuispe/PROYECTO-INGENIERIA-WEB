
const express    = require('express');
const path       = require('path');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const helmet     = require('helmet');
require('dotenv').config();

const REQUIRED_ENV = ['SESSION_SECRET', 'MONGODB_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`);
    console.error('   Defínelas en tu archivo .env o en el panel de Render.');
    process.exit(1);
}

const connectDB = require('./database/db');
const app = express();
app.set('trust proxy', 1);
connectDB();


app.use(helmet({
    contentSecurityPolicy: false, 
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, '../public')));


app.use(session({
    secret:            process.env.SESSION_SECRET,
    resave:            false,
    saveUninitialized: false,
    store:             MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: {
        maxAge:   1000 * 60 * 60 * 8, // 8 horas (sin cambio)
        httpOnly: true,                // Bloquea acceso desde JS del navegador
        sameSite: 'strict',            
        secure:   process.env.NODE_ENV === 'production' // [FIX-3] HTTPS solo en prod
    }
}));

// ── Rutas ─────────────────────────────────────────────────────────────────────
app.use('/',         require('./routes/auth.routes'));
app.use('/ventas',   require('./routes/ventas.routes'));
app.use('/reportes', require('./routes/reportes.routes'));
app.use('/cartera',  require('./routes/cartera.routes'));
app.use('/api/v1',   require('./routes/api.routes'));

// ── Arranque ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
});