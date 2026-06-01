// ============================================================
// src/controllers/reportes.controller.js
// ============================================================
const Venta = require('../models/venta.model');
const { analizarCartera } = require('../coreCartera');

const UMBRAL = 200;
const CAMPOS = 'cliente clienteRef fecha total totalPagado estadoPago zona cobros';

const nivel = m => m>=0.7?'alto':m>=0.4?'medio':'bajo';

// GET /reportes — vista web
exports.mostrarDashboard = async (req, res) => {
    try {
     const ventas = await Venta.find({}).select(CAMPOS).lean();
console.log('Ventas encontradas:', ventas.length); // ← agrega esto
const analisis = analizarCartera(ventas, UMBRAL);
console.log('Clientes analizados:', analisis.clientes.length); // ← y esto
console.log('Curva semana 1:', analisis.proyeccion.curva[0]); // ← y esto
        const saldo    = analisis.clientes.reduce((s,c)=>s+c.saldoPendiente,0);

        res.render('reportes/dashboard', {
            titulo:              'Dashboard Analítico — Sistema Jalej',
            usuario:             req.session?.usuario || null,
            curvaProyeccion:     analisis.proyeccion.curva.map(s=>({
                                     label:    'Sem '+s.semana,
                                     esperado: s.recaudacionEsperada,
                                     clientes: s.clientesEsperados.join(', ')||'—'
                                 })),
            mapaCalor:           analisis.mapaCalorSemanal,
            rankingRiesgo:       analisis.rankingRiesgo.map(c=>({...c, nivelRiesgo:nivel(c.indiceMorosidad)})),
            runwayDias:          analisis.proyeccion.runwayDias,
            runwayFecha:         analisis.proyeccion.runwayFecha,
            umbralSemanal:       UMBRAL,
            totalClientes:       analisis.clientes.length,
            clientesEnRiesgo:    analisis.clientes.filter(c=>c.indiceMorosidad>=0.7).length,
            saldoTotalPendiente: Math.round(saldo*100)/100
        });
    } catch (e) {
        console.error('[Dashboard]', e);
        res.status(500).send('Error: ' + e.message);
    }
};

// GET /api/v1/reportes/dashboard — JSON para app móvil
exports.dashboardAPI = async (req, res) => {
    try {
        const ventas   = await Venta.find({}).select(CAMPOS).lean();
        const analisis = analizarCartera(ventas, UMBRAL);
        res.json({ success:true, data:{ ...analisis, umbralSemanal:UMBRAL } });
    } catch (e) {
        res.status(500).json({ success:false, message:e.message });
    }
};

// GET /api/v1/reportes/kpis — KPIs rápidos
exports.kpisAPI = async (req, res) => {
    try {
        const ventas   = await Venta.find({}).select(CAMPOS).lean();
        const analisis = analizarCartera(ventas, UMBRAL);
        const saldo    = analisis.clientes.reduce((s,c)=>s+c.saldoPendiente,0);
        res.json({ success:true, data:{
            totalClientes:       analisis.clientes.length,
            clientesEnRiesgo:    analisis.clientes.filter(c=>c.indiceMorosidad>=0.7).length,
            saldoTotalPendiente: Math.round(saldo*100)/100,
            runwayDias:          analisis.proyeccion.runwayDias,
            umbralSemanal:       UMBRAL
        }});
    } catch (e) {
        res.status(500).json({ success:false, message:e.message });
    }
};