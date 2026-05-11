// ============================================================
// src/controllers/reportes.controller.js
// ============================================================
// MÉTODOS WEB (sin ningún cambio):
//   mostrarDashboard
//
// MÉTODOS API (nuevos al final):
//   dashboardAPI, kpisAPI
// ============================================================

const reportesService = require('../services/reportes.service');

// ─────────────────────────────────────────────────────────────
// WEB — DASHBOARD COMPLETO (renderiza EJS)
// ─────────────────────────────────────────────────────────────

exports.mostrarDashboard = async (req, res) => {
    const filtros = {
        mes:        req.query.mes        || '',
        anio:       req.query.anio       || '',
        zona:       req.query.zona       || '',
        fechaDesde: req.query.fechaDesde || '',
        fechaHasta: req.query.fechaHasta || ''
    };
    const anioHistorico = req.query.anioHistorico || new Date().getFullYear();

    try {
        const [
            kpis,
            ventasPorMes,
            topProductos,
            productosMenos,
            ventasPorZona,
            clientesFrecuentes,
            topPorMesHistorico,
            abastecimiento,
            ventasPorDia
        ] = await Promise.all([
            reportesService.getKPIs(),
            reportesService.getVentasPorMes(),
            reportesService.getTopProductos(filtros),
            reportesService.getProductosMenosVendidos(filtros),
            reportesService.getVentasPorZona(filtros),
            reportesService.getClientesFrecuentes(filtros),
            reportesService.getTopProductosPorMesHistorico(anioHistorico),
            reportesService.getProyeccionAbastecimiento(),
            reportesService.getVentasPorDia(filtros)
        ]);

        res.render('reportes/dashboard', {
            usuario: req.session.usuario,
            titulo:  'Dashboard — Sistema Jalej',
            kpis,
            chartVentasMes:    JSON.stringify(ventasPorMes),
            chartTopProductos: JSON.stringify(topProductos),
            chartZonas:        JSON.stringify(ventasPorZona),
            chartDias:         JSON.stringify(ventasPorDia),
            topProductos,
            productosMenos,
            ventasPorZona,
            clientesFrecuentes,
            topPorMesHistorico,
            abastecimiento,
            filtros,
            anioHistorico,
            aniosDisponibles: [
                new Date().getFullYear(),
                new Date().getFullYear() - 1,
                new Date().getFullYear() - 2
            ]
        });
    } catch (error) {
        console.error('Error en Dashboard:', error);
        res.status(500).send('Error al cargar el dashboard.');
    }
};

// ═════════════════════════════════════════════════════════════
// API — MÉTODOS JSON PARA LA APP MÓVIL
// Rutas montadas en /api/v1/reportes (ver api.routes.js)
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// API — GET /api/v1/reportes/dashboard
// Query params: mes, anio, zona, fechaDesde, fechaHasta
// Responde los datos esenciales del dashboard en JSON.
// (El móvil dibuja sus propios gráficos con estos datos.)
// ─────────────────────────────────────────────────────────────

exports.dashboardAPI = async (req, res) => {
    const filtros = {
        mes:        req.query.mes        || '',
        anio:       req.query.anio       || '',
        zona:       req.query.zona       || '',
        fechaDesde: req.query.fechaDesde || '',
        fechaHasta: req.query.fechaHasta || ''
    };
    const anioHistorico = req.query.anioHistorico || new Date().getFullYear();

    try {
        // Reutiliza exactamente los mismos services que usa mostrarDashboard
        const [
            kpis,
            ventasPorMes,
            topProductos,
            productosMenos,
            ventasPorZona,
            clientesFrecuentes,
            topPorMesHistorico,
            abastecimiento,
            ventasPorDia
        ] = await Promise.all([
            reportesService.getKPIs(),
            reportesService.getVentasPorMes(),
            reportesService.getTopProductos(filtros),
            reportesService.getProductosMenosVendidos(filtros),
            reportesService.getVentasPorZona(filtros),
            reportesService.getClientesFrecuentes(filtros),
            reportesService.getTopProductosPorMesHistorico(anioHistorico),
            reportesService.getProyeccionAbastecimiento(),
            reportesService.getVentasPorDia(filtros)
        ]);

        res.json({
            success: true,
            data: {
                kpis,
                ventasPorMes,
                topProductos,
                productosMenos,
                ventasPorZona,
                clientesFrecuentes,
                topPorMesHistorico,
                abastecimiento,
                ventasPorDia
            }
        });
    } catch (error) {
        console.error('Error dashboardAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// API — GET /api/v1/reportes/kpis
// Solo los KPIs: ideal para la pantalla de inicio del móvil.
// Responde: { success, data: { totalHoy, totalMes, ... } }
// ─────────────────────────────────────────────────────────────

exports.kpisAPI = async (req, res) => {
    try {
        const kpis = await reportesService.getKPIs();
        res.json({ success: true, data: kpis });
    } catch (error) {
        console.error('Error kpisAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
