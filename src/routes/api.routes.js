// ============================================================
// src/routes/api.routes.js   ← ARCHIVO NUEVO
// ============================================================
// Todas las rutas de la API REST para la app móvil.
// Se monta en app.js como: app.use('/api/v1', require('./routes/api.routes'))
//
// Endpoints disponibles:
//
//   POST   /api/v1/auth/login               → loginAPI (pública)
//
//   GET    /api/v1/ventas                   → listarAPI
//   POST   /api/v1/ventas                   → guardarAPI
//   PUT    /api/v1/ventas/:id               → actualizarAPI
//   DELETE /api/v1/ventas/:id               → eliminarAPI
//   POST   /api/v1/ventas/:id/cobros        → registrarCobroAPI
//
//   GET    /api/v1/cartera                  → listarAPI
//   GET    /api/v1/cartera/:cliente         → detalleAPI
//
//   GET    /api/v1/reportes/kpis            → kpisAPI
//   GET    /api/v1/reportes/dashboard       → dashboardAPI
// ============================================================

const express    = require('express');
const router     = express.Router();
const { verifyJWT } = require('../middleware/auth.middleware');

// Controladores — los mismos archivos que ya tienes
const authCtrl    = require('../controllers/auth.controller');
const ventasCtrl  = require('../controllers/ventas.controller');
const carteraCtrl = require('../controllers/cartera.controller');
const reportesCtrl= require('../controllers/reportes.controller');

// ── AUTH — ruta pública (no requiere JWT) ────────────────────────────────────
// El móvil llama a este endpoint para obtener el token inicial.
// Body: { "usuario": "admin", "contrasena": "1234" }
// Respuesta: { success, token, usuario: { id, usuario } }
router.post('/auth/login', authCtrl.loginAPI);

// ── PROTECCIÓN GLOBAL ────────────────────────────────────────────────────────
// Todo lo que venga después de esta línea requiere el header:
//   Authorization: Bearer <token>
router.use(verifyJWT);

// ── VENTAS ───────────────────────────────────────────────────────────────────
router.get('/ventas',               ventasCtrl.listarAPI);
router.post('/ventas',              ventasCtrl.guardarAPI);
router.put('/ventas/:id',           ventasCtrl.actualizarAPI);
router.delete('/ventas/:id',        ventasCtrl.eliminarAPI);
router.post('/ventas/:id/cobros',   ventasCtrl.registrarCobroAPI);

// ── CARTERA ──────────────────────────────────────────────────────────────────
router.get('/cartera',              carteraCtrl.listarAPI);
router.get('/cartera/:cliente',     carteraCtrl.detalleAPI);

// ── REPORTES ─────────────────────────────────────────────────────────────────
router.get('/reportes/kpis',        reportesCtrl.kpisAPI);
router.get('/reportes/dashboard',   reportesCtrl.dashboardAPI);

module.exports = router;
