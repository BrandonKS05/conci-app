import fs from "fs";

const p = "src/frontend/components/trip-host-lodging-page.tsx";
let s = fs.readFileSync(p, "utf8");
s = s.split("motionDetails").join("div");
fs.writeFileSync(p, s, "utf8");
console.log("replaced motionDetails");
