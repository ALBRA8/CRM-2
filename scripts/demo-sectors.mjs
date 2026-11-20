/**
 * U6 (F7-T06) — Semillas sectoriales para demos reproducibles.
 *
 * Definiciones PUURAS de datos de demostración por sector (sin acceso a BD ni
 * reloj): el seeder `seed-demo-sector.mjs` las materializa de forma idempotente
 * y los tests `tests/unit/demo-sectors.test.ts` verifican sus invariantes.
 *
 * Valor: ventas/demostraciones. Cero impacto en estabilidad, seguridad o
 * producción: el seeder aborta en entorno productivo y todo queda marcado como
 * DEMO en organizaciones `demo-<slug>` dedicadas.
 *
 * Convenciones de las definiciones:
 *  - Todas las fechas son DESPLAZAMIENTOS (horas/minutos) respecto a «ahora»,
 *    calculados por el seeder en el momento de sembrar (estructura reproducible).
 *  - Claves fijas (`key`, `number`, teléfonos, emails, títulos) garantizan
 *    idempotencia: sembrar dos veces produce el mismo estado.
 *  - Todo el texto es realista para el mercado colombiano (+57) y cada org se
 *    llama «(Demo)» para que jamás se confunda con datos reales.
 */

const CURRENCIES = ['USD', 'COP']
const CLIENT_STATUS = ['prospect', 'active', 'inactive']
const TASK_PRIORITY = ['alta', 'normal', 'baja']
const TASK_STATUS = ['open', 'done']
const RESERVATION_STATUS = ['scheduled', 'completed', 'cancelled']
const QUOTE_STATUS = ['draft', 'sent', 'accepted', 'rejected', 'expired']

export const SECTORS = [
  {
    slug: 'restaurante',
    orgName: 'Restaurante La Brasa (Demo)',
    businessLine: 'Restaurante y catering para eventos',
    users: [
      { email: 'propietario@restaurante.demo', name: 'Manolo Demo', role: 'owner', password: 'Demo1234!' },
      { email: 'agente@restaurante.demo', name: 'Ana Demo', role: 'member', password: 'Demo1234!' },
    ],
    pipelineStages: [
      { name: 'Consulta inicial', order: 1, color: '#6366f1', probability: 0.2 },
      { name: 'Propuesta de menú', order: 2, color: '#0ea5e9', probability: 0.5 },
      { name: 'Negociación', order: 3, color: '#f59e0b', probability: 0.7 },
      { name: 'Evento contratado', order: 4, color: '#059669', probability: 1, isWon: true },
      { name: 'Perdido', order: 5, color: '#dc2626', probability: 0, isLost: true },
    ],
    clients: [
      { key: 'c1', name: 'Marcela Rodríguez (Demo)', phone: '+573011110001', email: 'marcela.demo1@example.com', status: 'active', source: 'whatsapp', notes: 'Aniversario en marzo, 40 pax [demo]' },
      { key: 'c2', name: 'Jorge Peñaloza (Demo)', phone: '+573011110002', email: 'jorge.demo2@example.com', status: 'active', source: 'referral', notes: 'Empresarial, almuerzos de directorio [demo]' },
      { key: 'c3', name: 'Laura Castaño (Demo)', phone: '+573011110003', email: 'laura.demo3@example.com', status: 'prospect', source: 'landing', notes: 'Cumpleaños de hija, comparando menus [demo]' },
      { key: 'c4', name: 'Andrés Villalba (Demo)', phone: '+573011110004', status: 'prospect', source: 'instagram', notes: 'Pidió carta de catering por DM [demo]' },
      { key: 'c5', name: 'Diana Mejía (Demo)', phone: '+573011110005', email: 'diana.demo5@example.com', status: 'active', source: 'manual', notes: 'Cliente recurrente de la carta [demo]' },
      { key: 'c6', name: 'Camilo Torres (Demo)', phone: '+573011110006', email: 'camilo.demo6@example.com', status: 'inactive', source: 'manual', notes: 'Sin pedidos desde hace 6 meses [demo]' },
    ],
    opportunities: [
      { key: 'o1', title: 'Catering aniversario 40 pax (Demo)', clientKey: 'c1', stageOrder: 2, amount: 4800000, currency: 'COP' },
      { key: 'o2', title: 'Almuerzos de directorio trimestrales (Demo)', clientKey: 'c2', stageOrder: 3, amount: 12500000, currency: 'COP' },
      { key: 'o3', title: 'Cumpleaños infantil 25 pax (Demo)', clientKey: 'c3', stageOrder: 1, amount: 2100000, currency: 'COP' },
      { key: 'o4', title: 'Brunch corporativo mayo (Demo)', clientKey: 'c5', stageOrder: 4, amount: 3600000, currency: 'COP' },
      { key: 'o5', title: 'Cena de gala 80 pax (Demo)', clientKey: 'c4', stageOrder: 5, amount: 9600000, currency: 'COP' },
    ],
    reservations: [
      { key: 'r1', clientKey: 'c1', title: 'Degustación de menú aniversario (Demo)', startsInHours: 3, durationMin: 90, status: 'scheduled', location: 'Mesa privada, salón principal' },
      { key: 'r2', clientKey: 'c2', title: 'Reunión de cierre — almuerzos directivos (Demo)', startsInHours: 26, durationMin: 60, status: 'scheduled', location: 'Oficina cliente' },
      { key: 'r3', clientKey: 'c5', title: 'Brunch corporativo ejecutado (Demo)', startsInHours: -48, durationMin: 120, status: 'completed', location: 'Terraza' },
      { key: 'r4', clientKey: 'c6', title: 'Reserva de mesa 4 pax (Demo)', startsInHours: 5, durationMin: 90, status: 'cancelled', location: 'Salón principal' },
    ],
    tasks: [
      { key: 't1', clientKey: 'c1', title: 'Enviar propuesta definitiva del menú aniversario (Demo)', dueInHours: -12, priority: 'alta', status: 'open' },
      { key: 't2', clientKey: 'c3', title: 'Confirmar menú infantil y alergias (Demo)', dueInHours: 4, priority: 'normal', status: 'open' },
      { key: 't3', clientKey: 'c2', title: 'Llamar para reagendar reunión de cierre (Demo)', dueInHours: 24, priority: 'normal', status: 'open' },
      { key: 't4', clientKey: 'c5', title: 'Cargar factura del brunch al sistema (Demo)', dueInHours: 48, priority: 'baja', status: 'open' },
      { key: 't5', clientKey: 'c5', title: 'Pedir testimonial del brunch (Demo)', priority: 'baja', status: 'done' },
    ],
    quotes: [
      { number: 'DEMO-R-0001', clientKey: 'c1', oppKey: 'o1', status: 'sent', validInDays: 10, notes: 'Incluye servicio de meseros y decoración básica [demo]', items: [
        { sku: 'R-CATER-40', description: 'Menú anniversary 3 tiempos por pax (Demo)', quantity: 40, unitPrice: 95000 },
        { sku: 'R-SERV-8', description: 'Servicio de meseros 8 h (Demo)', quantity: 1, unitPrice: 640000 },
      ] },
      { number: 'DEMO-R-0002', clientKey: 'c3', oppKey: 'o3', status: 'draft', validInDays: 15, notes: 'Falta confirmar torta y piñata [demo]', items: [
        { sku: 'R-KIDS-25', description: 'Menú infantil por pax (Demo)', quantity: 25, unitPrice: 62000 },
      ] },
      { number: 'DEMO-R-0003', clientKey: 'c5', oppKey: 'o4', status: 'accepted', validInDays: 30, notes: 'Contrato brunch trimestral firmado [demo]', items: [
        { sku: 'R-BRUNCH-60', description: 'Brunch ejecutivo por pax (Demo)', quantity: 60, unitPrice: 60000 },
      ] },
    ],
    conversations: [
      { clientKey: 'c1', thread: [
        { from: 'in', offsetMin: 45, text: 'Hola, ¿me pueden ayudar con el catering del aniversario para 40 personas? (demo)' },
        { from: 'out', offsetMin: 41, text: '¡Hola Marcela! Claro que sí. Le envío la propuesta con dos opciones de menú para que escoja. (demo)' },
        { from: 'in', offsetMin: 3, text: 'Perfecto, quedo atenta a la propuesta (demo)' },
      ] },
      { clientKey: 'c3', thread: [
        { from: 'in', offsetMin: 20, text: '¿Tienen disponibilidad para un cumpleaños el próximo sábado? (demo)' },
        { from: 'in', offsetMin: 19, text: 'Seríamos unas 25 personas entre niños y adultos (demo)' },
      ] },
    ],
  },
  {
    slug: 'salud-estetica',
    orgName: 'Clínica Estética Sonrisa (Demo)',
    businessLine: 'Clínica estética y bienestar',
    users: [
      { email: 'propietario@salud.demo', name: 'Dra. Paula Demo', role: 'owner', password: 'Demo1234!' },
      { email: 'agente@salud.demo', name: 'Sara Demo', role: 'member', password: 'Demo1234!' },
    ],
    pipelineStages: [
      { name: 'Valoración agendada', order: 1, color: '#6366f1', probability: 0.2 },
      { name: 'Plan de tratamiento propuesto', order: 2, color: '#0ea5e9', probability: 0.5 },
      { name: 'Aprobación del paciente', order: 3, color: '#f59e0b', probability: 0.7 },
      { name: 'Tratamiento aplicado', order: 4, color: '#059669', probability: 1, isWon: true },
      { name: 'Descartado', order: 5, color: '#dc2626', probability: 0, isLost: true },
    ],
    clients: [
      { key: 'c1', name: 'Valentina Ospina (Demo)', phone: '+573022220001', email: 'valentina.demo1@example.com', status: 'active', source: 'whatsapp', notes: 'Botox semestral, prefiere viernes [demo]' },
      { key: 'c2', name: 'Natalia Restrepo (Demo)', phone: '+573022220002', email: 'natalia.demo2@example.com', status: 'active', source: 'referral', notes: 'Plan de limpieza facial profunda [demo]' },
      { key: 'c3', name: 'Óscar Betancur (Demo)', phone: '+573022220003', status: 'prospect', source: 'landing', notes: 'Consultó por depilación láser hombre [demo]' },
      { key: 'c4', name: 'Isabella Franco (Demo)', phone: '+573022220004', email: 'isabella.demo4@example.com', status: 'active', source: 'instagram', notes: 'Novia boda junio — paquete novia [demo]' },
      { key: 'c5', name: 'Ricardo Salazar (Demo)', phone: '+573022220005', email: 'ricardo.demo5@example.com', status: 'inactive', source: 'manual', notes: 'Valoración pendiente hace 8 meses [demo]' },
    ],
    opportunities: [
      { key: 'o1', title: 'Paquete novia — boda junio (Demo)', clientKey: 'c4', stageOrder: 2, amount: 6800000, currency: 'COP' },
      { key: 'o2', title: 'Botox semestral 2 zonas (Demo)', clientKey: 'c1', stageOrder: 4, amount: 900000, currency: 'COP' },
      { key: 'o3', title: 'Depilación láser 6 sesiones (Demo)', clientKey: 'c3', stageOrder: 1, amount: 1500000, currency: 'COP' },
      { key: 'o4', title: 'Limpieza facial profunda + dermapen (Demo)', clientKey: 'c2', stageOrder: 3, amount: 780000, currency: 'COP' },
      { key: 'o5', title: 'Rinomodelación sin cirugía (Demo)', clientKey: 'c5', stageOrder: 5, amount: 2200000, currency: 'COP' },
    ],
    reservations: [
      { key: 'r1', clientKey: 'c4', title: 'Valoración paquete novia (Demo)', startsInHours: 2, durationMin: 45, status: 'scheduled', location: 'Sala 2' },
      { key: 'r2', clientKey: 'c1', title: 'Aplicación botox — control semestral (Demo)', startsInHours: 30, durationMin: 30, status: 'scheduled', location: 'Sala 1' },
      { key: 'r3', clientKey: 'c2', title: 'Sesión dermapen 2/4 (Demo)', startsInHours: -72, durationMin: 60, status: 'completed', location: 'Sala 3' },
      { key: 'r4', clientKey: 'c5', title: 'Valoración rinomodelación (Demo)', startsInHours: 6, durationMin: 30, status: 'cancelled', location: 'Sala 1' },
    ],
    tasks: [
      { key: 't1', clientKey: 'c3', title: 'Confirmar valoración de depilación láser (Demo)', dueInHours: -6, priority: 'alta', status: 'open' },
      { key: 't2', clientKey: 'c4', title: 'Armar cronograma pre-boda (Demo)', dueInHours: 8, priority: 'normal', status: 'open' },
      { key: 't3', clientKey: 'c2', title: 'Agendar sesión 3/4 de dermapen (Demo)', dueInHours: 36, priority: 'normal', status: 'open' },
      { key: 't4', clientKey: 'c1', title: 'Registrar consentimiento informado (Demo)', dueInHours: 24, priority: 'alta', status: 'open' },
      { key: 't5', clientKey: 'c2', title: 'Enviar cuidados post-tratamiento (Demo)', priority: 'baja', status: 'done' },
    ],
    quotes: [
      { number: 'DEMO-S-0001', clientKey: 'c4', oppKey: 'o1', status: 'sent', validInDays: 12, notes: 'Paquete novia: 6 sesiones + día de boda [demo]', items: [
        { sku: 'S-NOVIA-6', description: 'Sesiones pre-boda facial y corporal (Demo)', quantity: 6, unitPrice: 950000 },
        { sku: 'S-BODA-DIA', description: 'Equipo de maquillaje y retoque el día de la boda (Demo)', quantity: 1, unitPrice: 1100000 },
      ] },
      { number: 'DEMO-S-0002', clientKey: 'c3', oppKey: 'o3', status: 'draft', validInDays: 20, notes: 'Espera aprobación de valoración médica [demo]', items: [
        { sku: 'S-LASER-6', description: 'Depilación láser hombre — 6 sesiones (Demo)', quantity: 1, unitPrice: 1500000 },
      ] },
      { number: 'DEMO-S-0003', clientKey: 'c1', oppKey: 'o2', status: 'accepted', validInDays: 30, notes: 'Cliente recurrente — pago en efectivo [demo]', items: [
        { sku: 'S-BOTOX-2Z', description: 'Botox 2 zonas + control (Demo)', quantity: 1, unitPrice: 900000 },
      ] },
    ],
    conversations: [
      { clientKey: 'c4', thread: [
        { from: 'in', offsetMin: 30, text: 'Buenas, me casó en junio y quiero el paquete de novia ¿qué incluye? (demo)' },
        { from: 'out', offsetMin: 26, text: '¡Felicidades Isabella! Le comparto el detalle del paquete y agendamos una valoración sin costo. (demo)' },
        { from: 'in', offsetMin: 2, text: 'Listo, me sirve el jueves en la mañana (demo)' },
      ] },
      { clientKey: 'c3', thread: [
        { from: 'in', offsetMin: 15, text: '¿La depilación láser para hombres la hacen? (demo)' },
        { from: 'in', offsetMin: 14, text: 'Serían espalda y hombros, ¿cuántas sesiones se necesitan? (demo)' },
      ] },
    ],
  },
  {
    slug: 'inmobiliaria',
    orgName: 'Inmobiliaria Casa Nueva (Demo)',
    businessLine: 'Arriendo y venta de inmuebles',
    users: [
      { email: 'propietario@inmobiliaria.demo', name: 'Sandra Demo', role: 'owner', password: 'Demo1234!' },
      { email: 'agente@inmobiliaria.demo', name: 'Miguel Demo', role: 'member', password: 'Demo1234!' },
    ],
    pipelineStages: [
      { name: 'Contacto', order: 1, color: '#6366f1', probability: 0.2 },
      { name: 'Visita agendada', order: 2, color: '#0ea5e9', probability: 0.5 },
      { name: 'Oferta presentada', order: 3, color: '#f59e0b', probability: 0.7 },
      { name: 'Contrato firmado', order: 4, color: '#059669', probability: 1, isWon: true },
      { name: 'Retirado', order: 5, color: '#dc2626', probability: 0, isLost: true },
    ],
    clients: [
      { key: 'c1', name: 'Hernán Gaviria (Demo)', phone: '+573033330001', email: 'hernan.demo1@example.com', status: 'active', source: 'whatsapp', notes: 'Busca arriendo 2 habitaciones, Laureles [demo]' },
      { key: 'c2', name: 'Lucía Arango (Demo)', phone: '+573033330002', email: 'lucia.demo2@example.com', status: 'active', source: 'landing', notes: 'Compra apartamento para estrenar [demo]' },
      { key: 'c3', name: 'Mauricio Cárdenas (Demo)', phone: '+573033330003', status: 'prospect', source: 'referral', notes: 'Quiere vender casa heredada [demo]' },
      { key: 'c4', name: 'Paola Zapata (Demo)', phone: '+573033330004', email: 'paola.demo4@example.com', status: 'active', source: 'instagram', notes: 'Arriendo local comercial [demo]' },
      { key: 'c5', name: 'Esteban Quintero (Demo)', phone: '+573033330005', email: 'esteban.demo5@example.com', status: 'prospect', source: 'manual', notes: 'Referido por casero actual [demo]' },
      { key: 'c6', name: 'Alejandra Nivia (Demo)', phone: '+573033330006', email: 'alejandra.demo6@example.com', status: 'inactive', source: 'manual', notes: 'Compró por fuera, sin contacto [demo]' },
    ],
    opportunities: [
      { key: 'o1', title: 'Arriendo apartamento Laureles 2 hab (Demo)', clientKey: 'c1', stageOrder: 2, amount: 1800000, currency: 'COP' },
      { key: 'o2', title: 'Compra apartamento estreno Sabaneta (Demo)', clientKey: 'c2', stageOrder: 3, amount: 320000000, currency: 'COP' },
      { key: 'o3', title: 'Venta casa heredada Belén (Demo)', clientKey: 'c3', stageOrder: 1, amount: 285000000, currency: 'COP' },
      { key: 'o4', title: 'Arriendo local comercial Poblado (Demo)', clientKey: 'c4', stageOrder: 4, amount: 4500000, currency: 'COP' },
      { key: 'o5', title: 'Arriendo oficina flexible centro (Demo)', clientKey: 'c5', stageOrder: 5, amount: 2600000, currency: 'COP' },
    ],
    reservations: [
      { key: 'r1', clientKey: 'c1', title: 'Visita apartamento Laureles (Demo)', startsInHours: 4, durationMin: 45, status: 'scheduled', location: 'Cra 76 #34-21, apto 502' },
      { key: 'r2', clientKey: 'c2', title: 'Visita proyecto estreno Sabaneta (Demo)', startsInHours: 28, durationMin: 60, status: 'scheduled', location: 'Sala de ventas del proyecto' },
      { key: 'r3', clientKey: 'c4', title: 'Firma de contrato de local (Demo)', startsInHours: -24, durationMin: 60, status: 'completed', location: 'Notaría (demo)' },
      { key: 'r4', clientKey: 'c6', title: 'Segunda visita casa Belén (Demo)', startsInHours: 7, durationMin: 45, status: 'cancelled', location: 'Calle 30 #45-10' },
    ],
    tasks: [
      { key: 't1', clientKey: 'c2', title: 'Enviar certificado de libertad y ficha del proyecto (Demo)', dueInHours: -3, priority: 'alta', status: 'open' },
      { key: 't2', clientKey: 'c3', title: 'Pedir escritura y certificados de la casa (Demo)', dueInHours: 12, priority: 'normal', status: 'open' },
      { key: 't3', clientKey: 'c1', title: 'Preparar estudio de crédito arrendatario (Demo)', dueInHours: 20, priority: 'normal', status: 'open' },
      { key: 't4', clientKey: 'c4', title: 'Publicar el local en portales (Demo)', dueInHours: 40, priority: 'baja', status: 'open' },
      { key: 't5', clientKey: 'c4', title: 'Cobrar comisión del contrato firmado (Demo)', priority: 'alta', status: 'done' },
    ],
    quotes: [
      { number: 'DEMO-I-0001', clientKey: 'c2', oppKey: 'o2', status: 'sent', validInDays: 8, notes: 'Cierre financiero + gastos legales [demo]', items: [
        { sku: 'I-CUOTA-INI', description: 'Cuota inicial apartamento 62 m2 (Demo)', quantity: 1, unitPrice: 64000000 },
        { sku: 'I-GASTOS-LEG', description: 'Estudio de títulos y escrituración (Demo)', quantity: 1, unitPrice: 3800000 },
      ] },
      { number: 'DEMO-I-0002', clientKey: 'c4', oppKey: 'o4', status: 'accepted', validInDays: 30, notes: 'Contrato a 3 años con cláusula de incremento [demo]', items: [
        { sku: 'I-ARR-LOCAL', description: 'Canon mensual local 84 m2 (Demo)', quantity: 36, unitPrice: 4500000 },
      ] },
      { number: 'DEMO-I-0003', clientKey: 'c1', oppKey: 'o1', status: 'draft', validInDays: 15, notes: 'Falta codeudor [demo]', items: [
        { sku: 'I-ARR-APT2', description: 'Canon mensual apartamento 2 hab (Demo)', quantity: 12, unitPrice: 1800000 },
      ] },
    ],
    conversations: [
      { clientKey: 'c1', thread: [
        { from: 'in', offsetMin: 50, text: 'Vi el apartamento de Laureles en la página ¿se puede visitar hoy? (demo)' },
        { from: 'out', offsetMin: 46, text: 'Hola Hernán, sí. Tengo cupo a las 4 pm, le comparto la dirección. (demo)' },
        { from: 'in', offsetMin: 5, text: 'Listo, allá llego puntual (demo)' },
      ] },
      { clientKey: 'c3', thread: [
        { from: 'in', offsetMin: 25, text: 'Heredé una casa en Belén y quiero venderla rápido (demo)' },
        { from: 'in', offsetMin: 24, text: '¿Qué documentos necesito tener listos? (demo)' },
      ] },
    ],
  },
]

/**
 * Validación pura de una definición sectorial. Devuelve la lista de errores
 * (vacía = válida). El seeder la ejecuta ANTES de tocar la base de datos
 * (fail-fast) y los tests la usan como caso positivo y negativo.
 */
export function validateSectorData(sector) {
  const errors = []
  const push = (msg) => errors.push(`[${sector.slug ?? '?'}] ${msg}`)

  if (!sector.slug || !/^[a-z0-9-]+$/.test(sector.slug)) push('slug ausente o con caracteres inválidos')
  if (!sector.orgName || !sector.orgName.includes('(Demo)')) push('orgName debe terminar/contener «(Demo)»')
  if (!sector.businessLine) push('businessLine ausente')

  // Usuarios: emails únicos en el sector, roles válidos, contraseña demo fuerte
  const userEmails = new Set()
  for (const u of sector.users ?? []) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email ?? '')) push(`usuario con email inválido: ${u.email}`)
    if (userEmails.has(u.email)) push(`email de usuario duplicado: ${u.email}`)
    userEmails.add(u.email)
    if (!['owner', 'admin', 'member'].includes(u.role)) push(`rol de usuario inválido: ${u.role}`)
    if ((u.password ?? '').length < 8) push(`contraseña demo débil o ausente para ${u.email}`)
  }
  if (!userEmails.size) push('sector sin usuarios')

  // Pipeline: órdenes secuenciales sin repetir, exactamente un won y un lost
  const stages = sector.pipelineStages ?? []
  const orders = stages.map((s) => s.order)
  if (new Set(orders).size !== orders.length) push('órdenes de etapa duplicadas')
  if (orders.length && (Math.min(...orders) !== 1 || Math.max(...orders) !== stages.length)) push('órdenes de etapa no secuenciales')
  if (stages.filter((s) => s.isWon).length !== 1) push('debe existir exactamente 1 etapa isWon')
  if (stages.filter((s) => s.isLost).length !== 1) push('debe existir exactamente 1 etapa isLost')
  for (const s of stages) {
    const p = s.probability
    if (typeof p !== 'number' || p < 0 || p > 1) push(`probabilidad fuera de [0,1] en etapa «${s.name}»`)
    if (s.isWon && p !== 1) push(`la etapa isWon «${s.name}» debe tener probabilidad 1`)
    if (s.isLost && p !== 0) push(`la etapa isLost «${s.name}» debe tener probabilidad 0`)
  }

  // Clientes: teléfonos únicos y formato +57; emails presentes únicos; status válido
  const phones = new Set()
  const clientEmails = new Set()
  const clientKeys = new Set()
  for (const c of sector.clients ?? []) {
    if (!c.key) push('cliente sin key')
    if (clientKeys.has(c.key)) push(`key de cliente duplicada: ${c.key}`)
    clientKeys.add(c.key)
    if (!/^\+\d{9,15}$/.test(c.phone ?? '')) push(`teléfono inválido en cliente ${c.key}: ${c.phone}`)
    if (phones.has(c.phone)) push(`teléfono duplicado en el sector: ${c.phone}`)
    phones.add(c.phone)
    if (c.email) {
      if (clientEmails.has(c.email)) push(`email de cliente duplicado: ${c.email}`)
      clientEmails.add(c.email)
    }
    if (!CLIENT_STATUS.includes(c.status)) push(`status de cliente inválido: ${c.status}`)
    if (!(c.notes ?? '').includes('[demo]')) push(`cliente ${c.key} sin marca [demo] en notas`)
  }
  if (!clientKeys.size) push('sector sin clientes')

  // Oportunidades: referencias válidas y montos positivos
  for (const o of sector.opportunities ?? []) {
    if (!clientKeys.has(o.clientKey)) push(`oportunidad ${o.key} referencia cliente inexistente ${o.clientKey}`)
    if (!stages.some((s) => s.order === o.stageOrder)) push(`oportunidad ${o.key} referencia etapa inexistente ${o.stageOrder}`)
    if (!(o.amount > 0)) push(`oportunidad ${o.key} con monto no positivo`)
    if (!CURRENCIES.includes(o.currency)) push(`oportunidad ${o.key} con moneda inválida ${o.currency}`)
    if (!(o.title ?? '').includes('(Demo)')) push(`oportunidad ${o.key} sin marca (Demo) en el título`)
  }

  // Reservas y tareas: referencias válidas, estados válidos
  for (const r of sector.reservations ?? []) {
    if (!clientKeys.has(r.clientKey)) push(`reserva ${r.key} referencia cliente inexistente ${r.clientKey}`)
    if (!RESERVATION_STATUS.includes(r.status)) push(`reserva ${r.key} con estado inválido ${r.status}`)
    if (typeof r.startsInHours !== 'number') push(`reserva ${r.key} sin startsInHours numérico`)
    if (!(r.durationMin > 0)) push(`reserva ${r.key} sin duración positiva`)
    if (!(r.title ?? '').includes('(Demo)')) push(`reserva ${r.key} sin marca (Demo)`)
  }
  for (const t of sector.tasks ?? []) {
    if (t.clientKey && !clientKeys.has(t.clientKey)) push(`tarea ${t.key} referencia cliente inexistente ${t.clientKey}`)
    if (!TASK_PRIORITY.includes(t.priority)) push(`tarea ${t.key} con prioridad inválida ${t.priority}`)
    if (!TASK_STATUS.includes(t.status)) push(`tarea ${t.key} con estado inválido ${t.status}`)
    if (t.status === 'open' && typeof t.dueInHours !== 'number') push(`tarea abierta ${t.key} sin dueInHours`)
    if (!(t.title ?? '').includes('(Demo)')) push(`tarea ${t.key} sin marca (Demo)`)
  }

  // Cotizaciones: número único, ítems con cantidad/precio válidos, referencias válidas
  const quoteNumbers = new Set()
  const oppKeys = new Set((sector.opportunities ?? []).map((o) => o.key))
  for (const q of sector.quotes ?? []) {
    if (quoteNumbers.has(q.number)) push(`número de cotización duplicado: ${q.number}`)
    quoteNumbers.add(q.number)
    if (!clientKeys.has(q.clientKey)) push(`cotización ${q.number} referencia cliente inexistente ${q.clientKey}`)
    if (q.oppKey && !oppKeys.has(q.oppKey)) push(`cotización ${q.number} referencia oportunidad inexistente ${q.oppKey}`)
    if (!QUOTE_STATUS.includes(q.status)) push(`cotización ${q.number} con estado inválido ${q.status}`)
    if (!(q.validInDays > 0)) push(`cotización ${q.number} sin vigencia positiva`)
    if (!(q.items ?? []).length) push(`cotización ${q.number} sin ítems`)
    for (const it of q.items ?? []) {
      if (!(it.quantity > 0)) push(`ítem de ${q.number} con cantidad no positiva`)
      if (!(it.unitPrice >= 0)) push(`ítem de ${q.number} con precio unitario negativo`)
      if (!it.description) push(`ítem de ${q.number} sin descripción`)
    }
    if (!(q.notes ?? '').includes('[demo]')) push(`cotización ${q.number} sin marca [demo]`)
  }

  // Conversaciones: hilo con al menos 2 mensajes y el primero entrante
  for (const conv of sector.conversations ?? []) {
    if (!clientKeys.has(conv.clientKey)) push(`conversación de ${conv.clientKey} referencia cliente inexistente`)
    const thread = conv.thread ?? []
    if (thread.length < 2) push(`conversación de ${conv.clientKey} con menos de 2 mensajes`)
    if (thread[0]?.from !== 'in') push(`conversación de ${conv.clientKey} no inicia entrante`)
    for (const m of thread) {
      if (!['in', 'out'].includes(m.from)) push(`mensaje con dirección inválida en ${conv.clientKey}`)
      if (typeof m.offsetMin !== 'number' || m.offsetMin < 0) push(`mensaje con offsetMin inválido en ${conv.clientKey}`)
      if (!(m.text ?? '').length) push(`mensaje vacío en ${conv.clientKey}`)
    }
  }

  return errors
}

/** Valida TODOS los sectores y asegura unicidad cross-sector de claves globales. */
export function validateAllSectors() {
  const errors = []
  const slugs = new Set()
  for (const s of SECTORS) {
    if (slugs.has(s.slug)) errors.push(`slug de sector duplicado: ${s.slug}`)
    slugs.add(s.slug)
    errors.push(...validateSectorData(s))
  }
  // Emails de usuario únicos GLOBALMENTE (User.email es @unique en la BD)
  const seenEmails = new Map()
  for (const s of SECTORS) {
    for (const u of s.users) {
      if (seenEmails.has(u.email)) errors.push(`email de usuario repetido entre sectores: ${u.email} (${seenEmails.get(u.email)} y ${s.slug})`)
      seenEmails.set(u.email, s.slug)
    }
  }
  return errors
}
