// Writes public/qr.svg, a QR code for the live site, shown in the footer and the README.
//   npm run qr                                   for https://yashisacoder.github.io/3821-viz/
//   SITE_URL=https://example.com/ npm run qr     for anywhere else
import { writeFileSync } from "node:fs";
import QRCode from "qrcode";

const url = process.env.SITE_URL ?? "https://yashisacoder.github.io/3821-viz/";
const svg = await QRCode.toString(url, {
  type: "svg",
  margin: 1,
  errorCorrectionLevel: "M",
  color: { dark: "#141414", light: "#ece8df" },
});
writeFileSync(new URL("../public/qr.svg", import.meta.url), svg);
console.log(`public/qr.svg -> ${url}`);
