const petStage = document.getElementById("petStage");
const petCharacter = document.getElementById("petCharacter");
const sidebarButton = document.getElementById("sidebarButton");
const petBubble = document.getElementById("petBubble");
const petImage = document.getElementById("petImage");
const petFallback = document.getElementById("petFallback");
const petEffect = document.getElementById("petEffect");
const petEquipmentLayer = document.getElementById("petEquipmentLayer");

const petRuntime = {
  payload: null,
  lastReactionTick: 0,
  localBubbleTimer: null,
  idleTimer: null,
  blinkTimer: null,
  isDragging: false,
  movedDuringDrag: false,
  hoverFiredAt: 0,
  clickCount: 0,
  clickResetTimer: null,
  lastPointer: { x: 0, y: 0 },
  equipmentRenderToken: 0
};

const IDLE_LINES = [
  "I am on standby.",
  "Tiny but very committed.",
  "We can take this one step at a time.",
  "I am keeping an eye on today's progress."
];

function setStageState(nextState, nextMotion, nextExpression) {
  petStage.dataset.state = nextState || "idle";
  petStage.dataset.motion = nextMotion || "idle";
  petStage.dataset.expression = nextExpression || "smile";
}

function setPetImage(filePath, fallbackLetter) {
  petFallback.textContent = fallbackLetter;
  petStage.dataset.hasImage = filePath ? "true" : "false";
  if (!filePath) {
    petImage.hidden = true;
    petImage.removeAttribute("src");
    petFallback.hidden = false;
    return;
  }

  petImage.src = window.previewTools.filePathToUrl(filePath);
  petImage.hidden = false;
  petFallback.hidden = true;
}

async function resolveEquipmentSource(item) {
  const assetPath = item?.wearableLayerPath || item?.pixelImagePath;
  if (!assetPath) {
    return "";
  }

  if (item?.renderMode === "wearable-layer" && item?.wearableLayerPath) {
    return window.previewTools.filePathToUrl(item.wearableLayerPath);
  }

  try {
    const transparentAsset = await window.previewTools.createTransparentRewardAsset(assetPath);
    return transparentAsset.dataUrl;
  } catch {
    return window.previewTools.filePathToUrl(assetPath);
  }
}

async function renderEquipment(items = []) {
  const renderToken = ++petRuntime.equipmentRenderToken;
  petEquipmentLayer.innerHTML = "";
  if (!Array.isArray(items) || !items.length) {
    petStage.dataset.hasEquipment = "false";
    return;
  }

  const renderOrder = ["shoes", "bottom", "onepiece", "top", "outerwear", "headwear", "handheld"];
  const sortedItems = [...items].sort((left, right) => {
    const leftIndex = renderOrder.indexOf(left.slot);
    const rightIndex = renderOrder.indexOf(right.slot);
    return (leftIndex === -1 ? renderOrder.length : leftIndex) - (rightIndex === -1 ? renderOrder.length : rightIndex);
  });

  for (const item of sortedItems) {
    if (!item?.pixelImagePath) {
      continue;
    }

    const source = await resolveEquipmentSource(item);
    if (renderToken !== petRuntime.equipmentRenderToken) {
      return;
    }

    const image = document.createElement("img");
    image.className =
      item?.renderMode === "wearable-layer"
        ? `pet-equipment pet-equipment-layered pet-equipment-${item.slot || "misc"}`
        : `pet-equipment pet-equipment-${item.slot || "misc"}`;
    image.alt = "";
    image.src = source;
    image.loading = "eager";
    petEquipmentLayer.append(image);
  }

  petStage.dataset.hasEquipment = petEquipmentLayer.children.length ? "true" : "false";
}

petImage.addEventListener("error", () => {
  petStage.dataset.hasImage = "false";
  petImage.hidden = true;
  petImage.removeAttribute("src");
  petFallback.hidden = false;
});

function showBubble(text, holdMs = 2600) {
  petBubble.textContent = text;
  if (petRuntime.localBubbleTimer) {
    clearTimeout(petRuntime.localBubbleTimer);
  }

  petRuntime.localBubbleTimer = window.setTimeout(() => {
    if (!petRuntime.payload) {
      return;
    }
    petBubble.textContent =
      petRuntime.payload.userData.petProfile.bubbleText || "I am here and ready.";
  }, holdMs);
}

function scheduleBlink(config) {
  if (petRuntime.blinkTimer) {
    clearTimeout(petRuntime.blinkTimer);
  }

  if (!config.petPreferences.autoBlink) {
    return;
  }

  const delay = 2600 + Math.random() * 2600;
  petRuntime.blinkTimer = window.setTimeout(() => {
    if (petRuntime.isDragging) {
      scheduleBlink(config);
      return;
    }

    const previousExpression = petStage.dataset.expression;
    petStage.dataset.expression = "blink";
    window.setTimeout(() => {
      petStage.dataset.expression = previousExpression === "blink" ? "smile" : previousExpression;
    }, 160);
    scheduleBlink(config);
  }, delay);
}

function scheduleIdleBubble(config) {
  if (petRuntime.idleTimer) {
    clearTimeout(petRuntime.idleTimer);
  }

  const frequency = config.petPreferences.idleBubbleFrequency;
  const baseDelay =
    frequency === "high" ? 8000 : frequency === "low" ? 22000 : 14000;

  petRuntime.idleTimer = window.setTimeout(() => {
    if (!petRuntime.payload || petRuntime.isDragging) {
      scheduleIdleBubble(config);
      return;
    }

    if (petStage.dataset.state === "idle" || petStage.dataset.state === "ready-to-settle") {
      const nextLine = IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)];
      showBubble(nextLine, 2800);
    }

    if (config.petPreferences.autoNap && petStage.dataset.state === "idle" && Math.random() > 0.62) {
      setStageState("sleepy", "hover", "sleepy");
      showBubble("I am not asleep. I am only considering it.", 2600);
      window.setTimeout(() => {
        if (petStage.dataset.state === "sleepy") {
          setStageState("idle", "idle", "smile");
        }
      }, 2200);
    }

    scheduleIdleBubble(config);
  }, baseDelay + Math.random() * 5000);
}

function applyPayloadReaction(payload) {
  const petProfile = payload.userData.petProfile;
  setStageState(
    petProfile.interactionState || "idle",
    petProfile.motionState || "idle",
    petProfile.expressionOverlayState || "smile"
  );
  petEffect.dataset.mode = petProfile.interactionState || "idle";

  if (petProfile.reactionTick && petProfile.reactionTick !== petRuntime.lastReactionTick) {
    petRuntime.lastReactionTick = petProfile.reactionTick;
    showBubble(petProfile.bubbleText || "I am here.");
  } else if (!petRuntime.localBubbleTimer) {
    petBubble.textContent = petProfile.bubbleText || "I am here.";
  }

  const idleFallbackState =
    payload.summary.recommendedPetInteractionState === "ready-to-settle"
      ? ["ready-to-settle", "bob", "proud"]
      : ["idle", "idle", "smile"];

  const calmState = new Set(["reacting", "updated", "dragging", "fed", "dressed", "celebrating"]);
  if (calmState.has(petProfile.currentStatus)) {
    window.setTimeout(() => {
      if (!petRuntime.isDragging) {
        setStageState(...idleFallbackState);
      }
    }, 2000);
  }
}

function renderPet(payload) {
  petRuntime.payload = payload;
  const { userData, config } = payload;
  const petProfile = userData.petProfile;
  setPetImage(
    petProfile.basePetRenderPath || petProfile.currentCompositeImagePath || petProfile.currentPetImagePath,
    (petProfile.name || "P").slice(0, 1).toUpperCase()
  );
  renderEquipment(payload.summary.equippedItems || []);
  applyPayloadReaction(payload);
  scheduleBlink(config);
  scheduleIdleBubble(config);
}

async function sendTapReaction(kind) {
  try {
    await window.desktopPet.triggerPetReaction(kind === "pester" ? "pester" : "tap");
  } catch (error) {
    showBubble(error.message || "Reaction failed.");
  }
}

function resetClickCounter() {
  petRuntime.clickCount = 0;
  if (petRuntime.clickResetTimer) {
    clearTimeout(petRuntime.clickResetTimer);
  }
  petRuntime.clickResetTimer = window.setTimeout(() => {
    petRuntime.clickCount = 0;
  }, 700);
}

sidebarButton.addEventListener("click", () => {
  window.desktopPet.toggleSidebar();
});

petCharacter.addEventListener("mouseenter", async () => {
  const now = Date.now();
  if (now - petRuntime.hoverFiredAt < 2400) {
    return;
  }
  petRuntime.hoverFiredAt = now;
  setStageState("hovered", "hover", "smile");
  await window.desktopPet.triggerPetReaction("hover");
});

petCharacter.addEventListener("mouseleave", () => {
  if (!petRuntime.isDragging && petRuntime.payload) {
    const preferred = petRuntime.payload.summary.recommendedPetInteractionState;
    setStageState(
      preferred === "ready-to-settle" ? "ready-to-settle" : "idle",
      preferred === "ready-to-settle" ? "bob" : "idle",
      preferred === "ready-to-settle" ? "proud" : "smile"
    );
  }
});

petCharacter.addEventListener("click", async () => {
  if (petRuntime.isDragging || petRuntime.movedDuringDrag) {
    petRuntime.movedDuringDrag = false;
    return;
  }

  petRuntime.clickCount += 1;
  const kind = petRuntime.clickCount >= 3 ? "pester" : "tap";
  resetClickCounter();
  await sendTapReaction(kind);
});

petCharacter.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    await sendTapReaction("tap");
  }
});

petCharacter.addEventListener("pointerdown", async (event) => {
  event.preventDefault();
  petRuntime.isDragging = true;
  petRuntime.movedDuringDrag = false;
  petRuntime.lastPointer = { x: event.screenX, y: event.screenY };
  petCharacter.setPointerCapture(event.pointerId);
  setStageState("dragged", "drag", "surprised");
  await window.desktopPet.triggerPetReaction("drag-start");
});

petCharacter.addEventListener("pointermove", async (event) => {
  if (!petRuntime.isDragging) {
    return;
  }

  const deltaX = event.screenX - petRuntime.lastPointer.x;
  const deltaY = event.screenY - petRuntime.lastPointer.y;
  petRuntime.lastPointer = { x: event.screenX, y: event.screenY };
  if (deltaX || deltaY) {
    petRuntime.movedDuringDrag = true;
    await window.desktopPet.updatePetPosition(deltaX, deltaY);
  }
});

petCharacter.addEventListener("pointerup", async (event) => {
  if (!petRuntime.isDragging) {
    return;
  }

  petRuntime.isDragging = false;
  petCharacter.releasePointerCapture(event.pointerId);
  await window.desktopPet.triggerPetReaction("drag-end");
  window.setTimeout(() => {
    petRuntime.movedDuringDrag = false;
  }, 40);
});

window.desktopPet.readState().then(renderPet);
window.desktopPet.onStateChanged(renderPet);
