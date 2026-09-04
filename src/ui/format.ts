const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function formatDate(value: string) {
  return dateFormatter.format(new Date(value)).replace(" de ", " ");
}

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function sourceLabel(source: "camara" | "senado") {
  return source === "camara" ? "Câmara dos Deputados" : "Senado Federal";
}

export function houseLabel(house: "camara" | "senado" | "congresso" | null) {
  if (house === "camara") return "Câmara";
  if (house === "senado") return "Senado";
  if (house === "congresso") return "Congresso";
  return "Casa não informada";
}

export function roleLabel(role: "deputado_federal" | "senador") {
  return role === "deputado_federal" ? "Deputado(a) federal" : "Senador(a)";
}
