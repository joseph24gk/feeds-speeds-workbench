const sharp = require("sharp");
const ICONS = {
  square: ["M10 2.5h4V9h2v12H8V9h2V2.5z", "M9 12.5l6 2", "M9 16l6 2"],
  ball: ["M10 2.5h4V9h2v8a4 4 0 0 1-8 0V9h2V2.5z", "M9 12l6 2", "M9 15.5l6 2"],
  chamfer: ["M10 2.5h4V9h2v4.5L13 20.5h-2l-3-7V9h2V2.5z", "M8 13.5h8"],
  drill: ["M9.5 2.5h5V17L12 21.5 9.5 17V2.5z", "M9.5 8l5 2.8", "M9.5 12.7l5 2.8"],
  tap: ["M10.5 2.5h3V8h.5v11l-1.5 3h-1L10 19V8h.5V2.5z", "M8.75 10.5h6.5", "M8.75 13h6.5", "M8.75 15.5h6.5"],
};
const cells = Object.entries(ICONS).map(([name, paths], i) =>
  `<g transform="translate(${i * 110 + 20}, 20)">
     <rect x="-10" y="-10" width="100" height="120" fill="#FDFDFC" stroke="#D2D5CF"/>
     <g transform="scale(3.4)" fill="none" stroke="#22262B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
       ${paths.map((d) => `<path d="${d}"/>`).join("")}
     </g>
     <text x="40" y="102" font-size="11" text-anchor="middle" fill="#6B7280" font-family="sans-serif">${name}</text>
   </g>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="580" height="160" ><rect width="580" height="160" fill="#E7E8E4"/>${cells}</svg>`;
sharp(Buffer.from(svg)).png().toFile(process.argv[2]).then(() => console.log("written"));
