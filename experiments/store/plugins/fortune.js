/**
 * Shin-Lab - https://github.com/riokuroxi-svg/Shin-Lab
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Plugin oficial de ejemplo: .fortuna
// Un plugin exporta { name, aliases, description, execute }.
module.exports = {
  name: "fortuna",
  aliases: ["suerte", "fortune"],
  description: "Te dice tu fortuna del día 🔮",
  execute({ args }) {
    const fortunas = [
      "Hoy es un gran día para escribirle a esa persona.",
      "Alguien piensa en ti ahora mismo.",
      "Cuidado con los mensajes doble sentido hoy.",
      "La suerte favorece a los que responden rápido.",
      "No confíes en el que dice 'solo una pregunta más'.",
    ];
    const extra = args && args.length ? " (pregunta: " + args.join(" ") + ")" : "";
    return "🔮 " + fortunas[Math.floor(Math.random() * fortunas.length)] + extra;
  },
};
