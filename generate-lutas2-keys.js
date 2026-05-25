const { generateKeyPairSync } = require("crypto");
const { writeFileSync, existsSync } = require("fs");

if (existsSync("lutas2_private_key.pem")) {
  console.log("As chaves já existem. Remova lutas2_private_key.pem se quiser gerar novas.");
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

writeFileSync("lutas2_private_key.pem", privateKey);
writeFileSync("lutas2_public_key.pem", publicKey);

console.log("=========================================");
console.log("✅ Chaves RSA geradas com sucesso!");
console.log("=========================================");
console.log("Abaixo está a sua CHAVE PÚBLICA. Copie isso e envie para a equipe da API de Lutas:");
console.log("");
console.log(publicKey);
console.log("=========================================");
console.log("Sua chave privada foi salva localmente em 'lutas2_private_key.pem'.");
console.log("NUNCA compartilhe sua chave privada.");
