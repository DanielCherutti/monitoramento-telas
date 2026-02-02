"use strict";
/**
 * Entrada CommonJS para gerar o executável com pkg.
 * Use: npm run build:exe
 */
// Log imediato para a janela não fechar “em branco” ao abrir
console.log("Agente de Monitoramento - Iniciando...");
function exitWithError(err) {
    console.error("");
    console.error("ERRO:", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack)
        console.error(err.stack);
    console.error("");
    console.error("Encerrando em 15 segundos... (leia a mensagem acima)");
    setTimeout(() => process.exit(1), 15000);
}
process.on("uncaughtException", (err) => {
    console.error("Falha inesperada (uncaughtException):");
    exitWithError(err);
});
process.on("unhandledRejection", (reason) => {
    console.error("Falha inesperada (unhandledRejection):");
    exitWithError(reason);
});
let screenshot;
try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    screenshot = require("screenshot-desktop");
}
catch (err) {
    console.error("Nao foi possivel carregar o modulo de captura de tela.");
    console.error("Se estiver usando o .exe, tente rodar com Node instalado: npm run dev");
    exitWithError(err);
    throw err;
}
const { run } = require("./main");
run(screenshot).catch((err) => {
    exitWithError(err);
});
