// Mensagem do WhatsApp do motorista para o passageiro (e o solicitante).
// Vários modelos sorteados por passageiro, para o WhatsApp não tratar o envio como mensagem em massa.
// O idioma vem do cadastro do passageiro (BR, US, ES); sem idioma, português.

export type PassengerMessageLanguage = "pt" | "en" | "es";

export type PassengerMessageInput = {
  passengerName: string;
  driverName: string;
  serviceDate: Date | null;
  /** Código de getPassengerLanguageCode: "BR", "US", "ES" ou vazio. */
  languageCode?: string;
  /** Hora do envio, usada no cumprimento do modelo 2. */
  now?: Date;
  /** Número em [0, 1) para o sorteio do modelo. */
  random?: () => number;
};

type Context = {
  /** Primeiro nome do passageiro, ou vazio. */
  name: string;
  /** Primeiro nome do motorista, ou vazio. */
  driver: string;
  /** Data e hora do serviço formatadas no idioma, ou vazio. */
  when: string;
  now: Date;
};

type Template = (context: Context) => string[];

const PHONE = "+55 (12) 99723-6961";
const EMAIL = "junior@betinhos.com.br";

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? "";
}

/** "Olá, Ana!" ou "Olá!" quando não há nome. */
function hello(base: string, name: string, end: string, suffix = "") {
  return name ? `${base}, ${name}${suffix}${end}` : `${base}${suffix}${end}`;
}

function dayPeriod(now: Date): 0 | 1 | 2 {
  const hour = now.getHours();
  if (hour < 12) return 0;
  if (hour < 18) return 1;
  return 2;
}

const PT: Template[] = [
  // Modelo 1
  ({ name, driver, when }) => [
    hello("Olá", name, "!"),
    "",
    driver
      ? `Sou o ${driver}, da Betinhos, e vou fazer o seu transporte${when ? ` em ${when}` : ""}.`
      : `Sou o motorista da Betinhos e vou fazer o seu transporte${when ? ` em ${when}` : ""}.`,
    `Se precisar de alguma coisa, a nossa central atende pelo ${PHONE} ou pelo e-mail ${EMAIL}.`,
    "",
    "Até breve!"
  ],
  // Modelo 2
  ({ name, driver, when, now }) => [
    hello(["Bom dia", "Boa tarde", "Boa noite"][dayPeriod(now)], name, "."),
    "",
    (driver ? `Aqui é o ${driver}, motorista da Betinhos.` : "Aqui é o motorista da Betinhos.") +
      (when ? ` Estarei com você em ${when}.` : " Estarei com você no seu transporte."),
    "",
    "Central Betinhos:",
    `📞 ${PHONE}`,
    `✉️ ${EMAIL}`,
    "",
    "Nos vemos em breve."
  ],
  // Modelo 3
  ({ name, driver, when }) => [
    hello("Oi", name, "?", ", tudo bem"),
    "",
    (driver ? `Meu nome é ${driver} e sou da Betinhos.` : "Sou motorista da Betinhos.") +
      ` Fui escalado para o seu transporte${when ? ` em ${when}` : ""}.`,
    `Qualquer dúvida, é só chamar a central: ${PHONE} | ${EMAIL}.`,
    "",
    "Obrigado!"
  ],
  // Modelo 5
  ({ name, driver, when }) => [
    hello("Olá", name, "."),
    "",
    `Tudo certo para o seu transporte${when ? ` em ${when}` : ""}.` +
      (driver ? ` Quem vai te atender sou eu, ${driver}, da Betinhos.` : " Quem vai te atender sou eu, motorista da Betinhos."),
    `A central também fica à disposição pelo ${PHONE} e pelo ${EMAIL}.`,
    "",
    "Até logo!"
  ],
  // Modelo 7
  ({ name, driver, when }) => [
    `Prezado(a) ${name || "passageiro(a)"},`,
    "",
    driver
      ? `Meu nome é ${driver} e serei o responsável pelo seu transporte pela Betinhos${when ? ` em ${when}` : ""}.`
      : `Fui designado pela Betinhos como responsável pelo seu transporte${when ? ` em ${when}` : ""}.`,
    `Para qualquer suporte adicional, nossa central está à disposição pelo telefone ${PHONE} ou pelo e-mail ${EMAIL}.`,
    "",
    "Atenciosamente."
  ],
  // Modelo 8
  ({ name, driver, when }) => [
    hello("Olá", name, "?", ", como vai"),
    "",
    (driver ? `Sou o ${driver}, da equipe de motoristas da Betinhos.` : "Sou da equipe de motoristas da Betinhos.") +
      ` Estarei no seu transporte${when ? ` em ${when}` : ""}.`,
    "",
    `📞 Central: ${PHONE}`,
    `✉️ ${EMAIL}`,
    "",
    "Até breve."
  ],
  // Modelo 10
  ({ name, driver, when }) => [
    hello("Oi", name, "."),
    "",
    (driver ? `Aqui é o ${driver}, da Betinhos 🚗` : "Aqui é o motorista da Betinhos 🚗") +
      ` O seu transporte${when ? ` em ${when}` : ""} está confirmado comigo.`,
    "",
    "Dúvidas ou imprevistos? A central ajuda:",
    `Tel.: ${PHONE}`,
    `E-mail: ${EMAIL}`,
    "",
    "Até breve!"
  ],
  // Modelo 11
  ({ name, driver, when }) => [
    hello("Olá", name, "!"),
    "",
    driver
      ? `Eu sou o ${driver}, motorista da Betinhos, e vou realizar o seu transporte${when ? ` em ${when}` : ""}.`
      : `Eu sou o motorista da Betinhos e vou realizar o seu transporte${when ? ` em ${when}` : ""}.`,
    `Para suporte, nossa central está disponível no ${PHONE} e no e-mail ${EMAIL}.`,
    "",
    "Tenha um ótimo dia!"
  ]
];

const EN: Template[] = [
  // Modelo 1
  ({ name, driver, when }) => [
    hello("Hello", name, "!"),
    "",
    driver
      ? `I'm ${driver} from Betinhos, and I'll be driving you${when ? ` on ${when}` : ""}.`
      : `I'm your Betinhos driver, and I'll be driving you${when ? ` on ${when}` : ""}.`,
    `If you need anything, our support team is available at ${PHONE} or ${EMAIL}.`,
    "",
    "See you soon!"
  ],
  // Modelo 2
  ({ name, driver, when, now }) => [
    hello(["Good morning", "Good afternoon", "Good evening"][dayPeriod(now)], name, "."),
    "",
    (driver ? `This is ${driver}, your Betinhos driver.` : "This is your Betinhos driver.") +
      (when ? ` I'll be with you on ${when}.` : " I'll be with you on your ride."),
    "",
    "Betinhos support:",
    `📞 ${PHONE}`,
    `✉️ ${EMAIL}`,
    "",
    "See you soon."
  ],
  // Modelo 3
  ({ name, driver, when }) => [
    hello("Hi", name, "?", ", how are you"),
    "",
    (driver ? `My name is ${driver} and I'm with Betinhos.` : "I'm a driver with Betinhos.") +
      ` I've been assigned to your ride${when ? ` on ${when}` : ""}.`,
    `If you have any questions, just contact our support team: ${PHONE} | ${EMAIL}.`,
    "",
    "Thank you!"
  ],
  // Modelo 5
  ({ name, driver, when }) => [
    hello("Hello", name, "."),
    "",
    (when ? `Your ride on ${when} is all set.` : "Your ride is all set.") +
      (driver ? ` I'm ${driver} from Betinhos, and I'll be your driver.` : " I'm from Betinhos, and I'll be your driver."),
    `Our support team is also available at ${PHONE} and ${EMAIL}.`,
    "",
    "See you later!"
  ],
  // Modelo 7
  ({ name, driver, when }) => [
    `Dear ${name || "passenger"},`,
    "",
    driver
      ? `My name is ${driver}, and I will be responsible for your transportation with Betinhos${when ? ` on ${when}` : ""}.`
      : `I have been assigned by Betinhos to be responsible for your transportation${when ? ` on ${when}` : ""}.`,
    `For any additional support, our team is available by phone at ${PHONE} or by email at ${EMAIL}.`,
    "",
    "Kind regards."
  ],
  // Modelo 8
  ({ name, driver, when }) => [
    hello("Hello", name, "?", ", how are you"),
    "",
    (driver ? `I'm ${driver}, part of the Betinhos driver team.` : "I'm part of the Betinhos driver team.") +
      ` I'll be driving you${when ? ` on ${when}` : ""}.`,
    "",
    `📞 Support: ${PHONE}`,
    `✉️ ${EMAIL}`,
    "",
    "See you soon."
  ],
  // Modelo 10
  ({ name, driver, when }) => [
    hello("Hi", name, "."),
    "",
    (driver ? `This is ${driver} from Betinhos 🚗` : "This is your Betinhos driver 🚗") +
      (when ? ` Your ride on ${when} is confirmed with me.` : " Your ride is confirmed with me."),
    "",
    "Questions or last-minute changes? Our support team can help:",
    `Phone: ${PHONE}`,
    `Email: ${EMAIL}`,
    "",
    "See you soon!"
  ],
  // Modelo 11
  ({ name, driver, when }) => [
    hello("Hello", name, "!"),
    "",
    (driver ? `I'm ${driver}, a Betinhos driver, and ` : "I'm a Betinhos driver, and ") +
      (when ? `I'll be taking you on ${when}.` : "I'll be taking you on your ride."),
    `For support, our team is available at ${PHONE} and ${EMAIL}.`,
    "",
    "Have a great day!"
  ]
];

const ES: Template[] = [
  // Modelo 1
  ({ name, driver, when }) => [
    hello("¡Hola", name, "!"),
    "",
    driver
      ? `Soy ${driver}, de Betinhos, y voy a realizar su traslado${when ? ` el ${when}` : ""}.`
      : `Soy el conductor de Betinhos y voy a realizar su traslado${when ? ` el ${when}` : ""}.`,
    `Si necesita algo, nuestra central lo atiende en el ${PHONE} o en ${EMAIL}.`,
    "",
    "¡Hasta pronto!"
  ],
  // Modelo 2
  ({ name, driver, when, now }) => [
    hello(["Buenos días", "Buenas tardes", "Buenas noches"][dayPeriod(now)], name, "."),
    "",
    (driver ? `Le habla ${driver}, conductor de Betinhos.` : "Le habla el conductor de Betinhos.") +
      (when ? ` Estaré con usted el ${when}.` : " Estaré con usted en su traslado."),
    "",
    "Central Betinhos:",
    `📞 ${PHONE}`,
    `✉️ ${EMAIL}`,
    "",
    "Nos vemos pronto."
  ],
  // Modelo 3
  ({ name, driver, when }) => [
    hello("Hola", name, "?", ", ¿qué tal"),
    "",
    (driver ? `Me llamo ${driver} y soy de Betinhos.` : "Soy conductor de Betinhos.") +
      ` Me asignaron su traslado${when ? ` del ${when}` : ""}.`,
    `Ante cualquier duda, contacte a nuestra central: ${PHONE} | ${EMAIL}.`,
    "",
    "¡Gracias!"
  ],
  // Modelo 5
  ({ name, driver, when }) => [
    hello("Hola", name, "."),
    "",
    `Todo listo para su traslado${when ? ` del ${when}` : ""}.` +
      (driver ? ` Lo atenderé yo, ${driver}, de Betinhos.` : " Lo atenderé yo, conductor de Betinhos."),
    `Nuestra central también está a su disposición en el ${PHONE} y en ${EMAIL}.`,
    "",
    "¡Hasta luego!"
  ],
  // Modelo 7
  ({ name, driver, when }) => [
    `Estimado(a) ${name || "pasajero(a)"}:`,
    "",
    driver
      ? `Mi nombre es ${driver} y seré el responsable de su traslado con Betinhos${when ? ` el ${when}` : ""}.`
      : `Betinhos me designó como responsable de su traslado${when ? ` el ${when}` : ""}.`,
    `Para cualquier asistencia adicional, nuestra central está a su disposición en el teléfono ${PHONE} o en el correo ${EMAIL}.`,
    "",
    "Atentamente."
  ],
  // Modelo 8
  ({ name, driver, when }) => [
    hello("Hola", name, "?", ", ¿cómo está"),
    "",
    (driver ? `Soy ${driver}, del equipo de conductores de Betinhos.` : "Soy del equipo de conductores de Betinhos.") +
      ` Estaré a cargo de su traslado${when ? ` el ${when}` : ""}.`,
    "",
    `📞 Central: ${PHONE}`,
    `✉️ ${EMAIL}`,
    "",
    "Hasta pronto."
  ],
  // Modelo 10
  ({ name, driver, when }) => [
    hello("Hola", name, "."),
    "",
    (driver ? `Le habla ${driver}, de Betinhos 🚗` : "Le habla el conductor de Betinhos 🚗") +
      ` Su traslado${when ? ` del ${when}` : ""} está confirmado conmigo.`,
    "",
    "¿Dudas o imprevistos? Nuestra central lo ayuda:",
    `Tel.: ${PHONE}`,
    `Correo: ${EMAIL}`,
    "",
    "¡Hasta pronto!"
  ],
  // Modelo 11
  ({ name, driver, when }) => [
    hello("¡Hola", name, "!"),
    "",
    driver
      ? `Soy ${driver}, conductor de Betinhos, y voy a realizar su traslado${when ? ` el ${when}` : ""}.`
      : `Soy conductor de Betinhos y voy a realizar su traslado${when ? ` el ${when}` : ""}.`,
    `Para asistencia, nuestra central está disponible en el ${PHONE} y en ${EMAIL}.`,
    "",
    "¡Que tenga un excelente día!"
  ]
];

export const PASSENGER_MESSAGE_TEMPLATES: Record<PassengerMessageLanguage, readonly Template[]> = { pt: PT, en: EN, es: ES };

export const PASSENGER_MESSAGE_TEMPLATE_COUNT = PT.length;

export function passengerMessageLanguage(languageCode = ""): PassengerMessageLanguage {
  if (languageCode === "US") return "en";
  if (languageCode === "ES") return "es";
  return "pt";
}

function formatWhen(date: Date | null, language: PassengerMessageLanguage) {
  if (!date || Number.isNaN(date.getTime())) return "";
  const text =
    language === "en"
      ? date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : date.toLocaleString(language === "es" ? "es-ES" : "pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  // O ICU separa "8:30 AM" com espaço estreito; no WhatsApp fica melhor o espaço comum.
  return text.replace(/[  ]/g, " ");
}

/** Índice do modelo sorteado (0 a PASSENGER_MESSAGE_TEMPLATE_COUNT - 1). */
export function pickPassengerMessageTemplate(random: () => number = Math.random) {
  const index = Math.floor(random() * PASSENGER_MESSAGE_TEMPLATE_COUNT);
  return Math.min(Math.max(index, 0), PASSENGER_MESSAGE_TEMPLATE_COUNT - 1);
}

export function buildPassengerMessageFromTemplate(templateIndex: number, input: Omit<PassengerMessageInput, "random">) {
  const language = passengerMessageLanguage(input.languageCode);
  const template = PASSENGER_MESSAGE_TEMPLATES[language][templateIndex] ?? PASSENGER_MESSAGE_TEMPLATES[language][0];
  return template({
    name: firstName(input.passengerName),
    driver: firstName(input.driverName),
    when: formatWhen(input.serviceDate, language),
    now: input.now ?? new Date()
  }).join("\n");
}

export function buildPassengerMessage(input: PassengerMessageInput) {
  return buildPassengerMessageFromTemplate(pickPassengerMessageTemplate(input.random), input);
}
