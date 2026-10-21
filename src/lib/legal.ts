// Textos legales de RESER. Son una BASE para revisar con un/a abogado/a antes del lanzamiento oficial.
// Los datos del titular todavía no están definidos: quedan como "COMPLETAR: ..." y la página los
// resalta para que no se puedan pasar por alto. Completalos acá y se actualizan en los dos documentos.

export const LEGAL = {
  titular: 'COMPLETAR: nombre o razón social del titular de RESER',
  cuit: 'COMPLETAR: CUIT',
  domicilio: 'COMPLETAR: domicilio legal',
  email: 'COMPLETAR: email de contacto legal',
  hosting: 'COMPLETAR: proveedor de hosting de la web',
  actualizado: '21 de octubre de 2026',
}

export type LegalSection = { title: string; body: Array<string | string[]> } // string[] = lista con viñetas
export type LegalDocument = { title: string; intro: string; sections: LegalSection[] }
export type LegalDocId = 'terminos' | 'privacidad'

export const LEGAL_DOCS: Record<LegalDocId, LegalDocument> = {
  terminos: {
    title: 'Términos y condiciones',
    intro: 'Estas reglas explican cómo se usa RESER. Al crear una cuenta o usar el servicio, las aceptás.',
    sections: [
      {
        title: '1. Quiénes somos y qué es RESER',
        body: [
          `RESER es un servicio en línea que permite a negocios organizar sus turnos y a sus clientes reservarlos desde un enlace público. Lo ofrece ${LEGAL.titular} (CUIT ${LEGAL.cuit}), con domicilio en ${LEGAL.domicilio}.`,
          `Para consultas sobre estos términos podés escribir a ${LEGAL.email}.`,
        ],
      },
      {
        title: '2. Quién puede usar RESER',
        body: [
          'Para crear una cuenta de negocio tenés que ser mayor de 18 años y tener capacidad legal para obligarte, o actuar en nombre de un negocio que te autoriza a hacerlo.',
          'Las personas que reservan turnos pueden hacerlo sin crear una cuenta. Si reservás por una persona menor de edad, lo hacés bajo tu responsabilidad.',
        ],
      },
      {
        title: '3. Tu cuenta',
        body: [
          'Tenés que darnos datos verdaderos y mantenerlos actualizados. Sos responsable de cuidar tu contraseña y de lo que se haga desde tu cuenta. Si sospechás que alguien más accedió, cambiá la contraseña y avisanos.',
        ],
      },
      {
        title: '4. Qué hace RESER y qué no',
        body: [
          'RESER es una herramienta de agenda: muestra horarios disponibles, registra reservas y envía avisos por email. Los servicios, precios, horarios y políticas de cada negocio los define y los cumple cada negocio.',
          'RESER no es parte del acuerdo entre el negocio y su cliente, no presta los servicios que se reservan y, por ahora, no procesa pagos de los turnos. Los precios que se muestran son informativos.',
        ],
      },
      {
        title: '5. Responsabilidades del negocio',
        body: [
          'Si tenés una cuenta de negocio, te comprometés a:',
          [
            'Configurar bien tus servicios, horarios, días libres y política de cancelación, y atender los turnos que se reserven.',
            'Tratar los datos de tus clientes (nombre, email, teléfono, historial de turnos) conforme a la Ley 25.326 de Protección de los Datos Personales y usarlos solo para gestionar sus turnos.',
            'Cuidar los archivos que descargues con datos de tus clientes (por ejemplo, las exportaciones a Excel o PDF) como cualquier otro dato personal.',
            'Subir solo contenido propio o que tengas derecho a usar (por ejemplo, tu logo), sin infringir derechos de terceros.',
            'No usar RESER para enviar publicidad no solicitada ni para fines ilícitos.',
          ],
        ],
      },
      {
        title: '6. Si reservás un turno',
        body: [
          'Tenés que dar un email válido y un nombre real: los usamos para confirmar tu turno y avisarte. Podés cancelar desde el enlace que te llega por email, dentro del plazo que defina cada negocio. Pasado ese plazo, tenés que comunicarte con el negocio.',
        ],
      },
      {
        title: '7. Uso aceptable',
        body: [
          'No está permitido:',
          [
            'Intentar acceder a datos o cuentas que no son tuyos, o saltear las medidas de seguridad.',
            'Hacer reservas falsas o automatizadas, o sobrecargar el servicio.',
            'Copiar, revender o interferir con el funcionamiento de RESER.',
            'Subir contenido ilegal, engañoso u ofensivo.',
          ],
        ],
      },
      {
        title: '8. Emails del servicio',
        body: [
          'RESER envía emails vinculados a los turnos: confirmaciones, recordatorios, cancelaciones y avisos al negocio. No enviamos publicidad sin tu consentimiento.',
        ],
      },
      {
        title: '9. Planes y precios',
        body: [
          'RESER tiene un plan Gratis, sin costo y sin vencimiento, con límites de uso (cantidad de profesionales y de turnos por mes), y planes pagos (Básico y Pro) con más funciones. Lo que incluye cada plan y su precio están publicados en la página de precios.',
          'La primera vez que un negocio contrata el plan Básico, puede usar el plan Pro sin costo adicional durante 14 días. Al terminar la prueba sigue en el plan Básico, salvo que elija otro. La prueba se da una sola vez por negocio. Nunca te vamos a cobrar sin tu aceptación expresa.',
          'Si un negocio pasa a un plan con menos funciones, sus datos se conservan, pero lo que excede el plan deja de estar disponible: por ejemplo, los profesionales que superan el límite dejan de recibir turnos.',
          'Las promociones (como el descuento del plan anual o del Pro semestral) valen en las condiciones publicadas al momento de contratarlas. Si cambiamos los precios, te avisamos con anticipación.',
        ],
      },
      {
        title: '10. Disponibilidad del servicio',
        body: [
          'Hacemos lo posible para que RESER funcione siempre, pero no podemos garantizar que no tenga interrupciones, errores o demoras, incluidas las de servicios de terceros (por ejemplo, la entrega de emails).',
          'Podemos mejorar, cambiar o discontinuar funciones. Si hacemos cambios importantes, te avisamos.',
        ],
      },
      {
        title: '11. Limitación de responsabilidad',
        body: [
          'En la medida en que la ley lo permita, RESER no responde por turnos perdidos o mal asignados por errores de configuración del negocio, por la falta de asistencia de una persona, por interrupciones de servicios de terceros ni por daños indirectos. Esto no limita derechos que la ley te reconozca como usuario o consumidor y que no puedan limitarse.',
        ],
      },
      {
        title: '12. Propiedad intelectual',
        body: [
          'La marca RESER, el software y el diseño del servicio son de su titular. Vos conservás los derechos sobre tu contenido (por ejemplo, tu logo y los datos de tu negocio) y nos autorizás a usarlo solo para prestarte el servicio.',
        ],
      },
      {
        title: '13. Suspensión y baja',
        body: [
          'Podés dejar de usar RESER cuando quieras y pedir que eliminemos tu cuenta escribiendo a nuestro email de contacto. Podemos suspender o dar de baja una cuenta que incumpla estos términos o ponga en riesgo a otras personas o al servicio.',
        ],
      },
      {
        title: '14. Cambios en estos términos',
        body: [
          'Podemos actualizar estos términos. Publicamos la versión vigente con su fecha y, si el cambio es importante, te avisamos por email. Si seguís usando RESER después, se entiende que aceptás los cambios.',
        ],
      },
      {
        title: '15. Ley aplicable',
        body: [
          'Estos términos se rigen por las leyes de la República Argentina. Cualquier conflicto se somete a los tribunales competentes de la República Argentina.',
        ],
      },
    ],
  },

  privacidad: {
    title: 'Política de privacidad',
    intro: 'Acá te contamos qué datos tratamos en RESER, para qué, con quién los compartimos y qué derechos tenés.',
    sections: [
      {
        title: '1. Quién es responsable de tus datos',
        body: [
          `Hay dos situaciones distintas. Si tenés una cuenta de negocio, el responsable de esos datos es ${LEGAL.titular} (CUIT ${LEGAL.cuit}, domicilio ${LEGAL.domicilio}).`,
          'Si reservaste un turno, el responsable de tus datos de cliente es el negocio donde reservaste. RESER los trata por cuenta de ese negocio, solo para prestarle el servicio de agenda.',
        ],
      },
      {
        title: '2. Qué datos tratamos',
        body: [
          [
            'Dueños de negocio: nombre, email y contraseña de la cuenta (nunca la conocemos en texto plano); datos del negocio como nombre, enlace, servicios, precios, horarios, días libres, teléfono, dirección y logo.',
            'Profesionales del equipo: el nombre y, si se carga, su WhatsApp. Si entran con su propia cuenta, también su email y su contraseña (que nunca conocemos en texto plano).',
            'Clientes que reservan: nombre y email (obligatorios), teléfono (opcional) y el historial de turnos con ese negocio.',
            'Datos técnicos: para evitar reservas masivas falsas, guardamos de forma temporal el email y la dirección IP desde donde se reserva. Se eliminan automáticamente a los dos días.',
            'En tu navegador: guardamos un identificador de sesión para mantener la cuenta iniciada y, durante el alta de un negocio, un borrador de la configuración. No usamos cookies publicitarias ni herramientas de seguimiento.',
          ],
        ],
      },
      {
        title: '3. Para qué los usamos',
        body: [
          [
            'Mostrar horarios disponibles, registrar y gestionar reservas y cancelaciones.',
            'Enviar emails del servicio: confirmaciones, recordatorios, cancelaciones y avisos al negocio.',
            'Mantener la seguridad del servicio y prevenir abusos.',
            'Atender consultas y cumplir obligaciones legales.',
          ],
          'No vendemos tus datos ni los usamos para publicidad de terceros.',
        ],
      },
      {
        title: '4. Con quién los compartimos',
        body: [
          [
            'Con el negocio: cada negocio ve los datos de sus propios clientes y solo de ellos, y puede descargarlos (en Excel o PDF) desde su panel.',
            'En la página de reservas del negocio, visible para cualquiera: su nombre, dirección, teléfono y logo, y el nombre y el WhatsApp de cada profesional que lo tenga cargado.',
            `Con proveedores que nos permiten funcionar: Supabase (base de datos, autenticación y archivos), Resend (envío de emails) y ${LEGAL.hosting} (publicación de la web). Solo reciben lo necesario para cumplir su función.`,
            'Con Google, únicamente si tocás "Agendar en Google Calendar": tu navegador le envía el nombre del servicio, el negocio y el horario.',
            'Con WhatsApp (Meta), únicamente si tocás "Escribir por WhatsApp" en un servicio que se coordina por ese medio: tu navegador abre WhatsApp con un mensaje ya escrito y, desde ahí, la conversación es entre vos y el negocio, bajo las condiciones de WhatsApp.',
            'Con autoridades, cuando una norma o una orden judicial lo exija.',
          ],
          'Algunos de estos proveedores pueden tener sus servidores fuera de la Argentina. Elegimos proveedores que aplican medidas de seguridad adecuadas.',
        ],
      },
      {
        title: '5. Cuánto tiempo los conservamos',
        body: [
          'Conservamos los datos mientras la cuenta del negocio esté activa y el tiempo necesario para cumplir obligaciones legales. Los datos técnicos antiabuso se eliminan automáticamente a los dos días. Si pedís la eliminación de tu cuenta, borramos los datos que no tengamos obligación de conservar.',
        ],
      },
      {
        title: '6. Tus derechos',
        body: [
          'Según la Ley 25.326 podés pedir acceso a tus datos, su rectificación, actualización y supresión. Los clientes que reservaron pueden dirigirse primero al negocio, que es el responsable; también podés escribirnos y te ayudamos a canalizar el pedido.',
          `Para ejercer estos derechos escribinos a ${LEGAL.email}. Respondemos dentro de los plazos que fija la ley.`,
          'La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan con relación al incumplimiento de las normas sobre protección de datos personales.',
        ],
      },
      {
        title: '7. Cómo cuidamos tus datos',
        body: [
          [
            'La conexión con RESER viaja cifrada.',
            'Cada negocio solo puede acceder a sus propios datos: las reglas de seguridad se aplican en la base de datos, no solo en la pantalla.',
            'La cancelación de un turno se hace con un enlace privado, difícil de adivinar, que solo recibe quien reservó.',
            'Limitamos la cantidad de reservas por email y por conexión para frenar abusos.',
          ],
          'Ningún sistema es 100 % infalible: si detectamos un incidente que afecte tus datos, te avisamos.',
        ],
      },
      {
        title: '8. Menores de edad',
        body: [
          'RESER está pensado para personas mayores de edad. Si reservás un turno para una persona menor, tenés que hacerlo como adulto responsable.',
        ],
      },
      {
        title: '9. Cambios en esta política',
        body: [
          'Podemos actualizar esta política. Publicamos siempre la versión vigente con su fecha, y si el cambio es importante te lo avisamos por email.',
        ],
      },
      {
        title: '10. Contacto',
        body: [`Escribinos a ${LEGAL.email} por cualquier duda sobre tus datos.`],
      },
    ],
  },
}
