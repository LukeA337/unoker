// cardGlyphs.ts
//
// UI-only helpers that build the inner markup of a `.uno-card` face from a face
// label ("0".."10", "W", "C", "+2", "+4") and a colour class. Shared by
// Card.astro (the server-rendered rules page) and Game.astro (the client game)
// so the card look lives in exactly ONE place. No game logic here.
//
// The deck borrows UNO's icon language: there is no "10" pip, so the value 10
// is drawn as a SKIP card; the basic Copy is a REVERSE card; Copy +2 / +4 show
// two / four mini "cards" the way UNO's Draw Two / Wild Draw Four do.

function skipSvg(): string {
  return (
    `<svg class="glyph" viewBox="0 0 40 40" aria-hidden="true">` +
    `<circle cx="20" cy="20" r="12" fill="none" stroke="#eaeaec" stroke-width="5"/>` +
    `<line x1="11" y1="29" x2="29" y2="11" stroke="#eaeaec" stroke-width="5" stroke-linecap="round"/>` +
    `</svg>`
  );
}

function reverseSvg(): string {
  return (
    `<svg class="glyph" viewBox="0 0 40 40" aria-hidden="true">` +
    `<g fill="none" stroke="#eaeaec" stroke-width="4.5" stroke-linecap="round">` +
    `<path d="M16 26 C 10 21, 10 17, 16 12"/>` +
    `<path d="M24 14 C 30 19, 30 23, 24 28"/>` +
    `</g>` +
    `<polygon points="16,7 10,16 22,16" fill="#eaeaec"/>` +
    `<polygon points="24,33 18,24 30,24" fill="#eaeaec"/>` +
    `</svg>`
  );
}

function stack(colors: string[], cls: string): string {
  const minis = colors.map((c) => `<i class="mini" style="--c:${c}"></i>`).join("");
  return `<span class="stack ${cls}">${minis}</span>`;
}

function centerHTML(label: string): string {
  switch (label) {
    case "10":
      return skipSvg();
    case "C":
      return reverseSvg();
    case "+2":
      return stack(["#eaeaec", "#eaeaec"], "stack2");
    case "+4":
      return stack(
        ["var(--card-blue)", "var(--card-yellow)", "var(--card-green)", "var(--card-red)"],
        "stack4",
      );
    default:
      return `<span class="val${label.length > 1 ? " small" : ""}">${label}</span>`;
  }
}

function cornerHTML(label: string): string {
  switch (label) {
    case "10":
      return skipSvg();
    case "C":
      return reverseSvg();
    default:
      return label; // "+2", "+4", or a digit
  }
}

/** A short text description for screen readers / tooltips. */
export function cardAria(label: string, color: string): string {
  if (color === "wild") return "Wild card";
  const kind =
    label === "10"
      ? "skip (value 10)"
      : label === "C"
        ? "Copy (reverse)"
        : label === "+2"
          ? "Copy +2"
          : label === "+4"
            ? "Copy +4"
            : `value ${label}`;
  return color === "copy" ? kind : `${color} ${kind}`;
}

/** The inner HTML of a `.uno-card` (corners + tilted oval + centre glyph). */
export function cardFaceHTML(label: string, color: string): string {
  const center = `<span class="pip"><span class="face">${centerHTML(label)}</span></span>`;
  if (color === "wild") return center; // wild: four-colour oval + "W", no corners
  const corner = cornerHTML(label);
  return `<span class="corner tl">${corner}</span>${center}<span class="corner br">${corner}</span>`;
}
