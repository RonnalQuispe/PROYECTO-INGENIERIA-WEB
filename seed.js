// ============================================================
// seed2.js  —  Datos de prueba JALEJ · Lote 2 · 10 clientes nuevos
//              Cosméticos y Perfumes · 2023 · 2024 · 2025
// ============================================================
// USO:
//   1. Coloca este archivo en la raíz del proyecto
//   2. Ejecuta: node seed2.js
//   3. Espera "✅ Seed completado"
//   4. Corre: npm run dev
//
// ⚠️  Elimina TODOS los clientes y ventas existentes antes
//     de insertar. No usar en producción.
//
// Mismos catálogos y zonas que seed.js — solo clientes nuevos.
// ============================================================

const mongoose = require('mongoose');
const Venta    = require('./src/models/venta.model');
const Cliente  = require('./src/models/cliente.model');

const MONGO_URI = 'mongodb://localhost:27017/ingenieriaweb';

// ── Helpers ───────────────────────────────────────────────────

function rand(min, max) {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function pickN(arr, n) {
    const copia = [...arr].sort(() => Math.random() - 0.5);
    return copia.slice(0, Math.min(n, arr.length));
}

/** Fecha aleatoria dentro de un mes/año dado, nunca futura */
function fechaEnMes(anio, mes) {
    const inicio = new Date(anio, mes, 1);
    const fin    = new Date(anio, mes + 1, 0);
    const hoy    = new Date();
    if (inicio > hoy) return null;
    const limite = fin > hoy ? hoy : fin;
    const diff   = Math.floor((limite - inicio) / 86400000);
    if (diff <= 0) return null;
    const fecha  = new Date(inicio);
    fecha.setDate(1 + Math.floor(Math.random() * diff));
    fecha.setHours(Math.floor(rand(8, 19)), Math.floor(rand(0, 59)), 0, 0);
    return fecha;
}

/** Fecha de cobro N días después, nunca futura */
function fechaCobro(base, dias) {
    const f = new Date(base);
    f.setDate(f.getDate() + dias);
    return f > new Date() ? null : f;
}

// ── 10 Clientes nuevos (3 morosos · 7 buenos pagadores) ──────

const clientesData = [
    // Morosos (índices 0–2)
    { nombre: 'Patricia Lisbeth Vega',     zona: 'Sur',    entidad: 'Edificio Los Andes',  piso: '4', telefono: '0981122334' },
    { nombre: 'Roberto Isaías Flores',     zona: 'Norte',  entidad: 'Torre Iberia',        piso: '2', telefono: '0972233445' },
    { nombre: 'Karina Belén Salazar',      zona: 'Centro', entidad: 'Plaza Mayor',         piso: '6', telefono: '0963344556' },
    // Buenos pagadores (índices 3–9)
    { nombre: 'Emilio Rodrigo Paredes',    zona: 'Norte',  entidad: 'Edificio Pacífico',   piso: '3', telefono: '0954455667' },
    { nombre: 'Natalia Viviana Suárez',    zona: 'Centro', entidad: 'Centro Médico Sur',   piso: '1', telefono: '0945566778' },
    { nombre: 'Héctor Ramón Delgado',      zona: 'Sur',    entidad: 'Galería Iñaquito',    piso: '5', telefono: '0936677889' },
    { nombre: 'Carmen Lucía Espinoza',     zona: 'Norte',  entidad: 'Edificio Cumbayá',   piso: '2', telefono: '0927788990' },
    { nombre: 'Mauricio Esteban Naranjo',  zona: 'Centro', entidad: 'Torre Financiera',    piso: '8', telefono: '0918899001' },
    { nombre: 'Alejandra Mishell Chávez',  zona: 'Sur',    entidad: 'Conjunto Quitumbe',   piso: '1', telefono: '0909900112' },
    { nombre: 'Sebastián Martín Acosta',   zona: 'Norte',  entidad: 'Edificio El Bosque',  piso: '6', telefono: '0991011223' },
];

// ── 6 Catálogos de cosméticos y perfumes ─────────────────────

const catalogos = [
    {
        catalogo: 'Yanbal — Campaña de Fragancias',
        items: [
            { nombre: 'Perfume Únicos Mujer 50ml',          precio: 38.50 },
            { nombre: 'Perfume Zeus Hombre 100ml',          precio: 42.00 },
            { nombre: 'Loción Corporal Tentación 200ml',    precio: 18.75 },
            { nombre: 'Crema Facial Noche Regeneradora',    precio: 24.90 },
            { nombre: 'Sérum Vitamina C Iluminador',        precio: 29.50 },
        ]
    },
    {
        catalogo: 'Leonisa — Catálogo Belleza',
        items: [
            { nombre: 'Colonia Fresca Cítrica 100ml',       precio: 15.20 },
            { nombre: 'Crema Corporal Hidratante Rosa',     precio: 12.80 },
            { nombre: 'Set Maquillaje Base + Corrector',    precio: 34.00 },
            { nombre: 'Labial Mate Larga Duración',         precio: 8.50  },
            { nombre: 'Sombras Paleta Natural 12 colores',  precio: 22.00 },
        ]
    },
    {
        catalogo: 'Avon — Belleza y Cuidado',
        items: [
            { nombre: 'Perfume Far Away 50ml',              precio: 27.00 },
            { nombre: 'Crema Manos Intensive Care',         precio: 9.90  },
            { nombre: 'Rubor Glam On Stage Duo',            precio: 14.50 },
            { nombre: 'Delineador Líquido Negro',           precio: 7.80  },
            { nombre: 'Set Cuidado Facial 3 pasos',         precio: 31.50 },
        ]
    },
    {
        catalogo: 'Oriflame — Natural Beauty',
        items: [
            { nombre: 'Perfume Wonder Woman 50ml',          precio: 33.00 },
            { nombre: 'Aceite Capilar Shine & Protect',     precio: 16.40 },
            { nombre: 'Contorno de Ojos Anti-Edad',         precio: 26.80 },
            { nombre: 'Mascarilla Facial Arcilla Purif.',   precio: 11.20 },
            { nombre: 'Sérum Cabello Keratina 100ml',       precio: 19.90 },
        ]
    },
    {
        catalogo: 'Esika — Fragancias Latinas',
        items: [
            { nombre: 'Eau de Parfum Bohème 75ml',          precio: 31.00 },
            { nombre: 'Colonia Sport Hombre 100ml',         precio: 22.50 },
            { nombre: 'Crema Facial SPF 50 UV Defense',     precio: 21.00 },
            { nombre: 'Gel Limpiador Facial Aloe Vera',     precio: 10.50 },
            { nombre: 'Perfume Mini Colección x3 15ml',     precio: 28.00 },
        ]
    },
    {
        catalogo: 'Cyzone — Maquillaje Joven',
        items: [
            { nombre: 'Base Líquida Cobertura Total',       precio: 18.00 },
            { nombre: 'Gloss Labial Hidratante x2',         precio: 9.50  },
            { nombre: 'Paleta Iluminador + Bronzer',        precio: 24.00 },
            { nombre: 'Spray Fijador Maquillaje 100ml',     precio: 13.90 },
            { nombre: 'Kit Pinceles Profesionales x5',      precio: 20.50 },
        ]
    },
];

const metodos = ['efectivo', 'transferencia', 'deposito'];
const ANIOS   = [2023, 2024, 2025];
const MESES   = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Ventas por mes según perfil
const RANGO_MOROSO = { min: 2, max: 3 };
const RANGO_BUENO  = { min: 3, max: 5 };

// ── Generador de cobros ───────────────────────────────────────

function generarCobros(total, fechaVenta, esMoroso) {
    const cobros = [];
    let   pagado = 0;

    if (esMoroso) {
        // 35% de probabilidad de no pagar nada
        if (Math.random() < 0.35) {
            return { cobros, totalPagado: 0, estadoPago: 'pendiente' };
        }
        const nCobros = Math.random() < 0.4 ? 2 : 1;
        let diasBase  = Math.floor(rand(15, 50));

        for (let i = 0; i < nCobros; i++) {
            const monto = Math.min(
                Math.round(total * rand(0.15, 0.45) * 100) / 100,
                total - pagado
            );
            if (monto <= 0.01) break;
            const fc = fechaCobro(fechaVenta, diasBase);
            if (!fc) break;

            cobros.push({
                monto,
                metodo:     pick(metodos),
                referencia: 'REF' + Math.floor(rand(1000, 9999)),
                fecha:      fc,
                cobradoPor: 'Sistema'
            });
            pagado   += monto;
            diasBase += Math.floor(rand(10, 25));
        }

        pagado = Math.round(pagado * 100) / 100;
        return {
            cobros,
            totalPagado: pagado,
            estadoPago:  pagado <= 0 ? 'pendiente' : pagado >= total - 0.01 ? 'pagado' : 'parcial'
        };
    }

    // Buen pagador: 1 cobro (55%), 2 cobros (35%), 3 cobros (10%)
    const r      = Math.random();
    const nCobros = r < 0.55 ? 1 : r < 0.90 ? 2 : 3;

    // 12% de chance de dejar saldo pendiente incluso siendo buen pagador
    const dejaPendiente = Math.random() < 0.12;
    const tope = dejaPendiente
        ? Math.round(total * rand(0.5, 0.85) * 100) / 100
        : total;

    let diasBase = Math.floor(rand(1, 5));

    for (let i = 0; i < nCobros; i++) {
        const esUltimo = i === nCobros - 1;
        const monto    = esUltimo
            ? Math.round((tope - pagado) * 100) / 100
            : Math.round((tope - pagado) * rand(0.3, 0.6) * 100) / 100;

        if (monto <= 0.01) break;
        const fc = fechaCobro(fechaVenta, diasBase);
        if (!fc) break;

        cobros.push({
            monto,
            metodo:     pick(metodos),
            referencia: 'REF' + Math.floor(rand(1000, 9999)),
            fecha:      fc,
            cobradoPor: 'Sistema'
        });
        pagado   += monto;
        diasBase += Math.floor(rand(2, 8));
    }

    pagado = Math.round(pagado * 100) / 100;
    return {
        cobros,
        totalPagado: pagado,
        estadoPago:  pagado <= 0 ? 'pendiente' : pagado >= total - 0.01 ? 'pagado' : 'parcial'
    };
}

// ── Generador de ítems del pedido de catálogo ─────────────────

function generarItemsPedido(catalogo) {
    const n       = Math.floor(rand(1, 4));
    const elegidos = pickN(catalogo.items, n);

    return elegidos.map(it => {
        const cantidad = Math.floor(rand(1, 3));
        const precio   = Math.round(it.precio * rand(0.95, 1.05) * 100) / 100; // ±5% variación natural
        const subtotal = Math.round(precio * cantidad * 100) / 100;
        return {
            nombre:    it.nombre,
            cantidad,
            precio,
            subtotal,
            entregado: Math.random() > 0.2   // 80% ya entregados
        };
    });
}

// ── Generador principal de ventas ─────────────────────────────

async function generarVentas(clientesCreados) {
    const todas = [];

    for (let ci = 0; ci < clientesCreados.length; ci++) {
        const clienteDoc = clientesCreados[ci];
        const esMoroso   = ci < 3;
        const rango      = esMoroso ? RANGO_MOROSO : RANGO_BUENO;

        for (const anio of ANIOS) {
            for (const mes of MESES) {
                const fechaBase = fechaEnMes(anio, mes);
                if (!fechaBase) continue;

                const nVentas = Math.floor(
                    Math.random() * (rango.max - rango.min + 1)
                ) + rango.min;

                for (let v = 0; v < nVentas; v++) {
                    // Variación de fecha dentro del mismo mes
                    const fv = new Date(fechaBase);
                    fv.setDate(Math.max(1, fv.getDate() + Math.floor(rand(-3, 3))));
                    if (fv > new Date()) continue;

                    const cat   = pick(catalogos);
                    const items = generarItemsPedido(cat);

                    const total = Math.round(
                        items.reduce((s, it) => s + it.subtotal, 0) * 100
                    ) / 100;
                    if (total <= 0) continue;

                    const primerItem    = items[0];
                    const todoEntregado = items.every(it => it.entregado);
                    const { cobros, totalPagado, estadoPago } = generarCobros(total, fv, esMoroso);

                    todas.push({
                        zona:            clienteDoc.zona,
                        ubicacion:       { entidad: clienteDoc.entidad, piso: clienteDoc.piso },
                        clienteRef:      clienteDoc._id,      // ObjectId del cliente
                        cliente:         clienteDoc.nombre,   // campo display
                        producto:        cat.catalogo,        // nombre del catálogo como producto
                        precioUnitario:  primerItem.precio,
                        cantidad:        primerItem.cantidad,
                        total,
                        items,
                        totalPagado,
                        estadoPago,
                        cobros,
                        fecha:           fv,
                        tipoTransaccion: 'pedido',
                        estadoEntrega:   todoEntregado ? 'Entregado' : 'Pendiente',
                        historialEdiciones: []
                    });
                }
            }
        }
    }

    todas.sort((a, b) => a.fecha - b.fecha);
    return todas;
}

// ── Ejecución principal ───────────────────────────────────────

async function seed() {
    try {
        console.log('🔗 Conectando a MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado a:', MONGO_URI);

        // Limpiar colecciones
        console.log('\n🗑️  Eliminando ventas y clientes existentes...');
        await Venta.deleteMany({});
        await Cliente.deleteMany({});

        // Insertar clientes
        console.log('\n👥 Creando clientes...');
        const clientesCreados = [];

        for (let i = 0; i < clientesData.length; i++) {
            const d   = clientesData[i];
            const doc = await Cliente.create({
                nombre:   d.nombre,
                zona:     d.zona,
                telefono: d.telefono,
                activo:   true,
                notas:    i < 3 ? 'Cliente con historial de pagos tardíos.' : ''
            });
            clientesCreados.push({
                _id:     doc._id,
                nombre:  doc.nombre,
                zona:    doc.zona,
                entidad: d.entidad,
                piso:    d.piso,
            });
            const tipo = i < 3 ? '⚠️  moroso' : '✅ buen pagador';
            console.log(`   👤 ${doc.nombre} [${tipo}]`);
        }

        // Generar ventas
        console.log('\n⚙️  Generando ventas 2023 · 2024 · 2025...');
        const todasLasVentas = await generarVentas(clientesCreados);

        // Resumen por año/mes
        const resumen = {};
        for (const v of todasLasVentas) {
            const anio = v.fecha.getFullYear();
            const mes  = v.fecha.getMonth() + 1;
            if (!resumen[anio]) resumen[anio] = {};
            resumen[anio][mes] = (resumen[anio][mes] || 0) + 1;
        }

        const mn = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        for (const anio of Object.keys(resumen).sort()) {
            let linea = `   📅 ${anio}: `;
            let tot   = 0;
            for (let m = 1; m <= 12; m++) {
                const c = resumen[anio][m] || 0;
                tot += c;
                if (c) linea += `${mn[m - 1]}=${c} `;
            }
            console.log(linea + `→ ${tot} ventas`);
        }

        // Insertar ventas en lotes de 300
        console.log(`\n📥 Insertando ${todasLasVentas.length} ventas en lotes...`);
        const LOTE = 300;
        for (let i = 0; i < todasLasVentas.length; i += LOTE) {
            await Venta.insertMany(todasLasVentas.slice(i, i + LOTE), { ordered: false });
            const hasta = Math.min(i + LOTE, todasLasVentas.length);
            console.log(`   ✔ ${hasta} / ${todasLasVentas.length}`);
        }

        // Estadísticas finales
        const totalFacturado = todasLasVentas.reduce((s, v) => s + v.total,       0);
        const totalCobrado   = todasLasVentas.reduce((s, v) => s + v.totalPagado, 0);
        const totalPendiente = totalFacturado - totalCobrado;

        const porEstado = { pendiente: 0, parcial: 0, pagado: 0 };
        for (const v of todasLasVentas) porEstado[v.estadoPago]++;

        console.log('\n✅ Seed completado exitosamente.');
        console.log(`   Clientes insertados  : ${clientesCreados.length}  (3 morosos · 7 buenos pagadores)`);
        console.log(`   Ventas insertadas    : ${todasLasVentas.length}`);
        console.log(`   Años cubiertos       : 2023, 2024, 2025`);
        console.log(`   Catálogos usados     : ${catalogos.length}  (Yanbal · Leonisa · Avon · Oriflame · Esika · Cyzone)`);
        console.log(`   Estado de pagos      : pagadas=${porEstado.pagado}  parciales=${porEstado.parcial}  pendientes=${porEstado.pendiente}`);
        console.log(`   Total facturado      : $${totalFacturado.toFixed(2)}`);
        console.log(`   Total cobrado        : $${totalCobrado.toFixed(2)}`);
        console.log(`   Saldo pendiente      : $${totalPendiente.toFixed(2)}`);
        console.log('\n▶️  Ahora corre: npm run dev\n');

    } catch (error) {
        console.error('\n❌ Error en seed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

seed();