const appState = {
  payload: null,
  activeTab: "today",
  warehouseFilter: "all",
  rewardDraft: {
    sourcePath: "",
    previewPath: ""
  },
  petDraft: {
    sourcePath: "",
    previewPath: ""
  }
};

const dom = {
  headerPetName: document.getElementById("headerPetName"),
  headerBubble: document.getElementById("headerBubble"),
  currencyBalance: document.getElementById("currencyBalance"),
  headerExportButton: document.getElementById("headerExportButton"),
  showSidebarButton: document.getElementById("showSidebarButton"),
  tabButtons: [...document.querySelectorAll(".tab-button")],
  tabPanels: [...document.querySelectorAll(".tab-panel")],
  todayProgress: document.getElementById("todayProgress"),
  taskForm: document.getElementById("taskForm"),
  taskInput: document.getElementById("taskInput"),
  todayTaskList: document.getElementById("todayTaskList"),
  todayRewardCard: document.getElementById("todayRewardCard"),
  todaySettlementSummary: document.getElementById("todaySettlementSummary"),
  settleButton: document.getElementById("settleButton"),
  openPetModalButton: document.getElementById("openPetModalButton"),
  currentPetPreview: document.getElementById("currentPetPreview"),
  currentPetPreviewPlaceholder: document.getElementById("currentPetPreviewPlaceholder"),
  latestPetPreview: document.getElementById("latestPetPreview"),
  latestPetPreviewPlaceholder: document.getElementById("latestPetPreviewPlaceholder"),
  petPreviewMessage: document.getElementById("petPreviewMessage"),
  warehouseFilters: [...document.querySelectorAll(".filter-chip")],
  warehouseGrid: document.getElementById("warehouseGrid"),
  openRewardModalButton: document.getElementById("openRewardModalButton"),
  rewardModal: document.getElementById("rewardModal"),
  rewardForm: document.getElementById("rewardForm"),
  rewardNameInput: document.getElementById("rewardNameInput"),
  rewardTypeInput: document.getElementById("rewardTypeInput"),
  pickRewardImageButton: document.getElementById("pickRewardImageButton"),
  rewardSourcePreview: document.getElementById("rewardSourcePreview"),
  rewardGeneratedPreview: document.getElementById("rewardGeneratedPreview"),
  rewardModalMessage: document.getElementById("rewardModalMessage"),
  closeRewardModalButton: document.getElementById("closeRewardModalButton"),
  confirmRewardButton: document.getElementById("confirmRewardButton"),
  petModal: document.getElementById("petModal"),
  pickPetImageButton: document.getElementById("pickPetImageButton"),
  petSourcePreview: document.getElementById("petSourcePreview"),
  petGeneratedPreview: document.getElementById("petGeneratedPreview"),
  petModalMessage: document.getElementById("petModalMessage"),
  closePetModalButton: document.getElementById("closePetModalButton"),
  confirmPetButton: document.getElementById("confirmPetButton"),
  outfitForm: document.getElementById("outfitForm"),
  outfitNameInput: document.getElementById("outfitNameInput"),
  outfitItemPicker: document.getElementById("outfitItemPicker"),
  outfitList: document.getElementById("outfitList"),
  providerModeInput: document.getElementById("providerModeInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  baseUrlInput: document.getElementById("baseUrlInput"),
  modelInput: document.getElementById("modelInput"),
  endpointModeInput: document.getElementById("endpointModeInput"),
  styleModeInput: document.getElementById("styleModeInput"),
  interactionLevelInput: document.getElementById("interactionLevelInput"),
  idleBubbleFrequencyInput: document.getElementById("idleBubbleFrequencyInput"),
  autoBlinkInput: document.getElementById("autoBlinkInput"),
  autoNapInput: document.getElementById("autoNapInput"),
  configStatus: document.getElementById("configStatus"),
  saveConfigButton: document.getElementById("saveConfigButton"),
  exportPreviewButton: document.getElementById("exportPreviewButton"),
  settingsMessage: document.getElementById("settingsMessage")
};

const SLOT_LABELS = {
  top: "Top",
  bottom: "Bottom",
  outerwear: "Outerwear",
  onepiece: "Onepiece",
  shoes: "Shoes",
  headwear: "Headwear",
  handheld: "Handheld",
  food: "Food"
};

function setMessage(text) {
  dom.settingsMessage.textContent = text || "";
}

function setImageOrPlaceholder(imageNode, placeholderNode, filePath, fallbackText) {
  placeholderNode.textContent = fallbackText || "?";
  if (!filePath) {
    imageNode.hidden = true;
    imageNode.removeAttribute("src");
    placeholderNode.hidden = false;
    return;
  }

  imageNode.src = window.previewTools.filePathToUrl(filePath);
  imageNode.hidden = false;
  placeholderNode.hidden = true;
}

function setTab(nextTab) {
  appState.activeTab = nextTab;
  for (const button of dom.tabButtons) {
    button.classList.toggle("active", button.dataset.tab === nextTab);
  }
  for (const panel of dom.tabPanels) {
    panel.classList.toggle("active", panel.dataset.panel === nextTab);
  }
}

function computeHasConfig(config) {
  if (config.providerMode === "local") {
    return true;
  }
  return Boolean(config.openAIApiKey) && Boolean(config.baseUrl) && Boolean(config.model);
}

function syncProviderUi() {
  const remoteOnly = dom.providerModeInput.value !== "local";
  const imagesOnly = dom.providerModeInput.value === "remote-openai-images";
  dom.apiKeyInput.disabled = !remoteOnly;
  dom.baseUrlInput.disabled = !remoteOnly;
  dom.modelInput.disabled = !remoteOnly;
  dom.endpointModeInput.disabled = !imagesOnly;
}

function updateConfigStatus(config) {
  const ready = computeHasConfig(config);
  dom.configStatus.textContent = ready ? "Config Ready" : "Config Missing";
  dom.configStatus.className = `status-pill ${ready ? "" : "muted"}`.trim();
}

function renderHeader(payload) {
  const petProfile = payload.userData.petProfile;
  dom.headerPetName.textContent = petProfile.name || "Pet";
  dom.headerBubble.textContent = petProfile.bubbleText || "I am here.";
  dom.currencyBalance.textContent = `${payload.userData.currencyAccount.balance || 0}`;
  setImageOrPlaceholder(
    dom.currentPetPreview,
    dom.currentPetPreviewPlaceholder,
    petProfile.basePetRenderPath || petProfile.currentCompositeImagePath || petProfile.currentPetImagePath,
    (petProfile.name || "P").slice(0, 1).toUpperCase()
  );
  setImageOrPlaceholder(
    dom.latestPetPreview,
    dom.latestPetPreviewPlaceholder,
    appState.petDraft.previewPath,
    "?"
  );
  dom.petPreviewMessage.textContent = appState.petDraft.previewPath
    ? "Latest generated pet preview is ready to confirm or export."
    : "Generate a pet preview here, then confirm or export it.";
}

function renderToday(summary, userData) {
  dom.todayProgress.textContent = summary.progressLabel;
  dom.todaySettlementSummary.textContent = summary.settlementSummary;
  dom.todayTaskList.innerHTML = "";

  for (const task of summary.tasks) {
    const label = document.createElement("label");
    label.className = `task-row ${task.completed ? "completed" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.addEventListener("change", () => {
      window.desktopPet.toggleDailyTask(task.id, checkbox.checked);
    });
    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;
    label.append(checkbox, title);
    dom.todayTaskList.append(label);
  }

  if (!summary.tasks.length) {
    dom.todayTaskList.innerHTML = '<div class="task-row"><span class="empty-copy">No tasks yet.</span></div>';
  }

  const rewardSelection = summary.dailyRewardSelection;
  const rewardTarget = summary.resolvedRewardTarget;

  if (!rewardSelection.targetType || !rewardTarget) {
    dom.todayRewardCard.className = "reward-highlight empty";
    dom.todayRewardCard.innerHTML = "<p>No reward target set for today.</p>";
  } else if (rewardSelection.targetType === "set") {
    const ownedCount = rewardTarget.itemIds.filter((itemId) =>
      userData.rewardLibrary.some((item) => item.id === itemId && item.status === "owned")
    ).length;
    dom.todayRewardCard.className = "reward-highlight";
    dom.todayRewardCard.innerHTML = `
      <strong>${rewardTarget.name}</strong>
      <p class="reward-detail">Type: outfit reward</p>
      <p class="reward-detail">Owned progress: ${ownedCount}/${rewardTarget.itemIds.length}</p>
    `;
  } else {
    dom.todayRewardCard.className = "reward-highlight";
    dom.todayRewardCard.innerHTML = `
      <strong>${rewardTarget.name}</strong>
      <p class="reward-detail">Type: ${SLOT_LABELS[rewardTarget.slot] || rewardTarget.slot}</p>
      <p class="reward-detail">Status: ${rewardTarget.status === "owned" ? "Owned" : "Candidate"}</p>
    `;
  }

  dom.settleButton.disabled = !summary.allTasksCompleted;
}

function createRewardImage(item) {
  if (item.pixelImagePath) {
    const img = document.createElement("img");
    img.className = "reward-image";
    img.src = window.previewTools.filePathToUrl(item.pixelImagePath);
    img.alt = item.name;
    return img;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "reward-image placeholder";
  placeholder.textContent = item.name.slice(0, 1).toUpperCase();
  return placeholder;
}

function renderWarehouse(payload) {
  const equippedIds = new Set(payload.userData.petProfile.equippedItemIds || []);
  const items = payload.userData.rewardLibrary.filter((item) => {
    if (appState.warehouseFilter === "all") {
      return true;
    }
    return item.slot === appState.warehouseFilter;
  });

  dom.warehouseGrid.innerHTML = "";
  if (!items.length) {
    dom.warehouseGrid.innerHTML =
      '<div class="reward-card"><p class="empty-copy">Nothing in this category yet.</p></div>';
    return;
  }

  const currentSelection = payload.summary.dailyRewardSelection;
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "reward-card";
    card.append(createRewardImage(item));

    const title = document.createElement("strong");
    title.textContent = item.name;
    card.append(title);

    const meta = document.createElement("p");
    meta.className = "item-meta";
    meta.textContent = `${SLOT_LABELS[item.slot] || item.slot} · ${
      item.status === "owned" ? "Owned" : "Candidate"
    }`;
    card.append(meta);

    const actionRow = document.createElement("div");
    actionRow.className = "reward-actions";

    const rewardButton = document.createElement("button");
    rewardButton.className = "secondary-button";
    rewardButton.type = "button";
    rewardButton.textContent =
      currentSelection.targetType === "item" && currentSelection.targetId === item.id
        ? "Selected for today"
        : "Set as today reward";
    rewardButton.disabled =
      currentSelection.targetType === "item" && currentSelection.targetId === item.id;
    rewardButton.addEventListener("click", () => {
      window.desktopPet.setTodayReward("item", item.id);
    });
    actionRow.append(rewardButton);

    if (item.status === "owned" && item.type === "wearable") {
      const isEquipped = equippedIds.has(item.id);
      const equipButton = document.createElement("button");
      equipButton.className = "primary-button";
      equipButton.type = "button";
      equipButton.textContent = isEquipped ? "Unequip" : "Equip";
      equipButton.addEventListener("click", () =>
        isEquipped ? window.desktopPet.unequipItem(item.id) : window.desktopPet.equipItem(item.id)
      );
      actionRow.append(equipButton);
    }

    if (item.status === "owned" && item.type === "food") {
      const useButton = document.createElement("button");
      useButton.className = "primary-button";
      useButton.type = "button";
      useButton.textContent = "Use";
      useButton.addEventListener("click", () => window.desktopPet.useReward(item.id));
      actionRow.append(useButton);
    }

    card.append(actionRow);
    dom.warehouseGrid.append(card);
  }
}

function renderOutfitPicker(payload) {
  dom.outfitItemPicker.innerHTML = "";
  const wearableItems = payload.userData.rewardLibrary.filter((item) => item.type === "wearable");

  if (!wearableItems.length) {
    dom.outfitItemPicker.innerHTML =
      '<div class="picker-item"><span class="empty-copy">Add wearable items to the warehouse first.</span></div>';
    return;
  }

  for (const item of wearableItems) {
    const label = document.createElement("label");
    label.className = "picker-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = item.id;
    checkbox.name = "outfitItems";
    const content = document.createElement("div");
    content.innerHTML = `<strong>${item.name}</strong><p class="item-meta">${
      SLOT_LABELS[item.slot]
    } · ${item.status === "owned" ? "Owned" : "Candidate"}</p>`;
    label.append(checkbox, content);
    dom.outfitItemPicker.append(label);
  }
}

function renderOutfitList(payload) {
  dom.outfitList.innerHTML = "";
  const { outfitSets, rewardLibrary } = payload.userData;
  const selection = payload.summary.dailyRewardSelection;

  if (!outfitSets.length) {
    dom.outfitList.innerHTML =
      '<div class="outfit-card"><p class="empty-copy">No outfit sets yet.</p></div>';
    return;
  }

  for (const outfit of outfitSets) {
    const ownedCount = outfit.itemIds.filter((itemId) =>
      rewardLibrary.some((item) => item.id === itemId && item.status === "owned")
    ).length;
    const names = outfit.itemIds
      .map((itemId) => rewardLibrary.find((item) => item.id === itemId)?.name)
      .filter(Boolean);

    const card = document.createElement("article");
    card.className = "outfit-card";
    card.innerHTML = `
      <div class="outfit-title-row">
        <strong>${outfit.name}</strong>
        <span class="status-pill muted">${ownedCount}/${outfit.itemIds.length}</span>
      </div>
      <p class="item-meta">${names.join(" / ") || "No members yet"}</p>
    `;

    const actions = document.createElement("div");
    actions.className = "outfit-actions";

    const wearButton = document.createElement("button");
    wearButton.className = "primary-button";
    wearButton.type = "button";
    wearButton.textContent = "Wear outfit";
    wearButton.addEventListener("click", () => window.desktopPet.equipSet(outfit.id));
    actions.append(wearButton);

    const rewardButton = document.createElement("button");
    rewardButton.className = "secondary-button";
    rewardButton.type = "button";
    rewardButton.textContent =
      selection.targetType === "set" && selection.targetId === outfit.id
        ? "Selected for today"
        : "Set as today reward";
    rewardButton.disabled = selection.targetType === "set" && selection.targetId === outfit.id;
    rewardButton.addEventListener("click", () => window.desktopPet.setTodayReward("set", outfit.id));
    actions.append(rewardButton);

    card.append(actions);
    dom.outfitList.append(card);
  }
}

function renderSettings(config) {
  const preferences = config.petPreferences || {};
  dom.providerModeInput.value = config.providerMode || "local";
  dom.apiKeyInput.value = config.openAIApiKey || "";
  dom.baseUrlInput.value = config.baseUrl || "";
  dom.modelInput.value = config.model || "";
  dom.endpointModeInput.value = config.endpointMode || "edits";
  dom.styleModeInput.value = preferences.styleMode || "chibi";
  dom.interactionLevelInput.value = preferences.interactionLevel || "strong";
  dom.idleBubbleFrequencyInput.value = preferences.idleBubbleFrequency || "normal";
  dom.autoBlinkInput.checked = preferences.autoBlink !== false;
  dom.autoNapInput.checked = preferences.autoNap !== false;
  syncProviderUi();
  updateConfigStatus(config);
}

function renderAll(payload) {
  appState.payload = payload;
  renderHeader(payload);
  renderToday(payload.summary, payload.userData);
  renderWarehouse(payload);
  renderOutfitPicker(payload);
  renderOutfitList(payload);
  renderSettings(payload.config);
}

function openRewardModal() {
  dom.rewardModal.classList.remove("hidden");
  dom.rewardModalMessage.textContent = "";
}

function closeRewardModal() {
  dom.rewardModal.classList.add("hidden");
  appState.rewardDraft = { sourcePath: "", previewPath: "" };
  dom.rewardNameInput.value = "";
  dom.rewardTypeInput.value = "top";
  dom.rewardSourcePreview.hidden = true;
  dom.rewardGeneratedPreview.hidden = true;
  dom.rewardSourcePreview.removeAttribute("src");
  dom.rewardGeneratedPreview.removeAttribute("src");
  dom.confirmRewardButton.disabled = true;
}

function openPetModal() {
  dom.petModal.classList.remove("hidden");
  dom.petModalMessage.textContent = appState.petDraft.previewPath
    ? "Latest preview loaded. Confirm to replace the current pet."
    : "";
  dom.confirmPetButton.disabled = !appState.petDraft.previewPath;
}

function closePetModal() {
  dom.petModal.classList.add("hidden");
}

async function generatePetPreview(sourcePath) {
  const config = await window.desktopPet.readConfig();
  let rawSource;
  if (config.providerMode === "local") {
    rawSource = await window.previewTools.generateLocalChibiPreview(sourcePath);
  } else {
    rawSource = (await window.desktopPet.generatePixelPreview(sourcePath, "pet-chibi")).filePath;
  }

  const transparentAsset = await window.previewTools.createTransparentPetAsset(rawSource);
  return (await window.desktopPet.saveGeneratedDataUrl(transparentAsset.dataUrl)).filePath;
}

async function generateRewardPreview(sourcePath) {
  const config = await window.desktopPet.readConfig();
  let rawSource;
  if (config.providerMode === "local") {
    rawSource = await window.previewTools.generateLocalPixelPreview(sourcePath);
  } else {
    rawSource = (await window.desktopPet.generatePixelPreview(sourcePath, "reward-item")).filePath;
  }

  const transparentAsset = await window.previewTools.createTransparentRewardAsset(rawSource);
  return (await window.desktopPet.saveGeneratedDataUrl(transparentAsset.dataUrl)).filePath;
}

async function handleRewardImagePick() {
  const rewardName = dom.rewardNameInput.value.trim();
  if (!rewardName) {
    dom.rewardModalMessage.textContent = "Give the reward a name first.";
    return;
  }

  const selected = await window.desktopPet.selectSourceImage("Choose a reward reference image");
  if (!selected) {
    return;
  }

  appState.rewardDraft.sourcePath = selected.filePath;
  dom.rewardSourcePreview.src = window.previewTools.filePathToUrl(selected.filePath);
  dom.rewardSourcePreview.hidden = false;
  dom.rewardGeneratedPreview.hidden = true;
  dom.confirmRewardButton.disabled = true;
  dom.rewardModalMessage.textContent = "Generating preview...";

  try {
    const previewPath = await generateRewardPreview(selected.filePath);
    appState.rewardDraft.previewPath = previewPath;
    dom.rewardGeneratedPreview.src = window.previewTools.filePathToUrl(previewPath);
    dom.rewardGeneratedPreview.hidden = false;
    dom.rewardModalMessage.textContent = "Preview ready. Confirm to add it to the reward library.";
    dom.confirmRewardButton.disabled = false;
  } catch (error) {
    dom.rewardModalMessage.textContent = error.message || "Reward preview generation failed.";
  }
}

async function handlePetImagePick() {
  const selected = await window.desktopPet.selectSourceImage("Choose a character reference");
  if (!selected) {
    return;
  }

  appState.petDraft.sourcePath = selected.filePath;
  dom.petSourcePreview.src = window.previewTools.filePathToUrl(selected.filePath);
  dom.petSourcePreview.hidden = false;
  dom.petGeneratedPreview.hidden = true;
  dom.confirmPetButton.disabled = true;
  dom.petModalMessage.textContent = "Generating pet preview...";
  openPetModal();

  try {
    const previewPath = await generatePetPreview(selected.filePath);
    appState.petDraft.previewPath = previewPath;
    dom.petGeneratedPreview.src = window.previewTools.filePathToUrl(previewPath);
    dom.petGeneratedPreview.hidden = false;
    dom.petModalMessage.textContent = "Preview ready. Confirm to replace the current pet.";
    dom.confirmPetButton.disabled = false;
    if (appState.payload) {
      renderHeader(appState.payload);
    }
  } catch (error) {
    dom.petModalMessage.textContent = error.message || "Pet preview generation failed.";
  }
}

dom.tabButtons.forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});

dom.showSidebarButton.addEventListener("click", () => window.desktopPet.toggleSidebar());
dom.headerExportButton.addEventListener("click", async () => {
  dom.exportPreviewButton.click();
});

dom.taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = dom.taskInput.value.trim();
  if (!title) {
    return;
  }
  await window.desktopPet.createDailyTask(title);
  dom.taskInput.value = "";
});

dom.settleButton.addEventListener("click", () => window.desktopPet.settleToday());

dom.warehouseFilters.forEach((button) => {
  button.addEventListener("click", () => {
    appState.warehouseFilter = button.dataset.filter;
    dom.warehouseFilters.forEach((entry) => {
      entry.classList.toggle("active", entry === button);
    });
    if (appState.payload) {
      renderWarehouse(appState.payload);
    }
  });
});

dom.openRewardModalButton.addEventListener("click", openRewardModal);
dom.closeRewardModalButton.addEventListener("click", closeRewardModal);
dom.pickRewardImageButton.addEventListener("click", handleRewardImagePick);
dom.openPetModalButton.addEventListener("click", openPetModal);
dom.pickPetImageButton.addEventListener("click", handlePetImagePick);
dom.closePetModalButton.addEventListener("click", closePetModal);
dom.confirmPetButton.addEventListener("click", async () => {
  if (!appState.petDraft.previewPath) {
    return;
  }
  const baseWearableSlots = ["top", "bottom", "shoes"];
  const initialWearables = [];

  for (const slot of baseWearableSlots) {
    const wearableLayerAsset = await window.previewTools.createWearableLayerAsset(
      appState.petDraft.previewPath,
      slot
    );
    const wearableLayerPath = (
      await window.desktopPet.saveGeneratedDataUrl(wearableLayerAsset.dataUrl)
    ).filePath;

    initialWearables.push({
      name: `Initial ${SLOT_LABELS[slot] || slot}`,
      slot,
      pixelImagePath: wearableLayerPath,
      wearableLayerPath,
      renderMode: "wearable-layer"
    });
  }

  await window.desktopPet.confirmPetPreview(
    appState.petDraft.sourcePath,
    appState.petDraft.previewPath,
    { initialWearables }
  );
  dom.petModalMessage.textContent = "Pet preview confirmed.";
  closePetModal();
});

dom.rewardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!appState.rewardDraft.previewPath) {
    return;
  }
  const itemType = dom.rewardTypeInput.value;
  let wearableLayerPath = "";
  if (itemType !== "food") {
    const wearableLayerAsset = await window.previewTools.createWearableLayerAsset(
      appState.rewardDraft.previewPath,
      itemType
    );
    wearableLayerPath = (
      await window.desktopPet.saveGeneratedDataUrl(wearableLayerAsset.dataUrl)
    ).filePath;
  }
  await window.desktopPet.confirmRewardPreview({
    sourcePath: appState.rewardDraft.sourcePath,
    previewPath: appState.rewardDraft.previewPath,
    wearableLayerPath,
    itemType,
    itemName: dom.rewardNameInput.value.trim()
  });
  closeRewardModal();
  setTab("warehouse");
});

dom.outfitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = dom.outfitNameInput.value.trim();
  const selectedIds = [...document.querySelectorAll('input[name="outfitItems"]:checked')].map(
    (input) => input.value
  );
  if (!name || !selectedIds.length) {
    return;
  }
  await window.desktopPet.createOutfitSet(name, selectedIds);
  dom.outfitNameInput.value = "";
  document
    .querySelectorAll('input[name="outfitItems"]:checked')
    .forEach((input) => (input.checked = false));
});

dom.providerModeInput.addEventListener("change", syncProviderUi);

dom.saveConfigButton.addEventListener("click", async () => {
  const config = await window.desktopPet.saveConfig({
    providerMode: dom.providerModeInput.value,
    openAIApiKey: dom.apiKeyInput.value.trim(),
    baseUrl: dom.baseUrlInput.value.trim(),
    model: dom.modelInput.value.trim(),
    endpointMode: dom.endpointModeInput.value,
    petPreferences: {
      styleMode: dom.styleModeInput.value,
      interactionLevel: dom.interactionLevelInput.value,
      idleBubbleFrequency: dom.idleBubbleFrequencyInput.value,
      autoBlink: dom.autoBlinkInput.checked,
      autoNap: dom.autoNapInput.checked
    }
  });
  renderSettings(config);
  setMessage("Settings saved locally.");
});

dom.exportPreviewButton.addEventListener("click", async () => {
  const currentPath =
    appState.petDraft.previewPath ||
    appState.payload?.userData.petProfile.basePetRenderPath ||
    appState.payload?.userData.petProfile.currentCompositeImagePath ||
    appState.rewardDraft.previewPath;

  if (!currentPath) {
    setMessage("There is no preview to export yet.");
    return;
  }

  const result = await window.desktopPet.exportGeneratedPreview(currentPath);
  setMessage(result?.filePath ? `Exported to ${result.filePath}` : "Export canceled.");
});

window.desktopPet.readState().then(renderAll);
window.desktopPet.onStateChanged(renderAll);
window.desktopPet.onMainNavigate((payload) => {
  if (payload?.tab) {
    setTab(payload.tab);
  }
});
