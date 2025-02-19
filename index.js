// index.js

const { exec } = require("child_process");

// Función para ejecutar un script
function executeScript(script) {
  return new Promise((resolve, reject) => {
    exec(`node ${script}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error al ejecutar ${script}: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`Error de stderr al ejecutar ${script}: ${stderr}`);
        return reject(stderr);
      }
      console.log(`Salida de ${script}: ${stdout}`);
      resolve(stdout);
    });
  });
}

// Ejecutar los scripts en secuencia
async function runScripts() {
  try {
    await executeScript("APIService_s1.js");
    await executeScript("APIService_s2.js");
    await executeScript("APIService_s3.js");
    console.log("Todos los scripts se ejecutaron correctamente.");
  } catch (error) {
    console.error("Ocurrió un error al ejecutar los scripts.");
  }
}

// Ejecutar la función principal
runScripts();
