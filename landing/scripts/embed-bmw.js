const fs = require("fs");
const path = require("path");
const pngPath = path.join(__dirname, "../assets/images/bmw-m5-cs.png");
const outPath = path.join(__dirname, "../js/bmw-image-data.js");
const b64 = fs.readFileSync(pngPath).toString("base64");
fs.writeFileSync(outPath, "window.BMW_IMAGE_DATA=\"data:image/png;base64," + b64 + "\";");
console.log("Written", outPath, (b64.length / 1024).toFixed(1), "KB base64");
