// Textos da página pública em português, inglês e espanhol. O servidor renderiza em português (sem JS a página
// continua legível) e o script troca tudo no cliente: escolha salva > ?lang= > idioma do navegador > português.
// {nome} é trocado pelo valor; os dados que vêm da reserva (endereços, título) não são traduzidos.
export const IDIOMAS = [
  { id: "pt", nome: "Português", local: "pt-BR" },
  { id: "en", nome: "English", local: "en-US" },
  { id: "es", nome: "Español", local: "es-ES" },
];

export const TEXTOS = {
  "titulo.pagina": ["Acompanhe seu motorista · Betinhos", "Track your driver · Betinhos", "Sigue a tu conductor · Betinhos"],
  "titulo.chegou": ["Seu motorista chegou · Betinhos", "Your driver has arrived · Betinhos", "Tu conductor ha llegado · Betinhos"],
  "titulo.concluido": ["Serviço concluído · Betinhos", "Ride completed · Betinhos", "Servicio concluido · Betinhos"],
  "h1": ["Acompanhe seu motorista", "Track your driver", "Sigue a tu conductor"],
  "idioma": ["Idioma", "Language", "Idioma"],
  "mapa": ["Mapa com a posição do veículo", "Map with the vehicle location", "Mapa con la ubicación del vehículo"],
  "compartilhar": ["Compartilhar este link", "Share this link", "Compartir este enlace"],
  "reserva": ["Reserva {n}", "Booking {n}", "Reserva {n}"],
  "card.mapa": ["Localização ao vivo", "Live location", "Ubicación en vivo"],
  "card.motorista": ["Motorista e veículo", "Driver and vehicle", "Conductor y vehículo"],
  "card.trajeto": ["Trajeto e horários", "Route and times", "Ruta y horarios"],
  "mapa.ampliar": ["Ampliar mapa", "Expand map", "Ampliar mapa"],
  "mapa.fechar": ["Fechar mapa", "Close map", "Cerrar mapa"],
  "traj.agendado": ["Agendado", "Scheduled", "Programado"],
  "traj.previsto": ["Previsto", "Expected", "Previsto"],
  "centrar": ["Mostrar veículo e destino", "Show vehicle and destination", "Mostrar vehículo y destino"],
  "copiado": ["Link copiado", "Link copied", "Enlace copiado"],
  "passos": ["Etapas do serviço", "Ride progress", "Etapas del servicio"],
  "passo.a_caminho": ["A caminho", "On the way", "En camino"],
  "passo.chegando": ["Chegando", "Arriving", "Llegando"],
  "passo.no_local": ["No local", "At pickup", "En el lugar"],
  "passo.em_viagem": ["Em viagem", "In transit", "En viaje"],
  "passo.concluido": ["Concluído", "Completed", "Concluido"],
  "status.localizando": ["Localizando o veículo…", "Locating the vehicle…", "Localizando el vehículo…"],
  "status.aguardando": ["Aguardando posição do veículo", "Waiting for the vehicle location", "Esperando la ubicación del vehículo"],
  "status.noLocal": ["Motorista no local", "Driver at pickup", "Conductor en el lugar"],
  "status.desatualizada": ["Posição desatualizada", "Location out of date", "Ubicación desactualizada"],
  "status.chegandoDestino": ["Chegando ao destino", "Arriving at destination", "Llegando al destino"],
  "status.semResposta": ["Sem resposta. Tentando de novo…", "No response. Retrying…", "Sin respuesta. Reintentando…"],
  "eta.chega": ["Chega em", "Arrives in", "Llega en"],
  "eta.destino": ["Destino em", "Destination in", "Destino en"],
  "eta.cerca": ["Em cerca de", "In about", "En unos"],
  "eta.as": ["Chegada prevista às {h}", "Expected arrival at {h}", "Llegada prevista a las {h}"],
  "eta.semTransito": ["Sem trânsito", "No traffic data", "Sin tráfico"],
  "m.rotulo": ["Quem é seu motorista", "Who is your driver", "Quién es tu conductor"],
  "m.papel": ["Seu motorista", "Your driver", "Tu conductor"],
  "m.motorista": ["Motorista", "Driver", "Conductor"],
  "m.emDefinicao": ["Motorista em definição", "Driver to be assigned", "Conductor por definir"],
  "m.emDefinicaoAviso": ["Assim que a escala for confirmada, o motorista e o carro aparecem aqui.", "As soon as the schedule is confirmed, your driver and car will appear here.", "En cuanto se confirme la escala, el conductor y el coche aparecerán aquí."],
  "m.abrir": ["Ver motorista em tela cheia", "View driver in full screen", "Ver conductor en pantalla completa"],
  "m.abrirCarro": ["Ver carro em tela cheia", "View car in full screen", "Ver auto en pantalla completa"],
  "m.ligar": ["Ligar", "Call", "Llamar"],
  "m.ligarPara": ["Ligar para {nome}", "Call {nome}", "Llamar a {nome}"],
  "m.ligarCentral": ["Ligar para a central Betinhos", "Call Betinhos dispatch", "Llamar a la central Betinhos"],
  "m.whatsDe": ["WhatsApp de {nome}", "WhatsApp {nome}", "WhatsApp de {nome}"],
  "m.whatsCentral": ["WhatsApp da central Betinhos", "Betinhos dispatch WhatsApp", "WhatsApp de la central Betinhos"],
  "m.nota": ["Contato pela central Betinhos", "Contact through Betinhos dispatch", "Contacto a través de la central Betinhos"],
  "sino.ativar": ["Avisar quando estiver chegando", "Notify me when arriving", "Avisarme cuando esté llegando"],
  "sino.ativarEmDefinicao": ["Avisar quando o motorista for definido", "Notify me when the driver is assigned", "Avisarme cuando se defina el conductor"],
  "sino.ativo": ["Aviso ligado", "Alert on", "Aviso activado"],
  "sino.ligado": ["Vamos avisar quando {motorista} estiver chegando", "We'll let you know when {motorista} is arriving", "Te avisaremos cuando {motorista} esté llegando"],
  "sino.ligadoSemNome": ["Vamos avisar quando o motorista estiver chegando", "We'll let you know when the driver is arriving", "Te avisaremos cuando el conductor esté llegando"],
  "sino.ligadoEmDefinicao": ["Vamos avisar quando o motorista for definido e quando estiver chegando", "We'll let you know when the driver is assigned and when they're arriving", "Te avisaremos cuando se defina el conductor y cuando esté llegando"],
  "sino.desligado": ["Aviso desligado", "Alert off", "Aviso desactivado"],
  "sino.erro": ["Não foi possível ligar o aviso. Tente de novo.", "Couldn't turn on the alert. Please try again.", "No fue posible activar el aviso. Inténtalo de nuevo."],
  "sino.negadoTitulo": ["Notificações bloqueadas", "Notifications blocked", "Notificaciones bloqueadas"],
  "sino.negado": ["Este navegador está bloqueando as notificações deste site. Libere nas configurações do site (o cadeado ao lado do endereço) e toque no botão de novo.", "This browser is blocking notifications from this site. Allow them in the site settings (the lock next to the address) and tap the button again.", "Este navegador bloquea las notificaciones de este sitio. Actívalas en la configuración del sitio (el candado junto a la dirección) y toca el botón de nuevo."],
  "sino.iphoneTitulo": ["Avisos no iPhone", "Alerts on iPhone", "Avisos en iPhone"],
  "sino.iphone": ["No iPhone, o aviso só funciona pela tela de início. Toque em Compartilhar → Adicionar à Tela de Início e abra o acompanhamento pelo ícone.", "On iPhone, alerts only work from the Home Screen. Tap Share → Add to Home Screen and open the tracking from the icon.", "En iPhone, el aviso solo funciona desde la pantalla de inicio. Toca Compartir → Añadir a pantalla de inicio y abre el seguimiento desde el icono."],
  "sino.entendi": ["Entendi", "Got it", "Entendido"],
  "placa": ["Placa", "License plate", "Matrícula"],
  "veiculo": ["Veículo", "Vehicle", "Vehículo"],
  "veiculo.betinhos": ["Veículo Betinhos", "Betinhos vehicle", "Vehículo Betinhos"],
  "tc.detalhes": ["Detalhes", "Details", "Detalles"],
  "tc.fechar": ["Fechar", "Close", "Cerrar"],
  "tc.carro": ["Carro", "Car", "Auto"],
  "paradas": ["Saída, paradas e destino", "Pickup, stops and destination", "Salida, paradas y destino"],
  "etapa": ["Etapa {n}", "Stop {n}", "Etapa {n}"],
  "etapa.saida": ["Saída", "Pickup", "Salida"],
  "etapa.destino": ["Destino", "Destination", "Destino"],
  "etapa.parada": ["Parada {n}", "Stop {n}", "Parada {n}"],
  "etapa.agora": ["Agora", "Now", "Ahora"],
  "etapa.feita": ["concluída", "completed", "completada"],
  "etapa.atual": ["etapa atual", "current stop", "etapa actual"],
  "etapa.futura": ["próxima", "upcoming", "próxima"],
  "aviso.chegou": ["Seu motorista chegou", "Your driver has arrived", "Tu conductor ha llegado"],
  "aviso.procure": ["Procure o {carro}", "Look for the {carro}", "Busca el {carro}"],
  "aviso.procureCarro": ["Procure o carro", "Look for the car", "Busca el auto"],
  "aviso.placa": [", placa {placa}", ", plate {placa}", ", matrícula {placa}"],
  "aviso.espera": ["Esperando por você há {n} min", "Waiting for you for {n} min", "Esperándote desde hace {n} min"],
  "vivo.agora": ["Atualizado agora", "Updated just now", "Actualizado ahora"],
  "vivo.ha": ["Última posição há {t}", "Last location {t} ago", "Última ubicación hace {t}"],
  "vivo.parado": [" · parado", " · stopped", " · detenido"],
  "conexao.off": ["Sem conexão. Tentando de novo…", "No connection. Retrying…", "Sin conexión. Reintentando…"],
  "conexao.rastreador": ["Aguardando o rastreador", "Waiting for the tracker", "Esperando el rastreador"],
  "conexao.reconectando": ["Reconectando…", "Reconnecting…", "Reconectando…"],
  "local.agoraEm": ["Agora em", "Now at", "Ahora en"],
  "concluido.titulo": ["Serviço concluído", "Ride completed", "Servicio concluido"],
  "concluido.obrigado": ["Obrigado por viajar com a Betinhos.", "Thank you for riding with Betinhos.", "Gracias por viajar con Betinhos."],
  "concluido.chegada": ["Chegada às {h}. Obrigado por viajar com a Betinhos.", "Arrived at {h}. Thank you for riding with Betinhos.", "Llegada a las {h}. Gracias por viajar con Betinhos."],
  "resumo.saida": ["Saída", "Departure", "Salida"],
  "resumo.chegada": ["Chegada", "Arrival", "Llegada"],
  "resumo.duracao": ["Duração", "Duration", "Duración"],
  "resumo.distancia": ["Distância", "Distance", "Distancia"],
  "agendado.titulo": ["Aguardando a saída", "Waiting for departure", "Esperando la salida"],
  "agendado.texto": ["Viagem agendada para {dia} às {h}", "Ride scheduled for {dia} at {h}", "Viaje programado para el {dia} a las {h}"],
  "boasvindas": ["Seja bem-vindo · Welcome to Brazil", "Welcome to Brazil", "Bienvenido a Brasil · Welcome to Brazil"],
  "faixa.saida": ["Saída {h}", "Pickup {h}", "Salida {h}"],
  "h.confirmada": ["Reserva confirmada", "Booking confirmed", "Reserva confirmada"],
  "h.definido": ["Motorista definido", "Driver assigned", "Conductor asignado"],
  "h.a_caminho": ["Seu motorista está a caminho", "Your driver is on the way", "Tu conductor está en camino"],
  "h.chegando": ["Seu motorista está chegando", "Your driver is arriving", "Tu conductor está llegando"],
  "h.no_local": ["Seu motorista chegou", "Your driver has arrived", "Tu conductor ha llegado"],
  "h.desembarque": ["{nome} espera você no desembarque", "{nome} is waiting for you at arrivals", "{nome} te espera en la zona de llegadas"],
  "h.em_viagem": ["Viagem em andamento", "Ride in progress", "Viaje en curso"],
  "seg.confirmada": ["Confirmada", "Confirmed", "Confirmada"],
  "seg.definido": ["Motorista definido", "Driver assigned", "Conductor asignado"],
  "f.definicao": ["Assim que a escala for confirmada, seu motorista aparece aqui.", "As soon as the schedule is confirmed, your driver will appear here.", "En cuanto se confirme la escala, tu conductor aparecerá aquí."],
  "f.aguarda": ["Vamos avisar quando seu motorista sair para o embarque.", "We'll let you know when your driver heads to the pickup.", "Te avisaremos cuando tu conductor salga hacia el embarque."],
  "f.chega": ["Chega em {local} às {h} — {n} min antes do horário", "Arrives at {local} at {h} — {n} min before schedule", "Llega a {local} a las {h} — {n} min antes de la hora"],
  "f.chegaTarde": ["Chega em {local} às {h} — {n} min após o horário", "Arrives at {local} at {h} — {n} min after schedule", "Llega a {local} a las {h} — {n} min después de la hora"],
  "f.chegaHora": ["Chega em {local} às {h} — no horário", "Arrives at {local} at {h} — on schedule", "Llega a {local} a las {h} — a la hora"],
  "f.chegaSo": ["Chega em {local} às {h}", "Arrives at {local} at {h}", "Llega a {local} a las {h}"],
  "f.semPrevisao": ["Previsão de chegada indisponível no momento.", "Arrival estimate unavailable right now.", "Previsión de llegada no disponible por ahora."],
  "f.espera": ["Seu motorista espera por você há {n} min.", "Your driver has been waiting for you for {n} min.", "Tu conductor te espera desde hace {n} min."],
  "f.desembarque": ["Seu motorista espera você no desembarque.", "Your driver is waiting for you at arrivals.", "Tu conductor te espera en la zona de llegadas."],
  "f.emViagem": ["Chegada prevista ao destino às {h}.", "Expected arrival at your destination at {h}.", "Llegada prevista al destino a las {h}."],
  "f.boaViagem": ["Boa viagem!", "Have a safe trip!", "¡Buen viaje!"],
  "nota.semRastreio": ["Este serviço não tem acompanhamento em tempo real.", "This ride has no live tracking.", "Este servicio no tiene seguimiento en tiempo real."],
  "card.seuMotorista": ["Seu motorista", "Your driver", "Tu conductor"],
  "card.viagem": ["Sua viagem", "Your trip", "Tu viaje"],
  "tl.confirmada": ["Reserva confirmada", "Booking confirmed", "Reserva confirmada"],
  "tl.definicao": ["Definindo o motorista", "Assigning a driver", "Definiendo el conductor"],
  "tl.definido": ["Motorista definido", "Driver assigned", "Conductor asignado"],
  "tl.a_caminho": ["Motorista a caminho", "Driver on the way", "Conductor en camino"],
  "tl.no_local": ["Motorista no local", "Driver at pickup", "Conductor en el lugar"],
  "tl.embarque": ["Embarque", "Pickup", "Embarque"],
  "tl.chegada": ["Chegada ao destino", "Arrival at destination", "Llegada al destino"],
  "mapa.aoVivo": ["Ao vivo", "Live", "En vivo"],
  "mapa.km": ["{km} do embarque", "{km} from pickup", "{km} del embarque"],
  "mapa.kmDestino": ["{km} do destino", "{km} to destination", "{km} del destino"],
  "mapa.semPrevisao": ["Previsão indisponível", "Estimate unavailable", "Previsión no disponible"],
  "cp.titulo": ["Compartilhar a viagem", "Share this ride", "Compartir el viaje"],
  "cp.sub": ["Envie o link a quem espera você.", "Send the link to whoever is waiting for you.", "Envía el enlace a quien te espera."],
  "central.titulo": ["Central Betinhos 24h", "Betinhos dispatch 24/7", "Central Betinhos 24h"],
  "central.sub": ["Algo diferente do combinado? Fale com a central.", "Something not as agreed? Talk to dispatch.", "¿Algo distinto a lo acordado? Habla con la central."],
  "pax.faixa": ["Faltam dados de {n} passageiro(s)", "Missing details for {n} passenger(s)", "Faltan datos de {n} pasajero(s)"],
  "pax.completar": ["Completar", "Complete", "Completar"],
  "pax.titulo": ["Passageiros", "Passengers", "Pasajeros"],
  "pax.encerrado": ["Cadastro encerrado para este serviço", "Registration closed for this ride", "Registro cerrado para este servicio"],
  "pax.editar": ["Editar", "Edit", "Editar"],
  "pax.editarDe": ["Editar dados de {nome}", "Edit details for {nome}", "Editar datos de {nome}"],
  "pax.falta.foto": ["Falta foto", "No photo", "Falta foto"],
  "pax.falta.telefone": ["Falta telefone", "No phone", "Falta teléfono"],
  "pax.falta.email": ["Falta e-mail", "No e-mail", "Falta correo"],
  "pax.fechar": ["Fechar", "Close", "Cerrar"],
  "pax.sub": ["Preencha só o que quiser atualizar.", "Fill in only what you want to update.", "Completa solo lo que quieras actualizar."],
  "pax.camera": ["Tirar foto", "Take a photo", "Tomar foto"],
  "pax.galeria": ["Escolher da galeria", "Choose from gallery", "Elegir de la galería"],
  "pax.tel": ["Telefone", "Phone", "Teléfono"],
  "pax.email": ["E-mail", "E-mail", "Correo electrónico"],
  "pax.atual": ["Atual: {v}", "Current: {v}", "Actual: {v}"],
  "pax.salvar": ["Salvar", "Save", "Guardar"],
  "pax.salvando": ["Salvando…", "Saving…", "Guardando…"],
  "pax.salvo": ["Dados salvos", "Details saved", "Datos guardados"],
  "pax.descartarTitulo": ["Descartar alterações?", "Discard changes?", "¿Descartar los cambios?"],
  "pax.continuar": ["Continuar editando", "Keep editing", "Seguir editando"],
  "pax.descartar": ["Descartar", "Discard", "Descartar"],
  "pax.err.tel": ["Telefone inválido. Use DDD e número.", "Invalid phone. Include the area code.", "Teléfono no válido. Incluye el código de área."],
  "pax.err.email": ["E-mail inválido.", "Invalid e-mail.", "Correo no válido."],
  "pax.err.abrir": ["Não foi possível abrir este arquivo. Escolha uma foto em JPG ou PNG.", "Could not open this file. Choose a JPG or PNG photo.", "No se pudo abrir este archivo. Elige una foto JPG o PNG."],
  "pax.err.heic": ["Este aparelho não abriu a foto em HEIC. Escolha outra ou tire uma nova.", "This device could not open the HEIC photo. Choose another or take a new one.", "Este dispositivo no abrió la foto HEIC. Elige otra o toma una nueva."],
  "pax.err.grande": ["A foto ficou grande demais. Tente outra.", "The photo is too large. Try another.", "La foto es demasiado grande. Prueba con otra."],
  "pax.err.400": ["Confira os dados e tente de novo.", "Check the details and try again.", "Revisa los datos e inténtalo de nuevo."],
  "pax.err.409": ["O serviço foi concluído e o cadastro está encerrado.", "The ride is complete and registration is closed.", "El servicio terminó y el registro está cerrado."],
  "pax.err.410": ["O prazo para este cadastro terminou.", "The registration period has ended.", "El plazo de este registro terminó."],
  "pax.err.413": ["Os dados enviados são grandes demais. Use uma foto menor.", "The data is too large. Use a smaller photo.", "Los datos son demasiado grandes. Usa una foto más pequeña."],
  "pax.err.429": ["Muitas tentativas. Aguarde um minuto e tente de novo.", "Too many attempts. Wait a minute and try again.", "Demasiados intentos. Espera un minuto e inténtalo de nuevo."],
  "pax.err.rede": ["Não foi possível salvar agora. Seus dados continuam aqui; tente de novo.", "Could not save right now. Your details are still here; try again.", "No se pudo guardar ahora. Tus datos siguen aquí; inténtalo de nuevo."],
  "av.titulo": ["Como foi o seu serviço?", "How was your ride?", "¿Qué tal tu servicio?"],
  "av.nota": ["Nota {n} de 5", "Rating {n} of 5", "Nota {n} de 5"],
  "av.comentario": ["Comentário (opcional)", "Comment (optional)", "Comentario (opcional)"],
  "av.conta": ["{n} de 1000 caracteres", "{n} of 1000 characters", "{n} de 1000 caracteres"],
  "av.enviar": ["Enviar avaliação", "Submit rating", "Enviar valoración"],
  "av.enviando": ["Enviando…", "Sending…", "Enviando…"],
  "av.obrigado": ["Obrigado pela avaliação", "Thanks for your rating", "Gracias por tu valoración"],
  "av.erro429": ["Muitas tentativas. Tente de novo mais tarde.", "Too many attempts. Please try again later.", "Demasiados intentos. Inténtalo más tarde."],
  "av.erro": ["Não foi possível enviar a avaliação. Tente de novo.", "Couldn't send your rating. Please try again.", "No se pudo enviar la valoración. Inténtalo de nuevo."],
  "av.semConexao": ["Sem conexão. Tente de novo.", "No connection. Please try again.", "Sin conexión. Inténtalo de nuevo."],
  "contato.whats": ["Falar no WhatsApp", "Chat on WhatsApp", "Escribir por WhatsApp"],
  "contato.ligar": ["Ligar central", "Call dispatch", "Llamar a la central"],
  "expirado.titulo": ["Link expirado", "Link expired", "Enlace caducado"],
  "expirado.texto": ["Este acompanhamento terminou. Se precisar de informações sobre o seu transporte, fale com a Betinhos.", "This tracking has ended. If you need information about your ride, contact Betinhos.", "Este seguimiento ha terminado. Si necesitas información sobre tu traslado, contacta con Betinhos."],
  "revogado.titulo": ["Acompanhamento encerrado", "Tracking ended", "Seguimiento finalizado"],
  "revogado.texto": ["Este link foi encerrado pela Betinhos e não mostra mais a posição do veículo. Se tiver um serviço agendado, fale com a central para receber um novo link.", "Betinhos has closed this link and it no longer shows the vehicle location. If you have a scheduled ride, contact dispatch to get a new link.", "Betinhos ha cerrado este enlace y ya no muestra la ubicación del vehículo. Si tienes un servicio programado, contacta con la central para recibir un nuevo enlace."],
};

// Cores do veículo como vêm do Dataverse (português); o que não estiver aqui aparece como veio.
export const CORES = {
  preto: ["Black", "Negro"], preta: ["Black", "Negro"], branco: ["White", "Blanco"], branca: ["White", "Blanco"],
  prata: ["Silver", "Plateado"], cinza: ["Gray", "Gris"], grafite: ["Graphite", "Grafito"], chumbo: ["Dark gray", "Gris oscuro"],
  azul: ["Blue", "Azul"], vermelho: ["Red", "Rojo"], vermelha: ["Red", "Rojo"], verde: ["Green", "Verde"],
  bege: ["Beige", "Beige"], marrom: ["Brown", "Marrón"], dourado: ["Gold", "Dorado"], dourada: ["Gold", "Dorado"],
  vinho: ["Burgundy", "Granate"], amarelo: ["Yellow", "Amarillo"], laranja: ["Orange", "Naranja"],
};

// Avisos por web push (montados no servidor, no idioma da inscrição; não vão para a página). Nunca levam
// endereço nem nome do passageiro; {motorista} é o primeiro nome do motorista.
export const AVISOS = {
  "motorista_definido.titulo": ["Seu motorista é {motorista}", "Your driver is {motorista}", "Tu conductor es {motorista}"],
  "motorista_definido.semCarro": ["Toque para ver os detalhes", "Tap to see the details", "Toca para ver los detalles"],
  "chegando_embarque.titulo": ["{motorista} está chegando", "{motorista} is arriving", "{motorista} está llegando"],
  "chegando_embarque.semNome": ["Seu motorista está chegando", "Your driver is arriving", "Tu conductor está llegando"],
  "chegando_embarque.corpo": ["{veiculo} {placa}", "{veiculo} {placa}", "{veiculo} {placa}"],
  "chegou_embarque.titulo": ["Seu motorista chegou", "Your driver has arrived", "Tu conductor ha llegado"],
  "chegou_embarque.corpo": ["Procure o {veiculo}, placa {placa}", "Look for the {veiculo}, plate {placa}", "Busca el {veiculo}, placa {placa}"],
  "chegou_embarque.semPlaca": ["Procure o {veiculo}", "Look for the {veiculo}", "Busca el {veiculo}"],
  "chegou_embarque.soPlaca": ["Placa {placa}", "Plate {placa}", "Placa {placa}"],
  "viagem_iniciada.titulo": ["Viagem iniciada", "Ride started", "Viaje iniciado"],
  "viagem_iniciada.corpo": ["Previsão de chegada {hora}", "Expected arrival {hora}", "Llegada prevista {hora}"],
  "chegando_destino.titulo": ["Chegando ao destino", "Arriving at destination", "Llegando al destino"],
  "concluido.titulo": ["Viagem concluída", "Ride completed", "Viaje concluido"],
  "concluido.corpo": ["Toque para avaliar", "Tap to rate", "Toca para valorar"],
};

/** Texto em português (o que o servidor renderiza). */
export const pt = (chave) => TEXTOS[chave][0];

// Bandeiras simplificadas (3:2), desenhadas para 21x14 px.
const bandeira = (corpo) => `<svg viewBox="0 0 36 24" aria-hidden="true" focusable="false">${corpo}</svg>`;
const listras = Array.from({ length: 6 }, (_, i) => `<rect y="${((2 * i + 1) * 24) / 13}" width="36" height="${24 / 13}" fill="#fff"/>`).join("");
const estrelas = [0, 1, 2].flatMap((l) => [0, 1, 2, 3].map((c) => `<circle cx="${2.2 + c * 3.3}" cy="${2.4 + l * 4}" r=".75" fill="#fff"/>`)).join("");
export const BANDEIRAS = {
  pt: bandeira('<rect width="36" height="24" fill="#009c3b"/><path d="M18 2.6 33 12 18 21.4 3 12z" fill="#ffdf00"/><circle cx="18" cy="12" r="5.4" fill="#002776"/><path d="M12.8 11.1c3.1-1 7.4-.6 10.4 1.5" fill="none" stroke="#fff" stroke-width="1"/>'),
  en: bandeira(`<rect width="36" height="24" fill="#b22234"/>${listras}<rect width="14.4" height="${(24 * 7) / 13}" fill="#3c3b6e"/>${estrelas}`),
  es: bandeira('<rect width="36" height="24" fill="#aa151b"/><rect y="6" width="36" height="12" fill="#f1bf00"/>'),
};

/** Seletor: botão com a bandeira atual e menu com as três. */
export const seletorIdioma = () => `<div class="idioma" id="idioma">
    <button type="button" class="qd idioma-botao" id="idioma-botao" aria-haspopup="true" aria-expanded="false" aria-controls="idioma-menu" data-i18n-aria="idioma" aria-label="${pt("idioma")}"><span class="bandeira" id="idioma-atual">${BANDEIRAS.pt}</span></button>
    <div class="idioma-menu" id="idioma-menu" role="group" data-i18n-aria="idioma" aria-label="${pt("idioma")}" hidden>${IDIOMAS.map((l) => `<button type="button" class="idioma-op" data-idioma="${l.id}" lang="${l.local}" aria-pressed="${l.id === "pt"}"><span class="bandeira">${BANDEIRAS[l.id]}</span><span>${l.id.toUpperCase()}</span><span class="sr">${l.nome}</span></button>`).join("")}</div>
  </div>`;

export const CSS_IDIOMA = `
.idioma{position:relative;z-index:4;display:flex;align-items:center;gap:6px}
.idioma-botao{width:36px;height:36px;border-radius:var(--bt-radius-full)}
.bandeira{display:block;width:21px;height:14px;border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px rgba(15,23,42,.12)}
.bandeira svg{display:block;width:100%;height:100%}
.idioma-menu{display:flex;gap:2px;padding:3px;border-radius:var(--bt-radius-full);background:var(--bt-glass);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:var(--bt-shadow-float);animation:idioma-abre var(--bt-duration-fast) var(--bt-ease-out)}
.idioma-op{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:0 9px;border:0;border-radius:var(--bt-radius-full);background:transparent;font:800 11px var(--bt-font-family-sans);letter-spacing:.04em;color:var(--bt-color-text-secondary);cursor:pointer;transition:background-color var(--bt-duration-fast),color var(--bt-duration-fast)}
.idioma-op[aria-pressed="true"]{background:var(--bt-color-action-soft);color:var(--bt-color-brand)}
.idioma-op:focus-visible{outline:0;box-shadow:var(--bt-focus-ring)}
@media (hover:hover) and (pointer:fine){.idioma-op:hover{background:var(--bt-color-surface-soft);color:var(--bt-color-brand)}}
@keyframes idioma-abre{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:none}}
.vazio-topo{position:fixed;right:16px;top:calc(16px + env(safe-area-inset-top));left:auto;flex-direction:row-reverse}`;

/**
 * Script do idioma (roda antes do da página): escolhe, aplica nos elementos marcados com data-i18n / data-i18n-aria /
 * data-i18n-ph e expõe window.BT_IDIOMA = { t, cor, local, id, aoMudar } para o script da página traduzir o que é dinâmico.
 */
export function scriptIdioma(tituloChave, prefixos = null) {
  // prefixos: as telas sem acompanhamento levam só os textos que usam (a revogada não carrega "Link expirado").
  const textos = prefixos ? Object.fromEntries(Object.entries(TEXTOS).filter(([k]) => prefixos.some((p) => k === p || k.startsWith(`${p}.`)))) : TEXTOS;
  const dados = { textos, cores: CORES, idiomas: IDIOMAS, bandeiras: BANDEIRAS, titulo: tituloChave };
  return `<script>
(function () {
  "use strict";
  var D = ${JSON.stringify(dados).replace(/</g, "\\u003c")};
  var IDS = D.idiomas.map(function (l) { return l.id; }), ouvintes = [], atual = "pt", tituloChave = D.titulo;
  function valido(x) { x = String(x || "").slice(0, 2).toLowerCase(); return IDS.indexOf(x) >= 0 ? x : null; }
  function inicial() {
    var salvo = null;
    try { salvo = valido(localStorage.getItem("bt-idioma")); } catch (e) { /* sem storage */ }
    if (salvo) return salvo;
    var q = valido(new URLSearchParams(location.search).get("lang"));
    if (q) return q;
    var nav = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < nav.length; i++) { var v = valido(nav[i]); if (v) return v; }
    return "pt";
  }
  function t(chave, vars) {
    var l = D.textos[chave], s = l ? l[IDS.indexOf(atual)] : chave;
    if (vars) s = s.replace(/\\{(\\w+)\\}/g, function (m, k) { return vars[k] == null ? "" : String(vars[k]); });
    return s;
  }
  function cor(c) {
    var s = String(c || "").trim(), l = D.cores[s.toLowerCase()];
    return atual === "pt" || !l ? s : l[atual === "en" ? 0 : 1];
  }
  function local() { return D.idiomas[IDS.indexOf(atual)].local; }
  function aplicar() {
    document.documentElement.lang = local();
    [].forEach.call(document.querySelectorAll("[data-i18n]"), function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    [].forEach.call(document.querySelectorAll("[data-i18n-aria]"), function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    [].forEach.call(document.querySelectorAll("[data-i18n-ph]"), function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    document.title = t(tituloChave);
    var b = document.getElementById("idioma-atual"); if (b) b.innerHTML = D.bandeiras[atual];
    [].forEach.call(document.querySelectorAll(".idioma-op"), function (op) { op.setAttribute("aria-pressed", String(op.getAttribute("data-idioma") === atual)); });
  }
  function mudar(id) {
    if (!valido(id)) return;
    atual = id;
    try { localStorage.setItem("bt-idioma", id); } catch (e) { /* sem storage: vale só nesta visita */ }
    aplicar();
    ouvintes.forEach(function (f) { f(atual); });
  }
  window.BT_IDIOMA = {
    t: t, cor: cor, local: local, id: function () { return atual; },
    aoMudar: function (f) { ouvintes.push(f); },
    titulo: function (chave) { tituloChave = chave; document.title = t(chave); }
  };
  atual = inicial();
  if (atual !== "pt") aplicar(); else document.title = t(tituloChave);

  var caixa = document.getElementById("idioma"), botao = document.getElementById("idioma-botao"), menu = document.getElementById("idioma-menu");
  if (!caixa) return;
  function abrir(sim) { menu.hidden = !sim; botao.setAttribute("aria-expanded", String(sim)); }
  botao.addEventListener("click", function () { abrir(menu.hidden); if (!menu.hidden) menu.querySelector('[aria-pressed="true"]').focus(); });
  [].forEach.call(menu.querySelectorAll(".idioma-op"), function (op) {
    op.addEventListener("click", function () { mudar(op.getAttribute("data-idioma")); abrir(false); botao.focus(); });
  });
  document.addEventListener("click", function (e) { if (!menu.hidden && !caixa.contains(e.target)) abrir(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { abrir(false); botao.focus(); } });
})();
</script>`;
}
