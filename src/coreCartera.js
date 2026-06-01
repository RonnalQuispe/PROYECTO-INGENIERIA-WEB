/**
 * ============================================================
 * CORE DE INTELIGENCIA DE CARTERA — coreCartera.js
 * ============================================================
 * Contiene tres capas de análisis encadenadas:
 *   Capa 1 → Segmentación temporal de compras por cliente
 *   Capa 2 → Índice de morosidad relativa (Z-score individual)
 *   Capa 3 → Proyección de liquidez con ciclos repetidos
 *            (distribuye cobros de CADA ciclo en las 8 semanas)
 * ============================================================
 */

// ─────────────────────────────────────────────
// UTILIDADES MATEMÁTICAS INTERNAS
// ─────────────────────────────────────────────

function media(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function desviacionEstandar(arr, m) {
    if (arr.length < 2) return 0;
    const varianza = arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / arr.length;
    return Math.sqrt(varianza);
}

function diasEntre(fechaA, fechaB) {
    const MS_DIA = 1000 * 60 * 60 * 24;
    return Math.round((new Date(fechaB) - new Date(fechaA)) / MS_DIA);
}

// ─────────────────────────────────────────────
// CAPA 1: SEGMENTACIÓN TEMPORAL DE COMPRAS
// ─────────────────────────────────────────────

function calcularRitmoCompra(ventasCliente) {
    const ordenadas = [...ventasCliente].sort(
        (a, b) => new Date(a.fecha) - new Date(b.fecha)
    );

    if (ordenadas.length < 2) {
        return { periodoDominante: 14, volatilidad: 0 }; // default 14 días si no hay historial
    }

    const intervalos = [];
    const pesos      = [];

    for (let i = 1; i < ordenadas.length; i++) {
        const dias = diasEntre(ordenadas[i - 1].fecha, ordenadas[i].fecha);
        const peso = (ordenadas[i - 1].total + ordenadas[i].total) / 2;
        if (dias > 0) {
            intervalos.push(dias);
            pesos.push(peso);
        }
    }

    if (intervalos.length === 0) {
        return { periodoDominante: 14, volatilidad: 0 };
    }

    const sumaPesos        = pesos.reduce((s, p) => s + p, 0);
    const periodoPonderado = intervalos.reduce((s, d, i) => s + d * pesos[i], 0) / sumaPesos;
    const mediaSimple      = media(intervalos);
    const desv             = desviacionEstandar(intervalos, mediaSimple);

    // Clampear el periodo entre 7 y 60 días para que tenga sentido en proyección
    const periodo = Math.max(7, Math.min(60, Math.round(periodoPonderado)));

    return {
        periodoDominante: periodo,
        volatilidad:      Math.round(desv)
    };
}

// ─────────────────────────────────────────────
// CAPA 2: ÍNDICE DE MOROSIDAD RELATIVA
// ─────────────────────────────────────────────

function calcularMorosidad(ventasCliente) {
    const lags = [];

    for (const venta of ventasCliente) {
        if (!venta.cobros || venta.cobros.length === 0) continue;

        const cobrosOrdenados = [...venta.cobros].sort(
            (a, b) => new Date(a.fecha) - new Date(b.fecha)
        );
        const primerCobro = cobrosOrdenados[0];
        const lag = diasEntre(venta.fecha, primerCobro.fecha);
        if (lag >= 0) lags.push(lag);
    }

    if (lags.length === 0) {
        return { indiceMorosidad: 1.0, lagPromedio: 0, ultimoLag: 0 };
    }

    const lagPromedio    = media(lags);
    const desv           = desviacionEstandar(lags, lagPromedio);
    const ultimoLag      = lags[lags.length - 1];
    const z              = desv === 0 ? 0 : (ultimoLag - lagPromedio) / desv;
    const indiceMorosidad = 1 / (1 + Math.exp(-0.5 * z));

    return {
        indiceMorosidad: Math.round(indiceMorosidad * 100) / 100,
        lagPromedio:      Math.round(lagPromedio),
        ultimoLag
    };
}

// ─────────────────────────────────────────────
// CAPA 3: PROYECCIÓN DE LIQUIDEZ — CICLOS REPETIDOS
// ─────────────────────────────────────────────
/**
 * CORRECCIÓN CLAVE respecto a la versión anterior:
 *
 * En lugar de proyectar UN SOLO cobro por cliente (el siguiente),
 * ahora generamos TODOS los ciclos que caen dentro del horizonte
 * de 8 semanas (56 días).
 *
 * Por ejemplo, si un cliente compra cada 10 días y su última
 * compra fue hace 3 días, sus próximos cobros serán en:
 *   +7 días  (ciclo 1)  → semana 1
 *   +17 días (ciclo 2)  → semana 2
 *   +27 días (ciclo 3)  → semana 3
 *   ... y así hasta la semana 8
 *
 * Esto llena las 8 barras del gráfico en lugar de concentrar
 * todo en una sola semana.
 *
 * El monto de cada ciclo futuro se descuenta con el factor de
 * confianza ajustado por la distancia temporal:
 *   confianza_ciclo_k = exp(-1.5 * indiceMorosidad) * exp(-0.05 * k)
 * donde k es el número de ciclo (0, 1, 2…). Los cobros más lejanos
 * tienen un descuento adicional por incertidumbre temporal.
 */
function proyectarLiquidez(clientesAnalizados, umbralLiquidezSemanal) {
    const SEMANAS         = 8;
    const DIAS_HORIZONTE  = SEMANAS * 7; // 56 días
    const hoy             = new Date();

    // Inicializar curva de 8 semanas
    const semanas = Array.from({ length: SEMANAS }, (_, i) => ({
        semana:              i + 1,
        fechaInicio:         new Date(hoy.getTime() +  i      * 7 * 86400000),
        fechaFin:            new Date(hoy.getTime() + (i + 1) * 7 * 86400000),
        recaudacionEsperada: 0,
        clientesEsperados:   []
    }));

    for (const cliente of clientesAnalizados) {
        if (cliente.saldoPendiente <= 0)  continue;
        if (!cliente.ultimaCompra)        continue;
        if (cliente.periodoCompra <= 0)   continue;

        // ── Calcular el ticket promedio por ciclo ─────────────
        // En lugar de proyectar el saldo total de golpe, estimamos
        // cuánto paga el cliente en promedio por ciclo de compra.
        // Usamos su saldo pendiente dividido entre los ciclos que
        // entran en el horizonte para no sobre-inflar la proyección.
        const ciclosEnHorizonte = Math.max(1, Math.floor(DIAS_HORIZONTE / cliente.periodoCompra));
        const montoPorCiclo     = cliente.saldoPendiente / ciclosEnHorizonte;

        // Factor de confianza base: menor morosidad → mayor confianza
        const confianzaBase = Math.exp(-1.5 * cliente.indiceMorosidad);

        // ── Generar todos los ciclos en el horizonte ──────────
        // Empezamos desde la fecha en que debería ocurrir el PRÓXIMO cobro
        const ultimaCompra = new Date(cliente.ultimaCompra);
        const diasDesdeUltima = diasEntre(ultimaCompra, hoy);

        // ¿Cuántos periodos completos han pasado desde la última compra?
        // El próximo cobro es el primer múltiplo del periodo que supere diasDesdeUltima
        const ciclosYaPasados = Math.ceil(diasDesdeUltima / cliente.periodoCompra);
        const diasHastaPrimero = ciclosYaPasados * cliente.periodoCompra - diasDesdeUltima;

        // Iterar ciclos desde el primero que cae en el futuro
        let ciclo = 0;
        let diasOffset = diasHastaPrimero >= 0 ? diasHastaPrimero : 0;

        while (diasOffset <= DIAS_HORIZONTE) {
            // Descuento adicional por incertidumbre temporal (ciclos más lejanos = menos certeza)
            const confianzaCiclo = confianzaBase * Math.exp(-0.08 * ciclo);
            const montoEsperado  = Math.round(montoPorCiclo * confianzaCiclo * 100) / 100;

            if (montoEsperado > 0.01) {
                const semanaIdx = Math.floor(diasOffset / 7);
                if (semanaIdx >= 0 && semanaIdx < SEMANAS) {
                    semanas[semanaIdx].recaudacionEsperada += montoEsperado;
                    // Solo agregar el nombre una vez por semana
                    if (!semanas[semanaIdx].clientesEsperados.includes(cliente.nombre)) {
                        semanas[semanaIdx].clientesEsperados.push(cliente.nombre);
                    }
                }
            }

            diasOffset += cliente.periodoCompra;
            ciclo++;

            // Guardia: evitar loop infinito si periodoCompra es muy pequeño
            if (ciclo > 100) break;
        }
    }

    // Redondear montos finales
    semanas.forEach(s => {
        s.recaudacionEsperada = Math.round(s.recaudacionEsperada * 100) / 100;
    });

    // Detectar runway: primera semana bajo el umbral
    let runwayFecha = null;
    let runwayDias  = -1;

    for (const semana of semanas) {
        if (semana.recaudacionEsperada < umbralLiquidezSemanal) {
            runwayFecha = semana.fechaInicio;
            runwayDias  = diasEntre(hoy, semana.fechaInicio);
            break;
        }
    }

    return { curva: semanas, runwayFecha, runwayDias };
}

// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL — ORQUESTA LAS 3 CAPAS
// ─────────────────────────────────────────────

function analizarCartera(ventas, umbralLiquidezSemanal = 200) {

    // Paso 1: Agrupar ventas por cliente
    const porCliente = {};
    for (const venta of ventas) {
        const nombre = venta.cliente;
        if (!porCliente[nombre]) porCliente[nombre] = [];
        porCliente[nombre].push(venta);
    }

    // Paso 2: Aplicar Capa 1 y Capa 2 a cada cliente
    const clientesAnalizados = [];

    for (const [nombre, ventasCliente] of Object.entries(porCliente)) {

        const { periodoDominante, volatilidad } = calcularRitmoCompra(ventasCliente);
        const { indiceMorosidad, lagPromedio, ultimoLag } = calcularMorosidad(ventasCliente);

        const saldoPendiente = ventasCliente.reduce((sum, v) => {
            return sum + Math.max(0, v.total - (v.totalPagado || 0));
        }, 0);

        const fechasCompra = ventasCliente.map(v => new Date(v.fecha));
        const ultimaCompra = new Date(Math.max(...fechasCompra));

        const riesgoPonderado = Math.round(saldoPendiente * indiceMorosidad * 100) / 100;

        clientesAnalizados.push({
            nombre,
            totalVentas:     ventasCliente.length,
            saldoPendiente:  Math.round(saldoPendiente * 100) / 100,
            periodoCompra:   periodoDominante,
            volatilidad,
            indiceMorosidad,
            lagPromedio,
            ultimoLag,
            riesgoPonderado,
            ultimaCompra:    ultimaCompra.toISOString()
        });
    }

    // Paso 3: Proyección con ciclos repetidos
    const proyeccion = proyectarLiquidez(clientesAnalizados, umbralLiquidezSemanal);

    // Paso 4: Ranking de riesgo
    const rankingRiesgo = [...clientesAnalizados]
        .filter(c => c.saldoPendiente > 0)
        .sort((a, b) => b.riesgoPonderado - a.riesgoPonderado)
        .slice(0, 10);

    // Paso 5: Mapa de calor histórico por día de semana
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const calor      = Array(7).fill(0);

    for (const venta of ventas) {
        if (!venta.cobros) continue;
        for (const cobro of venta.cobros) {
            const dia = new Date(cobro.fecha).getDay();
            calor[dia] += cobro.monto || 0;
        }
    }

    const mapaCalorSemanal = diasSemana.map((nombre, i) => ({
        dia:   nombre,
        monto: Math.round(calor[i] * 100) / 100
    }));

    return {
        clientes:         clientesAnalizados,
        proyeccion,
        rankingRiesgo,
        mapaCalorSemanal
    };
}

module.exports = { analizarCartera };