// ============================================================
// src/controllers/reportes.controller.js
// ============================================================
// MÉTODOS WEB (sin ningún cambio):
//   mostrarDashboard
//
// MÉTODOS API (nuevos al final):
//   dashboardAPI, kpisAPI
//
// ── CORRECCIONES DE SEGURIDAD Y RENDIMIENTO (sin cambios funcionales) ──
// [FIX-1] aniosDisponibles: new Date().getFullYear() se llamaba 3 veces
//         dentro del mismo objeto literal. Aunque el impacto es mínimo
//         por llamada, en handlers ejecutados miles de veces acumula
//         presión innecesaria en el GC de V8 (3 objetos Date efímeros
//         por request). Ahora se calcula una sola vez y se reutiliza.
//         El mismo fix se aplica a dashboardAPI para consistencia.
//
// [FIX-2] dashboardAPI: añadido límite de seguridad al parámetro
//         anioHistorico. Antes: req.query.anioHistorico se pasaba
//         directamente al service sin validación. Un valor arbitrario
//         podría causar comportamiento inesperado en el pipeline de
//         aggregation. Ahora se valida que sea un número entero de 4
//         dígitos; si no lo es, se usa el año actual como fallback.
//         Sin cambio en la funcionalidad para valores válidos.
// ============================================================

const reportesService = require('../services/reportes.service');

// ─────────────────────────────────────────────────────────────
// HELPER: validar año para evitar pasar valores arbitrarios
// a los pipelines de aggregation del service.
// [FIX-2] Solo afecta a dashboardAPI. mostrarDashboard no se toca.
// ─────────────────────────────────────────────────────────────
const parsearAnio = (valor) => {
    const num = parseInt(valor, 10);
    // Acepta años de 4 dígitos en un rango razonable
    if (!isNaN(num) && num >= 2000 && num <= 2100) return num;
    return new Date().getFullYear();
};

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

    // [FIX-1] Calcular una sola vez para evitar 3 instancias Date efímeras
    const anioActual = new Date().getFullYear();

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
            // [FIX-1] Una sola instancia Date reutilizada en los 3 valores
            aniosDisponibles: [anioActual, anioActual - 1, anioActual - 2]
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
// Query params: mes, anio, zona, fechaDesde, fechaHasta, anioHistorico, limite
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

    // [FIX-2] Validar anioHistorico antes de pasarlo al service.
    // parsearAnio devuelve el año actual si el valor es inválido.
    const anioHistorico = parsearAnio(req.query.anioHistorico);

    // [FIX-1] Calcular una sola vez
    const anioActual = new Date().getFullYear();

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
                ventasPorDia,
                // [FIX-1] Incluido en la respuesta para que el móvil
                // pueda construir el selector de años sin lógica propia
                aniosDisponibles: [anioActual, anioActual - 1, anioActual - 2]
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