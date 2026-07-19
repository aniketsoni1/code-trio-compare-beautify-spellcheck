// Mocha entry point run inside the VS Code test host.
const path = require("node:path");
const Mocha = require("mocha");
const { glob } = require("glob");

async function run() {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 60000 });
  const testsRoot = __dirname;
  const files = await glob("**/*.test.cjs", { cwd: testsRoot });
  for (const file of files) mocha.addFile(path.resolve(testsRoot, file));

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) reject(new Error(`${failures} integration test(s) failed.`));
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { run };
