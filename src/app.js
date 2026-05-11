const express = require('express');
const path    = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const connectDB = require('./database/db');
const app = express();

connectDB();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, '../public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secreto',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

app.use('/',         require('./routes/auth.routes'));
app.use('/ventas',   require('./routes/ventas.routes'));
app.use('/reportes', require('./routes/reportes.routes'));
app.use('/cartera',  require('./routes/cartera.routes'));   // ← NUEVO

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor corriendo en http://localhost:${PORT}`));