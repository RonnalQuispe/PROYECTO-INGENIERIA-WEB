// ============================================================
// src/routes/api.routes.js
// ============================================================
const express    = require('express');
const router     = express.Router();
const { verifyJWT } = require('../middleware/auth.middleware');

const authCtrl      = require('../controllers/auth.controller');
const ventasCtrl    = require('../controllers/ventas.controller');
const carteraCtrl   = require('../controllers/cartera.controller');
const reportesCtrl  = require('../controllers/reportes.controller');
const clientesCtrl  = require('../controllers/clientes.controller');

// ── AUTH — pública ────────────────────────────────────────────────────────────
router.post('/auth/login', authCtrl.loginAPI);

// ── PROTECCIÓN GLOBAL ─────────────────────────────────────────────────────────
router.use(verifyJWT);

// ── CLIENTES ──────────────────────────────────────────────────────────────────
router.get('/clientes',                              clientesCtrl.buscarClientes);
router.post('/clientes',                             clientesCtrl.crearCliente);

// ── ENTIDADES ─────────────────────────────────────────────────────────────────
router.get('/entidades',                             clientesCtrl.buscarEntidades);
router.post('/entidades',                            clientesCtrl.crearEntidad);

// ── VENTAS ────────────────────────────────────────────────────────────────────
router.get('/ventas',                                ventasCtrl.listarAPI);
router.post('/ventas',                               ventasCtrl.guardarAPI);
router.put('/ventas/:id',                            ventasCtrl.actualizarAPI);
router.delete('/ventas/:id',                         ventasCtrl.eliminarAPI);
router.post('/ventas/:id/cobros',                    ventasCtrl.registrarCobroAPI);
router.patch('/ventas/:id/items/:itemId/entrega',    ventasCtrl.actualizarEntregaItemAPI);

// ── CARTERA ───────────────────────────────────────────────────────────────────
router.get('/cartera',                               carteraCtrl.listarAPI);
router.get('/cartera/:cliente',                      carteraCtrl.detalleAPI);
// ✅ CORRECCIÓN: Ruta para editar pedido desde la app móvil (estaba definida
//    en el controller pero NUNCA registrada aquí — causa del error "no se pudo guardar")
router.put('/cartera/:ventaId/editar',               carteraCtrl.editarVentaAPI);

// ── REPORTES ──────────────────────────────────────────────────────────────────
router.get('/reportes/kpis',                         reportesCtrl.kpisAPI);
router.get('/reportes/dashboard',                    reportesCtrl.dashboardAPI);

module.exports = router;