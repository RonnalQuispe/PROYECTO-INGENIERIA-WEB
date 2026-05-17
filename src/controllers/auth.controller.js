// ============================================================
// src/controllers/cartera.controller.js  —  OPTIMIZADO
// ============================================================
// CAMBIOS vs. original:
//   ① MOVIDO el require de Venta al tope del archivo (era dentro de
//     editarVentaAPI y eliminarVentaAPI — re-require en cada request).
//     Node.js cachea módulos, pero la resolución del path en cada
//     llamada tiene overhead innecesario y confunde el árbol de deps.
//   ② editarVentaAPI: lógica de eliminación separada de la lógica de
//     edición — más legible, sin cambio de rendimiento.
//   ③ Resto de métodos: sin cambios funcionales. El rendimiento de este
//     controller depende principalmente de cartera.service.js (ver el
//     archivo cartera.service.js optimizado para los pipelines reales).
// ============================================================

const carteraService = require('../services/cartera.service');
const Venta          = require('../models/venta.model'); // ✅ al tope, no dentro de cada método

// ─────────────────────────────────────────────────────────────
// WEB — VISTA PRINCIPAL
// ─────────────────────────────────────────────────────────────
exports.mostrarCartera = async (req, res) => {
    const filtros = {
        zona:    req.query.zona    || '',
        cliente: req.query.cliente || ''
    };
    try {
        const clientes        = await carteraService.getResumenCartera(filtros);
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
            mensajeExito: req.query.ok  === '1' ? 'Pedido actualizado correctamente.' : null,
            mensajeError: req.query.err === '1' ? 'No se pudo guardar la edición.'    : null,
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

    const clienteRedirect = clienteNombre ? encodeURIComponent(clienteNombre) : '';

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

// PUT /api/v1/cartera/:ventaId/editar
// Si items llega vacío o total === 0 → elimina el pedido directamente.
exports.editarVentaAPI = async (req, res) => {
    try {
        const { ventaId } = req.params;
        const datos       = req.body;
        const usuario     = req.usuario?.nombre || req.session?.usuario?.nombre || 'app';

        // ✅ Venta ya está importado al tope del archivo — no re-require aquí
        const itemsVacios = Array.isArray(datos.items) && datos.items.length === 0;
        const totalCero   = parseFloat(datos.total) === 0;

        // Caso: eliminar pedido vacío
        if (itemsVacios || totalCero) {
            const eliminada = await Venta.findByIdAndDelete(ventaId);
            if (!eliminada)
                return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });
            return res.json({
                success:   true,
                eliminado: true,
                message:   'Pedido eliminado porque quedó sin ítems.',
            });
        }

        // Caso: editar pedido existente
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

// DELETE /api/v1/cartera/:ventaId
exports.eliminarVentaAPI = async (req, res) => {
    try {
        const { ventaId } = req.params;
        // ✅ Venta ya está importado al tope — sin re-require
        const eliminada = await Venta.findByIdAndDelete(ventaId);
        if (!eliminada)
            return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });
        res.json({ success: true, message: 'Pedido eliminado correctamente.' });
    } catch (error) {
        console.error('Error eliminarVentaAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};