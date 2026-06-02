

const express      = require('express');
const router       = express.Router();
const Venta        = require('../models/Venta');       // ajusta la ruta a tu modelo
const { analizarCartera } = require('../coreCartera'); // ajusta la ruta donde guardaste el core


router.get('/', /* requireAuth, */ async (req, res) => {
    try {

        const ventas = await Venta.find({})
            .select('cliente fecha total totalPagado estadoPago zona cobros')
            .lean(); // .lean() devuelve objetos JS planos, más rápido para calcular

        const UMBRAL_SEMANAL = 200; // ajusta este valor a tu negocio

        // ── Ejecutar el core de análisis (las 3 capas) ─────────
        const analisis = analizarCartera(ventas, UMBRAL_SEMANAL);
        
        const curvaProyeccion = analisis.proyeccion.curva.map(s => ({
            label:    'Sem ' + s.semana,
            esperado: s.recaudacionEsperada,
            umbral:   UMBRAL_SEMANAL,
            clientes: s.clientesEsperados.join(', ') || '—'
        }));

        // Ranking: top clientes en riesgo con etiqueta de nivel
        const rankingConEtiqueta = analisis.rankingRiesgo.map(c => ({
            ...c,
            nivelRiesgo: c.indiceMorosidad >= 0.7 ? 'alto'
                       : c.indiceMorosidad >= 0.4 ? 'medio'
                       : 'bajo'
        }));

        /*/ ── Renderizar la vista ─────────────────────────────────
        res.render('dashboard', {
            titulo:           'Dashboard Analítico',

            // Datos del core para los 3 widgets principales
            curvaProyeccion,                          // gráfico de barras (8 semanas)
            rankingRiesgo:    rankingConEtiqueta,      // tabla de riesgo
            mapaCalor:        analisis.mapaCalorSemanal, // gráfico de barras diario

            // Datos del runway (liquidez)
            runwayDias:       analisis.proyeccion.runwayDias,
            runwayFecha:      analisis.proyeccion.runwayFecha,

            // Umbral para mostrarlo en la vista
            umbralSemanal:    UMBRAL_SEMANAL,

            // KPIs rápidos
            totalClientes:    analisis.clientes.length,
            clientesEnRiesgo: analisis.clientes.filter(c => c.indiceMorosidad >= 0.7).length,
            saldoTotalPendiente: analisis.clientes.reduce((s, c) => s + c.saldoPendiente, 0)
        });*/

    } catch (error) {
        console.error('[Dashboard] Error al calcular análisis:', error);
        res.status(500).render('error', { mensaje: 'Error al cargar el dashboard.' });
    }
});

module.exports = router;
