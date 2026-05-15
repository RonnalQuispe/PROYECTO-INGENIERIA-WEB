// ============================================================
// src/controllers/cartera.controller.js
// FIX 2: Añadido editarVentaAPI — PUT /api/v1/cartera/:ventaId/editar
// ============================================================

const carteraService = require('../services/cartera.service');

// ─────────────────────────────────────────────────────────────
// WEB — VISTA PRINCIPAL
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
            clientes, filtros,
            kpis: { totalCartera, totalCobrado, totalPendiente, clientesEnDeuda }
        });
    } catch (error) {
        console.error('Error cartera:', error);
        res.status(500).send('Error al cargar la cartera.');
    }
};

// ─────────────────────────────────────────────────────────────
// WEB — VISTA DETALLE
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
// ═════════════════════════════════════════════════════════════

// GET /api/v1/cartera
exports.listarAPI = async (req, res) => {
    const filtros = {
        zona:    req.query.zona    || '',
        cliente: req.query.cliente || ''
    };
    try {
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

// GET /api/v1/cartera/:cliente
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

// ─────────────────────────────────────────────────────────────
// FIX 2: PUT /api/v1/cartera/:ventaId/editar
// Body: { producto, cantidad, items[], total, motivo }
// Guarda historialEdiciones[] en el documento de la venta
// ─────────────────────────────────────────────────────────────
exports.editarVentaAPI = async (req, res) => {
    try {
        const { ventaId } = req.params;
        const datos       = req.body;
        // Usa el usuario de la sesión/token si está disponible
        const usuario = req.usuario?.nombre || req.session?.usuario?.nombre || 'app';

        const ventaActualizada = await carteraService.editarVenta(ventaId, datos, usuario);
        res.json({
            success:  true,
            message:  'Pedido actualizado correctamente',
            ventaId:  ventaActualizada._id,
            total:    ventaActualizada.total,
            historial: ventaActualizada.historialEdiciones?.length || 0,
        });
    } catch (error) {
        console.error('Error editarVentaAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};