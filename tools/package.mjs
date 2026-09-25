// Gera dist/battle-royale.mcaddon (BP + RP) para instalar com duplo clique ou copiar pro BDS.
import AdmZip from "adm-zip";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
const zip = new AdmZip();
zip.addLocalFolder("behavior_pack", "battle_royale_bp");
zip.addLocalFolder("resource_pack", "battle_royale_rp");
zip.writeZip("dist/battle-royale.mcaddon");
console.log("dist/battle-royale.mcaddon gerado");
