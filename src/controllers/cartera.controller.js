// ============================================================
// src/controllers/cartera.controller.js
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
            resumen,
            mensajeExito: req.query.ok   === '1' ? 'Pedido actualizado correctamente.' : null,
            mensajeError: req.query.err  === '1' ? 'No se pudo guardar la edición.'    : null,
        });
    } catch (error) {
        console.error('Error detalle cartera:', error);
        res.redirect('/cartera');
    }
};

// ─────────────────────────────────────────────────────────────
// WEB — POST /:ventaId/editar  (formulario HTML)
// ─────────────────────────────────────────────────────────────
exports.editarVentaDesdeWeb = async (req, res) => {
    const { ventaId }  = req.params;
    const { producto, cantidad, total, motivo, clienteNombre } = req.body;
    const usuario = req.session?.usuario?.nombre || req.session?.usuario || 'web';

    const clienteRedirect = clienteNombre
        ? encodeURIComponent(clienteNombre)
        : '';

    try {
        const datos = { motivo: motivo || 'Edición desde web' };

        if (producto !== undefined) datos.producto = producto.trim();
        if (cantidad !== undefined) datos.cantidad = parseInt(cantidad, 10);
        if (total    !== undefined) datos.total    = parseFloat(total);

        if (Array.isArray(req.body.items)) {
            datos.items = req.body.items.map(it => ({
                _id:      it._id      || undefined,
                nombre:   it.nombre   || '',
                cantidad: parseInt(it.cantidad, 10) || 1,
                precio:   parseFloat(it.precio)     || 0,
            }));
            datos.total = datos.items.reduce((s, it) => s + it.precio * it.cantidad, 0);
            if (datos.items.length > 0) {
                datos.producto = datos.items[0].nombre;
                datos.cantidad = datos.items[0].cantidad;
            }
        }

        await carteraService.editarVenta(ventaId, datos, usuario);
        res.redirect(`/cartera/${clienteRedirect}?ok=1`);
    } catch (error) {
        console.error('Error editarVentaDesdeWeb:', error);
        res.redirect(`/cartera/${clienteRedirect}?err=1`);
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

// PUT /api/v1/cartera/:ventaId/editar  (app móvil)
exports.editarVentaAPI = async (req, res) => {
    try {
        const { ventaId } = req.params;
        const datos       = req.body;
        const usuario = req.usuario?.nombre || req.session?.usuario?.nombre || 'app';

        const ventaActualizada = await carteraService.editarVenta(ventaId, datos, usuario);
        res.json({
            success:   true,
            message:   'Pedido actualizado correctamente',
            ventaId:   ventaActualizada._id,
            total:     ventaActualizada.total,
            historial: ventaActualizada.historialEdiciones?.length || 0,
        });
    } catch (error) {
        console.error('Error editarVentaAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/v1/cartera/:ventaId  (app móvil — pedido vacío)
exports.eliminarVentaAPI = async (req, res) => {
    try {
        const { ventaId } = req.params;
        const Venta = require('../models/venta.model');
        const eliminada = await Venta.findByIdAndDelete(ventaId);
        if (!eliminada)
            return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });
        res.json({ success: true, message: 'Pedido eliminado correctamente.' });
    } catch (error) {
        console.error('Error eliminarVentaAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};