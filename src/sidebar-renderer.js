const sidebarState = {
  sourcePath: "",
  previewPath: ""
};

const sidebarElements = {
  petName: document.getElementById("petName"),
  petMood: document.getElementById("petMood"),
  petStatusText: document.getElementById("petStatusText"),
  equippedSummary: document.getElementById("equippedSummary"),
  petPreview: document.getElementById("petPreview"),
  petPreviewFallback: document.getElementById("petPreviewFallback"),
  openMainButton: document.getElementById("openMainButton"),
  openSettingsButton: document.getElementById("openSettingsButton"),
  uploadPetButton: document.getElementById("uploadPetButton"),
  taskProgress: document.getElementById("taskProgress"),
  taskList: document.getElementById("taskList"),
  openMainTasksButton: document.getElementById("openMainTasksButton"),
  settlementSummary: document.getElementById("settlementSummary"),
  previewModal: document.getElementById("previewModal"),
  modalSourcePreview: document.getElementById("modalSourcePreview"),
  modalGeneratedPreview: document.getElementById("modalGeneratedPreview"),
  modalMessage: document.getElementById("modalMessage"),
  cancelPreviewButton: document.getElementById("cancelPreviewButton"),
  confirmPreviewButton: document.getElementById("confirmPreviewButton")
};

function setImage(node, fallbackNode, filePath, fallbackText) {
  fallbackNode.textContent = fallbackText || "P";
  if (!filePath) {
    node.hidden = true;
    node.removeAttribute("src");
    fallbackNode.hidden = false;
    return;
  }

  node.src = window.previewTools.filePathToUrl(filePath);
  node.hidden = false;
  fallbackNode.hidden = true;
}

function openPreviewModal(message) {
  sidebarElements.modalMessage.textContent = message;
  sidebarElements.previewModal.classList.remove("hidden");
}

function closePreviewModal() {
  sidebarElements.previewModal.classList.add("hidden");
  sidebarState.sourcePath = "";
  sidebarState.previewPath = "";
  sidebarElements.modalSourcePreview.hidden = true;
  sidebarElements.modalGeneratedPreview.hidden = true;
  sidebarElements.modalSourcePreview.removeAttribute("src");
  sidebarElements.modalGeneratedPreview.removeAttribute("src");
  sidebarElements.confirmPreviewButton.disabled = true;
}

function renderTasks(summary) {
  sidebarElements.taskProgress.textContent = summary.progressLabel;
  sidebarElements.taskList.innerHTML = "";

  const visibleTasks = summary.unfinishedTasks.slice(0, 4);
  if (!visibleTasks.length) {
    const empty = document.createElement("div");
    empty.className = "task-row empty";
    empty.textContent = "No unfinished tasks right now.";
    sidebarElements.taskList.append(empty);
    return;
  }

  for (const task of visibleTasks) {
    const row = document.createElement("label");
    row.className = "task-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.addEventListener("change", () => {
      window.desktopPet.toggleDailyTask(task.id, checkbox.checked);
    });
    const title = document.createElement("span");
    title.textContent = task.title;
    row.append(checkbox, title);
    sidebarElements.taskList.append(row);
  }

  if (summary.unfinishedTasks.length > visibleTasks.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "ghost-button";
    more.textContent = `${summary.unfinishedTasks.length - visibleTasks.length} more task(s)`;
    more.addEventListener("click", () => window.desktopPet.openMainWindow("today"));
    sidebarElements.taskList.append(more);
  }
}

function renderSidebar(payload) {
  const petProfile = payload.userData.petProfile;
  const fallbackLetter = (petProfile.name || "P").slice(0, 1).toUpperCase();
  sidebarElements.petName.textContent = petProfile.name || "Pet";
  sidebarElements.petMood.textContent = petProfile.mood || "Idle";
  sidebarElements.petStatusText.textContent = petProfile.bubbleText || "I am here.";
  sidebarElements.settlementSummary.textContent = payload.summary.settlementSummary;
  sidebarElements.equippedSummary.textContent = payload.summary.equippedItems.length
    ? `Equipped: ${payload.summary.equippedItems.map((item) => item.name).join(" / ")}`
    : "Equipped: base look";
  setImage(
    sidebarElements.petPreview,
    sidebarElements.petPreviewFallback,
    petProfile.basePetRenderPath || petProfile.currentCompositeImagePath || petProfile.currentPetImagePath,
    fallbackLetter
  );
  renderTasks(payload.summary);
}

async function generatePetPreview(sourcePath) {
  const config = await window.desktopPet.readConfig();
  if (config.providerMode === "local") {
    const generatedDataUrl = await window.previewTools.generateLocalChibiPreview(sourcePath);
    return (await window.desktopPet.saveGeneratedDataUrl(generatedDataUrl)).filePath;
  }

  return (await window.desktopPet.generatePixelPreview(sourcePath, "pet-chibi")).filePath;
}

async function handleUploadPet() {
  const selected = await window.desktopPet.selectSourceImage("Choose a character reference");
  if (!selected) {
    return;
  }

  sidebarState.sourcePath = selected.filePath;
  sidebarElements.modalSourcePreview.src = window.previewTools.filePathToUrl(selected.filePath);
  sidebarElements.modalSourcePreview.hidden = false;
  sidebarElements.modalGeneratedPreview.hidden = true;
  sidebarElements.confirmPreviewButton.disabled = true;
  openPreviewModal("Generating a chibi desktop pet preview...");

  try {
    const previewPath = await generatePetPreview(selected.filePath);
    sidebarState.previewPath = previewPath;
    sidebarElements.modalGeneratedPreview.src = window.previewTools.filePathToUrl(previewPath);
    sidebarElements.modalGeneratedPreview.hidden = false;
    sidebarElements.modalMessage.textContent = "Preview ready. Confirm to replace the current pet.";
    sidebarElements.confirmPreviewButton.disabled = false;
  } catch (error) {
    sidebarElements.modalMessage.textContent = error.message || "Preview generation failed.";
  }
}

sidebarElements.openMainButton.addEventListener("click", () => {
  window.desktopPet.openMainWindow("today");
});
sidebarElements.openSettingsButton.addEventListener("click", () => {
  window.desktopPet.openMainWindow("settings");
});
sidebarElements.openMainTasksButton.addEventListener("click", () => {
  window.desktopPet.openMainWindow("today");
});
sidebarElements.uploadPetButton.addEventListener("click", handleUploadPet);
sidebarElements.cancelPreviewButton.addEventListener("click", closePreviewModal);
sidebarElements.confirmPreviewButton.addEventListener("click", async () => {
  if (!sidebarState.previewPath) {
    return;
  }
  await window.desktopPet.confirmPetPreview(sidebarState.sourcePath, sidebarState.previewPath);
  closePreviewModal();
});

window.desktopPet.readState().then(renderSidebar);
window.desktopPet.onStateChanged(renderSidebar);
