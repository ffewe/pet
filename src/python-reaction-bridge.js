const path = require("node:path");
const { spawn } = require("node:child_process");

const PYTHON_REACTION_ENGINE_PATH = path.join(__dirname, "..", "scripts", "pet_reaction_engine.py");

const PYTHON_DRIVEN_EVENTS = new Set([
  "tap",
  "drag-start",
  "drag-end",
  "fed",
  "reward-targeted",
  "pet-preview-confirmed",
  "task-complete",
  "task-reopen",
  "dressed",
  "undressed",
  "settled"
]);

function runPythonPetReaction(eventType, meta = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [PYTHON_REACTION_ENGINE_PATH], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python reaction engine exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout || "{}");
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.write(JSON.stringify({ eventType, meta }));
    child.stdin.end();
  });
}

async function applyPythonReactionOrFallback(state, eventType, meta, setPetReaction, applyPetEvent) {
  if (!PYTHON_DRIVEN_EVENTS.has(eventType)) {
    applyPetEvent(state, eventType, meta);
    return;
  }

  try {
    const reaction = await runPythonPetReaction(eventType, meta);
    setPetReaction(state, reaction);
  } catch (_error) {
    applyPetEvent(state, eventType, meta);
  }
}

module.exports = {
  PYTHON_DRIVEN_EVENTS,
  runPythonPetReaction,
  applyPythonReactionOrFallback
};
