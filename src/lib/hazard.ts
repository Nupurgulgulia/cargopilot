// R-06 first-pass keyword screening. This is a screen, not a certified
// dangerous-goods classifier: clear matches fail, unclear ones go to the seller.

const NEGATIONS = [
  /non[- ]?flammable/g,
  /non[- ]?aerosol/g,
  /lithium[- ]free/g,
  /battery[- ]free/g,
  /batteries not included/g,
  /no batter(y|ies)/g,
  /without batter(y|ies)/g,
  /alcohol[- ]free/g,
  /pump spray/g,
];

const DEFINITE: { pattern: RegExp; category: string }[] = [
  { pattern: /\blithium\b|\bli[- ]?ion\b|\bli[- ]?po(ly(mer)?)?\b|\blipo\b|\blifepo4\b/, category: "lithium battery" },
  { pattern: /\bpower ?banks?\b/, category: "lithium battery" },
  { pattern: /\baerosols?\b|\bspray ?cans?\b|\bhair ?spray\b|\bspray paint\b|\bspray deodorant\b|\bcompressed gas\b/, category: "aerosol" },
  { pattern: /\bflammable\b|\binflammable\b|\bpetrol\b|\bgasoline\b|\bkerosene\b|\blighter (fluid|gas)\b|\bbutane\b|\bpropane\b|\bmethylated spirits?\b|\bwhite spirit\b|\bturpentine\b|\bacetone\b|\bpaint thinners?\b|\blamp oil\b|\bigniter fluid\b/, category: "flammable liquid" },
];

const POSSIBLE: { pattern: RegExp; why: string }[] = [
  { pattern: /\bbatter(y|ies)\b|\brechargeable\b|\bcordless\b|\bbattery[- ]powered\b/, why: "may contain a lithium battery" },
  { pattern: /\b(e[- ]?cig(arette)?s?|vapes?|vaping)\b/, why: "usually contains a lithium battery" },
  { pattern: /\b(laptops?|phones?|smartphones?|tablets?|smart ?watch(es)?|earbuds?|headphones?|wireless|bluetooth|drones?|e[- ]?bikes?|scooters?|cameras?|torch(es)?|flashlights?)\b/, why: "suggests electronics, which often contain lithium batteries" },
  { pattern: /\bsprays?\b|\bdeodorants?\b|\bair fresheners?\b|\bdry shampoo\b|\bshaving foam\b/, why: "may be an aerosol" },
  { pattern: /\b(perfumes?|fragrances?|colognes?|eau de|nail polish|nail varnish|varnish|lacquer|solvents?|sanitis(er|ers)|sanitiz(er|ers)|alcohol|spirits?|vodka|gin|whisky|rum|paints?|glues?|adhesives?|lighters?|candle oil|essential oils?|fuel)\b/, why: "may be a flammable liquid" },
];

export interface HazardScreen {
  level: "clear" | "possible" | "definite";
  term?: string;
  category?: string;
}

export function screenDescription(description: string): HazardScreen {
  let text = ` ${description.toLowerCase()} `;
  for (const n of NEGATIONS) text = text.replace(n, " ");
  for (const d of DEFINITE) {
    const m = text.match(d.pattern);
    if (m) return { level: "definite", term: m[0].trim(), category: d.category };
  }
  for (const p of POSSIBLE) {
    const m = text.match(p.pattern);
    if (m) return { level: "possible", term: m[0].trim(), category: p.why };
  }
  return { level: "clear" };
}
