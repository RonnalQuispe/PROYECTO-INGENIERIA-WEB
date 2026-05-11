/**
 * UBICACIÓN: src/controllers/cartera.controller.js
 */
const carteraService = require('../services/cartera.service');

// ── VISTA PRINCIPAL: resumen por cliente ────────────────────────────────────
exports.mostrarCartera = async (req, res) => {
    const filtros = {
        zona:    req.query.zona    || '',
        cliente: req.query.cliente || ''
    };

    try {
        const clientes = await carteraService.getResumenCartera(filtros);

        // KPIs globales
        const totalCartera     = clientes.reduce((s, c) => s + c.totalFacturado,  0);
        const totalCobrado     = clientes.reduce((s, c) => s + c.totalPagado,     0);
        const totalPendiente   = clientes.reduce((s, c) => s + c.saldoPendiente,  0);
        const clientesEnDeuda  = clientes.filter(c => c.saldoPendiente > 0).length;

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

// ── VISTA DETALLE: historial de un cliente ───────────────────────────────────
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