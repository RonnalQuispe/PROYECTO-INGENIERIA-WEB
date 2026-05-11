// ============================================================
// src/controllers/cartera.controller.js
// ============================================================
// MÉTODOS WEB (sin ningún cambio):
//   mostrarCartera, mostrarDetalle
//
// MÉTODOS API (nuevos al final):
//   listarAPI, detalleAPI
// ============================================================

const carteraService = require('../services/cartera.service');

// ─────────────────────────────────────────────────────────────
// WEB — VISTA PRINCIPAL: resumen por cliente
// ─────────────────────────────────────────────────────────────

exports.mostrarCartera = async (req, res) => {
    const filtros = {
        zona:    req.query.zona    || '',
        cliente: req.query.cliente || ''
    };

    try {
        const clientes = await carteraService.getResumenCartera(filtros);

        const totalCartera    = clientes.reduce((s, c) => s + c.totalFacturado, 0);
        const totalCobrado    = clientes.reduce((s, c) => s + c.totalPagado,    0);
        const totalPendiente  = clientes.reduce((s, c) => s + c.saldoPendiente, 0);
        const clientesEnDeuda = clientes.filter(c => c.saldoPendiente > 0).length;

        res.render('cartera/index', {
            usuario: req.session.usuario,
            titulo:  'Cartera de Clientes — Sistema Jalej',
            clientes,
            filtros,
            kpis: { totalCartera, totalCobrado, totalPendiente, clientesEnDeuda }
        });
    } catch (error) {
        console.error('Error cartera:', error);
        res.status(500).send('Error al cargar la cartera.');
    }
};

// ─────────────────────────────────────────────────────────────
// WEB — VISTA DETALLE: historial de un cliente
// ─────────────────────────────────────────────────────────────

exports.mostrarDetalle = async (req, res) => {
    try {
        const nombreCliente = decodeURIComponent(req.params.cliente);
        const resumen       = await carteraService.getDetalleCliente(nombreCliente);

        res.render('cartera/detalle', {
            usuario: req.session.usuario,
            titulo:  `Cartera · ${nombreCliente}`,
            resumen
        });
    } catch (error) {
        console.error('Error detalle cartera:', error);
        res.redirect('/cartera');
    }
};

// ═════════════════════════════════════════════════════════════
// API — MÉTODOS JSON PARA LA APP MÓVIL
// Rutas montadas en /api/v1/cartera (ver api.routes.js)
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// API — GET /api/v1/cartera
// Query params: zona, cliente
// Responde: { success, data: { clientes[], kpis{} } }
// ─────────────────────────────────────────────────────────────

exports.listarAPI = async (req, res) => {
    const filtros = {
        zona:    req.query.zona    || '',
        cliente: req.query.cliente || ''
    };

    try {
        // Reutiliza exactamente el mismo service que usa mostrarCartera
        const clientes = await carteraService.getResumenCartera(filtros);

        const kpis = {
            totalCartera:    clientes.reduce((s, c) => s + c.totalFacturado, 0),
            totalCobrado:    clientes.reduce((s, c) => s + c.totalPagado,    0),
            totalPendiente:  clientes.reduce((s, c) => s + c.saldoPendiente, 0),
            clientesEnDeuda: clientes.filter(c => c.saldoPendiente > 0).length
        };

        res.json({ success: true, data: { clientes, kpis } });
    } catch (error) {
        console.error('Error listarAPI cartera:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// API — GET /api/v1/cartera/:cliente
// Responde: { success, data: resumen del cliente }
// ─────────────────────────────────────────────────────────────

exports.detalleAPI = async (req, res) => {
    try {
        const nombreCliente = decodeURIComponent(req.params.cliente);
        const resumen       = await carteraService.getDetalleCliente(nombreCliente);

        res.json({ success: true, data: resumen });
    } catch (error) {
        console.error('Error detalleAPI cartera:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
