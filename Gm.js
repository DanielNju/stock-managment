document.addEventListener("DOMContentLoaded", function () {
  /************************************************************
   * DOM REFERENCES (updated)
   ************************************************************/
  const uploadSelect   = document.getElementById("upload");
  const imageContainer = document.getElementById("image_container");
  const imageInput     = document.getElementById("image_upload");
  const cameraInput    = document.getElementById("camera_capture");   // new hidden camera input
  const takePhotoBtn   = document.getElementById("take_photo_btn");   // button to trigger camera
  const previewsContainer = document.getElementById("image_previews"); // new preview container
  const oldPreview     = document.getElementById("image_preview");    // keep for backward compatibility
  const loader         = document.getElementById("loader");
  const resultTable    = document.getElementById("result_table");
  const tableSection   = document.getElementById("table_section");
  const tbody          = resultTable.querySelector("tbody");
  const uploadForm     = document.getElementById("upload_form");

  const approveBtn     = document.getElementById("approve_btn");
  const reviewWarning  = document.getElementById("review_warning");

  const reviewModeBtn  = document.getElementById("review_mode_btn");
  const addRowBtn      = document.getElementById("add_row_btn");

  // DROPPED candidates
  const droppedSection = document.getElementById("dropped_section");
  const droppedList    = document.getElementById("dropped_list");
  const toggleDroppedBtn = document.getElementById("toggle_dropped_btn");

  // Manual entry button (NEW)
  const manualEntryBtn = document.getElementById("manual_entry_btn");

  /************************************************************
   * Enable multiple file selection
   ************************************************************/
  imageInput.multiple = true;   // now you can select several images at once

  /************************************************************
 * Enable multiple file selection (mobile-safe)
 ************************************************************/
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
imageInput.multiple = !IS_MOBILE; // mobile: safer single file

/************************************************************
 * STATE: processed files (small) - use these for upload
 ************************************************************/
let processedPickerFiles = [];
let processedCameraFiles = [];

/************************************************************
 * Camera modal elements (+ TORCH)
 ************************************************************/
const cameraModal   = document.getElementById("camera_modal");
const camVideo      = document.getElementById("cam_video");
const camCanvas     = document.getElementById("cam_canvas");
const camCaptureBtn = document.getElementById("cam_capture_btn");
const camCloseBtn   = document.getElementById("cam_close_btn");
const camTorchBtn   = document.getElementById("cam_torch_btn"); // <-- add in HTML modal

let camStream = null;
let camTrack = null;
let torchSupported = false;
let torchOn = false;

/************************************************************
 * Start / Stop camera stream (controlled capture = no huge files)
 ************************************************************/
async function openCameraModal() {
  // If modal missing, fallback to file input (older path)
  if (!cameraModal || !camVideo) {
    if (cameraInput) cameraInput.click();
    return;
  }

  cameraModal.style.display = "flex";

  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width:  { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    camVideo.srcObject = camStream;
    await camVideo.play();

    camTrack = camStream.getVideoTracks()[0];

    // Detect torch support (mostly Android Chrome)
    torchSupported = false;
    torchOn = false;

    try {
      const caps = camTrack.getCapabilities ? camTrack.getCapabilities() : {};
      if (caps && ("torch" in caps)) torchSupported = true;
    } catch {}

    if (camTorchBtn) {
      if (torchSupported) {
        camTorchBtn.style.display = "inline-block";
        camTorchBtn.textContent = "🔦 Torch: Off";
      } else {
        camTorchBtn.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Camera open failed:", err);
    cameraModal.style.display = "none";
    if (cameraInput) cameraInput.click();
  }
}

function closeCameraModal() {
  // turn off torch on close
  if (camTrack && torchSupported && torchOn) {
    camTrack.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
  }
  torchOn = false;

  if (camVideo) camVideo.pause();

  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }

  camTrack = null;

  if (camVideo) camVideo.srcObject = null;
  if (cameraModal) cameraModal.style.display = "none";
}

async function toggleTorch() {
  if (!camTrack || !torchSupported) return;
  torchOn = !torchOn;

  try {
    await camTrack.applyConstraints({ advanced: [{ torch: torchOn }] });
    if (camTorchBtn) camTorchBtn.textContent = torchOn ? "🔦 Torch: On" : "🔦 Torch: Off";
  } catch (e) {
    console.warn("Torch toggle failed:", e);
    torchOn = false;
    if (camTorchBtn) camTorchBtn.textContent = "🔦 Torch: Off";
  }
}

/************************************************************
 * Convert captured frame -> resized JPEG File
 ************************************************************/
async function captureFrameAsFile() {
  if (!camVideo || !camCanvas) return null;

  // Target size (reduce for very weak phones)
  const MAX_W = IS_MOBILE ? 1280 : 1600;

  const vw = camVideo.videoWidth || 1280;
  const vh = camVideo.videoHeight || 720;

  const scale = Math.min(MAX_W / vw, 1);
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);

  camCanvas.width = w;
  camCanvas.height = h;

  const ctx = camCanvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(camVideo, 0, 0, w, h);

  const quality = IS_MOBILE ? 0.75 : 0.82;

  const blob = await new Promise(resolve => camCanvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return null;

  const fileName = `camera_${Date.now()}.jpg`;
  return new File([blob], fileName, { type: "image/jpeg" });
}

/************************************************************
 * Preprocess many files sequentially (lower RAM spikes)
 ************************************************************/
async function preprocessMany(fileList) {
  // Accept FileList or Array<File>
  const files = [];
  const len = (fileList && typeof fileList.length === "number") ? fileList.length : 0;

  for (let i = 0; i < len; i++) {
    const f = fileList[i];
    if (f && f.type && f.type.startsWith("image/")) files.push(f);
  }
  if (files.length === 0) return [];

  const opts = IS_MOBILE
    ? { maxW: 1600, maxH: 1600, quality: 0.75, forceJpeg: true }
    : { maxW: 2200, maxH: 2200, quality: 0.82, forceJpeg: true };

  const out = [];
  for (const f of files) {
    try { out.push(await preprocessForOCR(f, opts)); }
    catch (e) { console.warn("preprocess failed:", f?.name, e); }
  }
  return out;
}

/************************************************************
 * Preview renderer (low-memory: ObjectURL not FileReader)
 ************************************************************/
function renderImagePreviews() {
  if (!previewsContainer) return;

  previewsContainer.innerHTML = "";
  if (oldPreview) {
    oldPreview.style.display = "none";
    oldPreview.src = "";
  }

  const files = [...processedPickerFiles, ...processedCameraFiles];

  if (files.length === 0) {
    previewsContainer.style.display = "none";
    return;
  }

  previewsContainer.style.display = "flex";
  previewsContainer.style.flexWrap = "wrap";
  previewsContainer.style.gap = "10px";

  files.forEach((file, index) => {
    if (!file || !file.type || !file.type.startsWith("image/")) return;

    const url = URL.createObjectURL(file);

    const img = document.createElement("img");
    img.src = url;
    img.alt = `Preview ${index + 1}`;
    img.style.maxWidth = "250px";
    img.style.maxHeight = "250px";
    img.style.border = "4px solid #1b1414ff";
    img.style.borderRadius = "8px";
    img.style.objectFit = "cover";

    img.onload = () => URL.revokeObjectURL(url);
    img.onerror = () => URL.revokeObjectURL(url);

    previewsContainer.appendChild(img);
  });
}

/************************************************************
 * Clear previews and reset state
 ************************************************************/
function clearAllPreviews() {
  processedPickerFiles = [];
  processedCameraFiles = [];

  if (previewsContainer) {
    previewsContainer.innerHTML = "";
    previewsContainer.style.display = "none";
  }

  if (oldPreview) {
    oldPreview.style.display = "none";
    oldPreview.src = "";
  }

  if (imageInput) imageInput.value = "";
  if (cameraInput) cameraInput.value = "";
}

/************************************************************
 * UI events
 ************************************************************/
if (takePhotoBtn) takePhotoBtn.addEventListener("click", openCameraModal);
if (camCloseBtn) camCloseBtn.addEventListener("click", closeCameraModal);
if (camTorchBtn) camTorchBtn.addEventListener("click", toggleTorch);

if (camCaptureBtn) {
  camCaptureBtn.addEventListener("click", async () => {
    const shot = await captureFrameAsFile();
    if (!shot) return;

    // preprocess captured image (already small, but keep consistent)
    const processed = await preprocessMany([shot]);

    // mobile safety: keep only latest
    processedCameraFiles = (IS_MOBILE && processed.length) ? [processed[processed.length - 1]] : processed;

    renderImagePreviews();
    closeCameraModal();
  });
}

/************************************************************
 * Event listeners for file inputs (ONLY ONCE)
 * (You had duplicates before — remove the extra block)
 ************************************************************/
imageInput.addEventListener("change", async () => {
  processedPickerFiles = await preprocessMany(imageInput.files);

  // mobile safety: keep only latest
  if (IS_MOBILE && processedPickerFiles.length > 1) {
    processedPickerFiles = [processedPickerFiles[processedPickerFiles.length - 1]];
  }

  renderImagePreviews();
});

// Optional fallback capture input (if modal fallback was used)
cameraInput.addEventListener("change", async () => {
  const processed = await preprocessMany(cameraInput.files);

  processedCameraFiles = (IS_MOBILE && processed.length)
    ? [processed[processed.length - 1]]
    : processed;

  renderImagePreviews();
});

// expose for safety (if any old code still calls it)
window.renderImagePreviews = renderImagePreviews;
  /************************************************************
   * STATE (unchanged) ...
   ************************************************************/
  let draftId = null;
  let uploadTypeSelected = null;
  let currentItems = [];
  let currentMeta = [];
  let currentCorrections = [];
  let droppedCandidates = [];

  let reviewedRows = new Set();
  let rowDirty = new Set();
  let confirmedCorrections = new Set();

  const guided = {
    running: false,
    paused: false,
    rowIndex: 0,
    fieldIndex: 0,
    timer: null,
    inactivityTimer: null,
    dwellMs: 2000,
    pauseReason: ""
  };

  const REVIEW_FIELDS = ["item_name", "part_no", "brand", "quantity", "unit_price"];

  function isNullish(v) {
    return v === null || v === undefined || String(v).trim() === "" || String(v).toLowerCase() === "nan";
  }

  function setWarning(msg) {
    if (!reviewWarning) return;
    reviewWarning.textContent = msg || "";
    reviewWarning.style.display = msg ? "block" : "none";
  }

  function lockApprove(msg) {
    if (approveBtn) approveBtn.disabled = true;
    if (msg) setWarning(msg);
  }

  function unlockApprove() {
    if (approveBtn) approveBtn.disabled = false;
    setWarning("");
  }

  // Count missing required fields
  function missingRequiredCount() {
    let missing = 0;
    currentItems.forEach(it => {
      if (isNullish(it.item_name)) missing++;
      if (isNullish(it.part_no)) missing++;
      if (isNullish(it.quantity)) missing++;
      if (isNullish(it.unit_price)) missing++;
    });
    return missing;
  }

  // Count corrections still pending
  function pendingCorrectionsCount() {
    if (!currentCorrections.length) return 0;
    const pending = new Set();
    currentCorrections.forEach(corr => {
      const idx = corr.item_index;
      (corr.corrections || []).forEach(c => {
        const key = `${idx}:${c.field}`;
        if (!confirmedCorrections.has(key)) pending.add(key);
      });
    });
    return pending.size;
  }

  function validateState() {
    if (!uploadTypeSelected) {
      lockApprove("⚠️ Select image type (Sales / Stock) first.");
      return false;
    }

    const missing = missingRequiredCount();
    if (missing > 0) {
      lockApprove(`⚠️ Missing ${missing} required field(s). Fill them before saving.`);
      return false;
    }

    if (currentItems.length > 0 && reviewedRows.size !== currentItems.length) {
      lockApprove(`🕵️ Review needed: ${reviewedRows.size}/${currentItems.length} rows reviewed.`);
      return false;
    }

    const pending = pendingCorrectionsCount();
    if (pending > 0) {
      lockApprove(`⚠️ Confirm changes: ${pending} pending correction(s).`);
      return false;
    }

    unlockApprove();
    return true;
  }

  /************************************************************
   * DOM HELPERS (unchanged) ...
   ************************************************************/
  function getInput(rowIndex, field) {
    return tbody.querySelector(`input.ocr-input[data-row="${rowIndex}"][data-field="${field}"]`);
  }

  function tdForField(rowIndex, field) {
    const inp = tbody.querySelector(`input[data-row="${rowIndex}"][data-field="${field}"]`);
    return inp ? inp.closest("td.cell-wrap") : null;
  }

  function inputWrapForField(rowIndex, field) {
    const td = tdForField(rowIndex, field);
    if (!td) return null;
    return td.querySelector(".cell-input-wrap");
  }

  function clearGuidedActiveOnly() {
    tbody.querySelectorAll("td.cell-wrap.cell-active")
      .forEach(td => td.classList.remove("cell-active"));
  }

  function clearRowStepHighlights(rowIndex) {
    const tr = tbody.querySelector(`tr[data-row="${rowIndex}"]`);
    if (!tr) return;
    tr.querySelectorAll("td.cell-wrap.cell-reviewed-step")
      .forEach(td => td.classList.remove("cell-reviewed-step"));
  }

  function highlightField(rowIndex, field) {
    clearGuidedActiveOnly();

    const input = getInput(rowIndex, field);
    if (!input) return;

    const td = input.closest("td.cell-wrap");
    if (!td) return;

    td.classList.add("cell-reviewed-step");
    td.classList.add("cell-active");

    td.scrollIntoView({ block: "nearest", inline: "nearest" });
    input.focus({ preventScroll: true });
  }

  function recalcTotalForRow(r) {
    const qty = parseFloat(String(currentItems[r].quantity ?? "").replace(/,/g, ""));
    const price = parseFloat(String(currentItems[r].unit_price ?? "").replace(/,/g, ""));
    const total = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
    currentItems[r].total = total;

    const totalCell = tbody.querySelector(`td[data-row="${r}"][data-field="total"]`);
    if (totalCell) totalCell.textContent = total.toFixed(2);
  }

  // ... (all other existing helper functions remain unchanged up to here) ...
  // For brevity I'll continue from where the new code will be inserted.
  // The full file will contain everything, I'm just showing the updates.

  /************************************************************
   * CORRECTION STATE HELPERS (unchanged) ...
   ************************************************************/
  function rowHasPendingCorrections(rowIndex) {
    if (!currentCorrections.length) return false;
    for (const corr of currentCorrections) {
      if (corr.item_index !== rowIndex) continue;
      for (const c of (corr.corrections || [])) {
        const key = `${rowIndex}:${c.field}`;
        if (!confirmedCorrections.has(key)) return true;
      }
    }
    return false;
  }

  function refreshRowConfirmState(rowIndex) {
    const tr = tbody.querySelector(`tr[data-row="${rowIndex}"]`);
    if (!tr) return;
    if (rowHasPendingCorrections(rowIndex)) tr.classList.add("row-needs-confirm");
    else tr.classList.remove("row-needs-confirm");
  }

  function refreshTopWarning() {
    const pending = pendingCorrectionsCount();
    if (pending > 0) setWarning(`⚠️ Confirm changes: ${pending} pending correction(s).`);
    else setWarning("");
  }

  /************************************************************
   * CORRECTION UI (unchanged) ...
   ************************************************************/
  function renderCorrectionUI(rowIndex, field, original, corrected) {
    const wrap = inputWrapForField(rowIndex, field);
    const td = tdForField(rowIndex, field);
    if (!wrap || !td) return;

    td.classList.add("cell-need-confirm");

    // remove ALL previous messages
    wrap.querySelectorAll(".cell-msg").forEach(n => n.remove());

    const msg = document.createElement("div");
    msg.className = "cell-msg";

    const title = document.createElement("div");
    title.className = "msg-title";
    title.textContent = `⚠️ ${field.replace(/_/g, " ")} auto-corrected`;

    const body = document.createElement("div");
    body.className = "msg-body";
    body.innerHTML = `<b>${String(original ?? "(empty)")}</b> → <b>${String(corrected)}</b>`;

    const actions = document.createElement("div");
    actions.className = "msg-actions";

    const keepBtn = document.createElement("button");
    keepBtn.type = "button";
    keepBtn.className = "mini-btn";
    keepBtn.textContent = "Keep";

    const revertBtn = document.createElement("button");
    revertBtn.type = "button";
    revertBtn.className = "mini-btn";
    revertBtn.textContent = "Revert";

    // Force enable
    keepBtn.disabled = false;
    revertBtn.disabled = false;
    keepBtn.style.pointerEvents = "auto";
    revertBtn.style.pointerEvents = "auto";
    keepBtn.style.cursor = "pointer";
    revertBtn.style.cursor = "pointer";

    keepBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleCorrectionAction(rowIndex, field, 'keep', corrected, original);
    });

    revertBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleCorrectionAction(rowIndex, field, 'revert', corrected, original);
    });

    actions.appendChild(keepBtn);
    actions.appendChild(revertBtn);
    msg.appendChild(title);
    msg.appendChild(body);
    msg.appendChild(actions);
    wrap.appendChild(msg);
  }

  function handleCorrectionAction(rowIndex, field, action, corrected, original) {
    if (guided.running && !guided.paused) pauseGuidedReview("You confirmed an auto-correction");

    const input = getInput(rowIndex, field);
    if (!input) return;

    if (action === 'keep') {
      input.value = corrected;
      currentItems[rowIndex][field] = corrected;
    } else { // revert
      const originalValue = original === "" ? "" : original;
      input.value = originalValue;
      currentItems[rowIndex][field] = original === "" ? null : original;
    }

    const key = `${rowIndex}:${field}`;
    confirmedCorrections.add(key);

    clearCorrectionUI(rowIndex, field);
    refreshRowConfirmState(rowIndex);

    if (field === "quantity" || field === "unit_price") recalcTotalForRow(rowIndex);

    if (reviewedRows.has(rowIndex)) unReviewRow(rowIndex);
    else rowDirty.add(rowIndex);

    refreshTopWarning();
    validateState();
  }

  function clearCorrectionUI(rowIndex, field) {
    const wrap = inputWrapForField(rowIndex, field);
    const td = tdForField(rowIndex, field);
    if (td) td.classList.remove("cell-need-confirm");
    if (!wrap) return;

    wrap.querySelectorAll(".cell-msg").forEach(n => n.remove());
  }

  function buildCorrectionsMap(correctionsArray) {
    const map = {};
    if (!correctionsArray) return map;
    correctionsArray.forEach(item => {
      const row = item.item_index;
      if (!map[row]) map[row] = {};
      (item.corrections || []).forEach(c => {
        map[row][c.field] = { original: c.original, corrected: c.corrected, confidence: c.confidence };
      });
    });
    return map;
  }

  /************************************************************
   * DROPPED CANDIDATES UI (unchanged) ...
   ************************************************************/
  function renderDroppedCandidates(dropped) {
    if (!droppedList) return;
    droppedList.innerHTML = "";

    if (!dropped || dropped.length === 0) {
      droppedList.innerHTML = "<li>No dropped candidates.</li>";
      if (toggleDroppedBtn) toggleDroppedBtn.style.display = "none";
      return;
    }

    if (toggleDroppedBtn) toggleDroppedBtn.style.display = "inline-block";

    dropped.forEach((drop, idx) => {
      const li = document.createElement("li");
      li.className = "dropped-item";

      const textSpan = document.createElement("span");
      textSpan.className = "dropped-text";
      if (drop.texts && Array.isArray(drop.texts)) textSpan.textContent = drop.texts.join(" ");
      else if (drop.text) textSpan.textContent = drop.text;
      else textSpan.textContent = "(unknown)";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "add-dropped-btn mini-btn";
      addBtn.dataset.dropIndex = String(idx);
      addBtn.textContent = "➕ Add as new row";
      addBtn.disabled = false;
      addBtn.style.pointerEvents = "auto";
      addBtn.style.cursor = "pointer";

      li.appendChild(textSpan);
      li.appendChild(addBtn);
      droppedList.appendChild(li);
    });
  }

  function addDroppedAsRow(dropIndex) {
    const drop = droppedCandidates[dropIndex];
    if (!drop) return;

    const newRow = { item_name:null, part_no:null, brand:null, quantity:null, unit_price:null, total:0 };
    const newIndex = currentItems.length;

    currentItems.push(newRow);
    currentMeta.push({ flags: [], review: null });

    renderEditableTable(
      currentItems.map((it, i) => ({ ...it, flags: currentMeta[i].flags, review: currentMeta[i].review })),
      currentCorrections,
      { resetReview: false }
    );

    reviewedRows.delete(newIndex);
    rowDirty.add(newIndex);

    const tr = tbody.querySelector(`tr[data-row="${newIndex}"]`);
    if (tr) {
      tr.scrollIntoView({ behavior: "smooth", block: "center" });
      const firstInput = tr.querySelector(`input[data-row="${newIndex}"][data-field="item_name"]`);
      if (firstInput) firstInput.focus({ preventScroll: true });
    }

    setWarning("➕ Dropped row added. Please fill in the fields.");
    validateState();
  }

  /************************************************************
   * PAUSE / RESUME (unchanged) ...
   ************************************************************/
  function pauseGuidedReview(reason = "User editing") {
    if (!guided.running) return;
    guided.paused = true;
    guided.pauseReason = reason;

    if (guided.timer) clearTimeout(guided.timer);
    guided.timer = null;

    setWarning(`⏸️ Paused: ${reason}. Finish editing – will auto-resume after 3s of inactivity.`);
  }

  function scheduleAutoResume() {
    if (!guided.running || !guided.paused) return;
    if (guided.inactivityTimer) clearTimeout(guided.inactivityTimer);
    guided.inactivityTimer = setTimeout(() => resumeGuidedReview(), 3000);
  }

  function resumeGuidedReview() {
    if (!guided.running || !guided.paused) return;
    if (guided.inactivityTimer) clearTimeout(guided.inactivityTimer);
    guided.inactivityTimer = null;

    guided.paused = false;
    guided.pauseReason = "";
    setWarning("▶️ Resuming review...");
    stepGuidedReview();
  }

  /************************************************************
   * REVIEWED STATE (unchanged) ...
   ************************************************************/
  function markRowReviewed(r) {
    reviewedRows.add(r);
    rowDirty.delete(r);

    const tr = tbody.querySelector(`tr[data-row="${r}"]`);
    if (!tr) return;

    tr.classList.add("row-reviewed");
    tr.querySelectorAll("td.cell-wrap").forEach(td => {
      td.classList.add("cell-reviewed");
      td.classList.remove("cell-active");
    });

    const badge = tr.querySelector(".review-badge");
    if (badge) badge.textContent = "✅";

    validateState();
  }

  function stopGuidedReview() {
    guided.running = false;
    guided.paused = false;
    guided.pauseReason = "";
    if (guided.timer) clearTimeout(guided.timer);
    guided.timer = null;
    if (guided.inactivityTimer) clearTimeout(guided.inactivityTimer);
    guided.inactivityTimer = null;
    clearGuidedActiveOnly();
  }

  function unReviewRow(r) {
    reviewedRows.delete(r);
    rowDirty.add(r);

    const tr = tbody.querySelector(`tr[data-row="${r}"]`);
    if (!tr) return;

    if (guided.running && guided.rowIndex === r) {
      stopGuidedReview();
      setWarning(`✎ Row ${r + 1} edited. Re-review only this row.`);
    }

    tr.classList.remove("row-reviewed");
    tr.querySelectorAll("td.cell-wrap").forEach(td => {
      td.classList.remove("cell-reviewed", "cell-reviewed-step", "cell-active");
    });

    const badge = tr.querySelector(".review-badge");
    if (badge) badge.textContent = "✎";

    validateState();
  }

  /************************************************************
   * INPUT BUILDER (unchanged) ...
   ************************************************************/
  function makeInput(value, field, rowIndex, required = false, type = "text", correctionMap = {}) {
    const input = document.createElement("input");

    input.type = (type === "number") ? "text" : type;
    input.inputMode = (type === "number") ? "decimal" : "text";

    input.value = isNullish(value) ? "" : String(value);
    input.dataset.row = String(rowIndex);
    input.dataset.field = field;
    input.className = "ocr-input";

    input.addEventListener("pointerdown", () => {
      if (guided.running && !guided.paused) pauseGuidedReview("You clicked a field");
    });

    input.addEventListener("input", () => {
      if (guided.running && guided.paused) scheduleAutoResume();

      const r = Number(input.dataset.row);
      const f = input.dataset.field;

      if (required) {
        if (isNullish(input.value)) input.classList.add("missing");
        else input.classList.remove("missing");
      }

      currentItems[r][f] = input.value;

      // If this field had a pending correction, mark as resolved when user edits
      const key = `${r}:${f}`;
      if (!confirmedCorrections.has(key) && correctionMap[r] && correctionMap[r][f]) {
        confirmedCorrections.add(key);
        clearCorrectionUI(r, f);
        refreshRowConfirmState(r);
        refreshTopWarning();
      }

      if (reviewedRows.has(r)) unReviewRow(r);
      else rowDirty.add(r);

      if (f === "quantity" || f === "unit_price") recalcTotalForRow(r);

      validateState();
    });

    if (required) {
      input.classList.add("required");
      input.placeholder = "Required";
      if (isNullish(value)) input.classList.add("missing");
    }

    if (type === "number") {
      input.addEventListener("beforeinput", (e) => {
        const allowed = /[0-9.,-]/;
        if (e.data && !allowed.test(e.data)) e.preventDefault();
      });
    }

    return input;
  }

  /************************************************************
   * RENDER TABLE (unchanged) ...
   ************************************************************/
  function renderEditableTable(items, corrections = [], { resetReview = true } = {}) {
    tbody.innerHTML = "";

    currentItems = items.map(it => ({
      item_name: it.item_name ?? null,
      part_no: it.part_no ?? null,
      brand: it.brand ?? null,
      quantity: it.quantity ?? null,
      unit_price: it.unit_price ?? null,
      total: it.total ?? null
    }));

    currentMeta = items.map(it => ({
      flags: Array.isArray(it.flags) ? it.flags : [],
      review: it.review || null
    }));

    currentCorrections = corrections;

    const correctionMap = buildCorrectionsMap(corrections);

    if (resetReview) {
      reviewedRows = new Set();
      rowDirty = new Set();
      confirmedCorrections = new Set();
    }

    const makeTd = (colClass, child, opts = {}) => {
      const td = document.createElement("td");
      td.classList.add("cell-wrap", "cell-flex");
      if (colClass) td.classList.add(colClass);

      const badgeSlot = document.createElement("span");
      badgeSlot.className = "review-badge-slot";

      if (opts.badge) {
        const badge = document.createElement("span");
        badge.className = "review-badge";
        const r = opts.rowIndex;
        badge.textContent = reviewedRows.has(r) ? "✅" : (rowDirty.has(r) ? "✎" : "•");
        badgeSlot.appendChild(badge);
      }

      const inputWrap = document.createElement("div");
      inputWrap.className = "cell-input-wrap";
      inputWrap.appendChild(child);

      td.appendChild(badgeSlot);
      td.appendChild(inputWrap);
      return td;
    };

    currentItems.forEach((item, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.row = String(idx);

      if (correctionMap[idx] && Object.keys(correctionMap[idx]).length > 0) {
        tr.classList.add("row-needs-confirm");
      }

      const fields = [
        { field: "item_name", required: true,  type: "text" },
        { field: "part_no",   required: true,  type: "text" },
        { field: "brand",     required: false, type: "text" },
        { field: "quantity",  required: true,  type: "number" },
        { field: "unit_price",required: true,  type: "number" }
      ];

      fields.forEach(f => {
        const input = makeInput(item[f.field], f.field, idx, f.required, f.type, correctionMap);
        const td = makeTd(`col-${f.field}`, input, { badge: f.field === "item_name", rowIndex: idx });
        tr.appendChild(td);
      });

      const tdTotal = document.createElement("td");
      tdTotal.classList.add("cell-wrap", "cell-flex");
      tdTotal.dataset.row = String(idx);
      tdTotal.dataset.field = "total";

      const badgeSlot = document.createElement("span");
      badgeSlot.className = "review-badge-slot";

      const totalWrap = document.createElement("div");
      totalWrap.className = "cell-input-wrap cell-total-wrap";

      recalcTotalForRow(idx);
      totalWrap.textContent = Number(currentItems[idx].total || 0).toFixed(2);

      tdTotal.appendChild(badgeSlot);
      tdTotal.appendChild(totalWrap);
      tr.appendChild(tdTotal);

      tbody.appendChild(tr);

      // render correction UI for this row
      if (correctionMap[idx]) {
        Object.entries(correctionMap[idx]).forEach(([field, corr]) => {
          const key = `${idx}:${field}`;
          if (!confirmedCorrections.has(key)) {
            renderCorrectionUI(idx, field, corr.original, corr.corrected);
          }
        });
      }
    });

    validateState();
  }

  /************************************************************
   * ADD ROW (unchanged but now also used by auto‑generator) ...
   ************************************************************/
  function addRow() {
    stopGuidedReview();

    const newRow = { item_name:null, part_no:null, brand:null, quantity:null, unit_price:null, total:0 };
    const newIndex = currentItems.length;

    currentItems.push(newRow);
    currentMeta.push({ flags: [], review: null });

    renderEditableTable(
      currentItems.map((it, i) => ({ ...it, flags: currentMeta[i].flags, review: currentMeta[i].review })),
      currentCorrections,
      { resetReview: false }
    );

    reviewedRows.delete(newIndex);
    rowDirty.add(newIndex);

    const tr = tbody.querySelector(`tr[data-row="${newIndex}"]`);
    if (tr) {
      tr.scrollIntoView({ behavior: "smooth", block: "center" });
      const firstInput = tr.querySelector(`input[data-row="${newIndex}"][data-field="item_name"]`);
      if (firstInput) firstInput.focus({ preventScroll: true });
    }

    setWarning("➕ Row added. Only this new row needs review ✅");
    validateState();
  }

  /************************************************************
   * GUIDED REVIEW (unchanged) ...
   ************************************************************/
  function currentRowHasMissingRequired(rowIndex) {
    const it = currentItems[rowIndex];
    const missing = [];
    if (isNullish(it.item_name)) missing.push("item_name");
    if (isNullish(it.part_no)) missing.push("part_no");
    if (isNullish(it.quantity)) missing.push("quantity");
    if (isNullish(it.unit_price)) missing.push("unit_price");
    return missing;
  }

  function findNextRowToReview(startIndex = 0) {
    for (let i = startIndex; i < currentItems.length; i++) {
      if (!reviewedRows.has(i) || rowDirty.has(i)) return i;
    }
    return -1;
  }

  function stepGuidedReview() {
    if (!guided.running || guided.paused) return;

    const r = guided.rowIndex;
    const f = REVIEW_FIELDS[guided.fieldIndex];

    highlightField(r, f);

    guided.timer = setTimeout(() => {
      if (!guided.running || guided.paused) return;

      guided.fieldIndex++;

      if (guided.fieldIndex >= REVIEW_FIELDS.length) {
        const missing = currentRowHasMissingRequired(r);
        if (missing.length) {
          guided.fieldIndex = REVIEW_FIELDS.length - 1;
          pauseGuidedReview(`Row ${r + 1} missing: ${missing.join(", ")}`);
          return;
        }

        markRowReviewed(r);

        const next = findNextRowToReview(r + 1);
        if (next === -1) {
          guided.running = false;
          clearGuidedActiveOnly();
          setWarning("✅ Review finished. Confirm flagged changes (if any), then Approve & Save.");
          validateState();
          return;
        }

        guided.rowIndex = next;
        guided.fieldIndex = 0;
        clearRowStepHighlights(next);
        clearGuidedActiveOnly();

        setWarning(`🔎 Guided review row ${next + 1}/${currentItems.length}...`);
        stepGuidedReview();
        return;
      }

      stepGuidedReview();
    }, guided.dwellMs);
  }

  function startGuidedReview() {
    if (!currentItems.length) {
      setWarning("⚠️ No data to review yet.");
      return;
    }

    const startRow = findNextRowToReview(0);
    if (startRow === -1) {
      setWarning("✅ Everything already reviewed.");
      validateState();
      return;
    }

    guided.running = true;
    guided.paused = false;
    guided.rowIndex = startRow;
    guided.fieldIndex = 0;

    clearRowStepHighlights(startRow);
    clearGuidedActiveOnly();

    setWarning(`🔎 Guided review row ${startRow + 1}/${currentItems.length}...`);
    stepGuidedReview();
  }

  /************************************************************
   * UI EVENTS (updated with manual and debt)
   ************************************************************/
  if (reviewModeBtn) reviewModeBtn.addEventListener("click", startGuidedReview);
  if (addRowBtn) addRowBtn.addEventListener("click", addRow);

    // Manual entry button logic
  manualEntryBtn?.addEventListener("click", () => {
    stopGuidedReview();
    // Hide image upload section, show table
    imageContainer.style.display = "block";   // stay inside container for table visibility
    tableSection.style.display = "block";
    resultTable.style.display = "table";

    // Clear any previous data
    currentItems = [];
    currentMeta = [];
    currentCorrections = [];
    droppedCandidates = [];
    reviewedRows = new Set();
    rowDirty = new Set();
    confirmedCorrections = new Set();
    draftId = null;

    // Start with ONE empty row
    const emptyRow = { item_name:null, part_no:null, brand:null, quantity:null, unit_price:null, total:0 };
    currentItems.push(emptyRow);
    currentMeta.push({ flags: [], review: null });

    renderEditableTable(
      currentItems.map((it,i) => ({...it, flags: currentMeta[i].flags, review: currentMeta[i].review })),
      [],
      { resetReview: false }
    );

    setWarning("📝 Manual mode: press Enter in the last row to add a new row.");
    validateState();

    // Remove any previous keydown listener, then add the Enter-to-add-row handler
    tbody.removeEventListener("keydown", manualEnterHandler);
    tbody.addEventListener("keydown", manualEnterHandler);
  });

  // Enter key handler for manual entry table
  // Enter key handler for manual entry table
function manualEnterHandler(e) {
  if (e.key !== "Enter") return;

  const input = e.target.closest("input.ocr-input");
  if (!input) return;

  // Only act if it's the LAST row
  const row = parseInt(input.dataset.row, 10);
  if (row !== currentItems.length - 1) return;

  // Check if the last row is fully filled
  const it = currentItems[row];
  const filled =
    !isNullish(it.item_name) &&
    !isNullish(it.part_no) &&
    !isNullish(it.quantity) &&
    !isNullish(it.unit_price);

  if (!filled) {
    // Optionally flash a warning – but we’ll just ignore
    setWarning("⚠️ Fill all required fields before pressing Enter to add a new row.");
    return;
  }

  e.preventDefault();   // stop any form submission
  addRow();             // use the existing addRow that re-renders safely
}

  // DROPPED toggle
  if (toggleDroppedBtn) {
    toggleDroppedBtn.addEventListener("click", () => {
      if (droppedSection.style.display === "none" || droppedSection.style.display === "") {
        droppedSection.style.display = "block";
        toggleDroppedBtn.textContent = "Hide dropped candidates";
      } else {
        droppedSection.style.display = "none";
        toggleDroppedBtn.textContent = "Show dropped candidates";
      }
    });
  }

  // Global click handler
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button.mini-btn");
    if (!btn) return;

    // Add dropped
    if (btn.classList.contains("add-dropped-btn")) {
      e.preventDefault();
      const dropIndex = btn.dataset.dropIndex;
      if (dropIndex !== undefined) addDroppedAsRow(parseInt(dropIndex, 10));
      return;
    }
  }, true);

  /************************************************************
   * SALE/STOCK SELECTION (updated: show manual entry button)
   ************************************************************/
  uploadSelect.addEventListener("change", function () {
    uploadTypeSelected = this.value || null;

    if (uploadTypeSelected === "sale" || uploadTypeSelected === "stock") {
      imageContainer.style.display = "block";
      manualEntryBtn.style.display = "inline-block";   // show manual entry
      validateState();
    } else {
      imageContainer.style.display = "none";
      manualEntryBtn.style.display = "none";
      // Clear file inputs and previews
      imageInput.value = "";
      cameraInput.value = "";
      clearAllPreviews();

      resultTable.style.display = "none";
      tableSection.style.display = "none";
      tbody.innerHTML = "";

      draftId = null;
      currentItems = [];
      currentMeta = [];
      currentCorrections = [];
      droppedCandidates = [];
      reviewedRows = new Set();
      rowDirty = new Set();
      confirmedCorrections = new Set();
      stopGuidedReview();

      if (droppedSection) droppedSection.style.display = "none";
      if (toggleDroppedBtn) toggleDroppedBtn.style.display = "none";

      lockApprove("⚠️ Select image type (Sales / Stock) first.");
    }
  });

/************************************************************
 * UPLOAD -> OCR (unchanged)
 ************************************************************/
uploadForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  if (!uploadTypeSelected) {
    setWarning("⚠️ Please select Sales image or Stock image first.");
    return;
  }

  // If manual mode we don't submit images (the form submit event won't fire because we don't trigger it)
  // But to be safe, we could check if manual mode is active
  // Actually we still need uploadForm submit for OCR. Manual entry doesn't use submit.

  let files = [];
  if (Array.isArray(processedPickerFiles) && processedPickerFiles.length) {
    files = files.concat(processedPickerFiles);
  }
  if (Array.isArray(processedCameraFiles) && processedCameraFiles.length) {
    files = files.concat(processedCameraFiles);
  }

  // Fallback: if you still allow raw inputs sometimes
  if (files.length === 0) {
    const raw = [];
    if (imageInput?.files?.length) {
      for (let i = 0; i < imageInput.files.length; i++) raw.push(imageInput.files[i]);
    }
    if (cameraInput?.files?.length) {
      for (let i = 0; i < cameraInput.files.length; i++) raw.push(cameraInput.files[i]);
    }
    if (raw.length === 0) {
      setWarning("⚠️ Please choose an image or take a photo first.");
      return;
    }
    const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const opts = IS_MOBILE
      ? { maxW: 1600, maxH: 1600, quality: 0.75, forceJpeg: true }
      : { maxW: 2200, maxH: 2200, quality: 0.82, forceJpeg: true };

    files = [];
    for (const f of raw) {
      try {
        files.push(await preprocessForOCR(f, opts));
      } catch (err) {
        console.warn("preprocessForOCR failed:", f?.name, err);
      }
    }
    if (files.length === 0) {
      setWarning("⚠️ No valid images to upload.");
      return;
    }
  }

  stopGuidedReview();

  tableSection.style.display = "block";
  tableSection.style.maxHeight = "450px";
  tableSection.style.overflowY = "auto";

  loader.style.display = "flex";
  resultTable.style.display = "none";
  tbody.innerHTML = "";

  lockApprove("⏳ Scanning...");

  try {
    const formData = new FormData();
    files.forEach(f => formData.append("images[]", f));
    formData.append("upload_type", uploadTypeSelected);

    const res = await fetch("Gm.php?action=ocr", { method: "POST", body: formData });
    const rawText = await res.text();

    let data = null;
    try { data = JSON.parse(rawText); }
    catch {
      loader.style.display = "none";
      setWarning("❌ Server did not return valid JSON. Open console → OCR rawText.");
      lockApprove("❌ Server error.");
      return;
    }

    console.log("OCR parsed:", data);
    console.log("success:", data?.success, "itemsIsArray:", Array.isArray(data?.items), "itemsLen:", data?.items?.length);

    loader.style.display = "none";

    const items = Array.isArray(data?.items) ? data.items : [];
    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];

    if (data?.success !== true) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:red;text-align:center;">${data?.error ? "Error: " + data.error : "OCR failed"}</td></tr>`;
      resultTable.style.display = "table";
      tableSection.style.display = "block";
      setWarning(warnings.length ? "⚠️ " + warnings.join(" | ") : "⚠️ OCR failed.");
      lockApprove("⚠️ OCR failed.");
      return;
    }

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:red;text-align:center;">No rows detected (items=0)</td></tr>`;
      resultTable.style.display = "table";
      tableSection.style.display = "block";
      setWarning(warnings.length ? "⚠️ " + warnings.join(" | ") : "⚠️ No rows detected.");
      lockApprove("⚠️ No rows detected.");
      return;
    }

    draftId = data.draft_id || null;
    droppedCandidates = Array.isArray(data?.dropped_candidates) ? data.dropped_candidates : [];

    renderEditableTable(items, Array.isArray(data?.corrections) ? data.corrections : []);

    if (droppedCandidates.length > 0) {
      renderDroppedCandidates(droppedCandidates);
      if (droppedSection) droppedSection.style.display = "none";
      if (toggleDroppedBtn) toggleDroppedBtn.style.display = "inline-block";
    } else {
      if (droppedSection) droppedSection.style.display = "none";
      if (toggleDroppedBtn) toggleDroppedBtn.style.display = "none";
    }

    resultTable.style.display = "table";
    tableSection.style.display = "block";

    const pending = pendingCorrectionsCount();
    if (warnings.length) {
      setWarning("⚠️ OCR warnings: " + warnings.join(" | ") + ` — ${pending} correction(s) pending. Start Guided Review.`);
    } else {
      setWarning(`✅ Scan done. ${pending} correction(s) pending. Start Guided Review + confirm changes.`);
    }

    validateState();

  } catch (err) {
    console.error(err);
    loader.style.display = "none";
    setWarning("❌ Upload/OCR failed. Check console for details.");
    lockApprove("❌ Server error.");
  }
});

  /************************************************************
   * APPROVE & SAVE (updated for manual / OCR dual use)
   ************************************************************/
  if (approveBtn) {
    approveBtn.addEventListener("click", function () {
      if (!validateState()) return;

      const payloadItems = currentItems.map(it => {
        const clean = (v) => (isNullish(v) ? null : String(v).trim());

        const qty = isNullish(it.quantity) ? null : Number(String(it.quantity).replace(/,/g, ""));
        const price = isNullish(it.unit_price) ? null : Number(String(it.unit_price).replace(/,/g, ""));

        const total =
          (qty !== null && Number.isFinite(qty) && price !== null && Number.isFinite(price))
            ? qty * price
            : null;

        return {
          item_name: clean(it.item_name),
          part_no: clean(it.part_no),
          brand: clean(it.brand),
          quantity: (qty !== null && Number.isFinite(qty)) ? Math.trunc(qty) : null,
          unit_price: (price !== null && Number.isFinite(price)) ? price : null,
          total
        };
      });

      // Choose endpoint based on whether draftId exists (OCR) or not (manual)
      const action = draftId ? "confirm" : "manual_save";

      fetch("Gm.php?action=" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: draftId,
          upload_type: uploadTypeSelected,
          items: payloadItems
        })
      })
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          setWarning("❌ Save failed: " + (data.error || "unknown error"));
          return;
        }
        setWarning(`✅ Saved to ${data.table}. Inserted: ${data.inserted}, Skipped: ${data.skipped}`);
      })
      .catch(() => setWarning("❌ Save failed: server/network error."));
    });
  }

  lockApprove("⚠️ Select image type (Sales / Stock) first.");

  /************************************************************
   * CLIENT-SIDE IMAGE PREPROCESS (unchanged)
   ************************************************************/
  async function preprocessForOCR(file, { maxW=2200, maxH=2200, quality=0.82, forceJpeg=true } = {}) {
    if (!file.type.startsWith("image/")) return file;
    if (!forceJpeg && file.size < 1_800_000) return file;

    const img = await fileToImage(file);
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const targetW = Math.round(img.width * scale);
    const targetH = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;

    const safeName = (file.name || "upload").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], safeName, { type: "image/jpeg" });
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Bad image")); };
      img.src = url;
    });
  }

  /************************************************************
 * DEBT MANAGEMENT – Clean, self‑explanatory
 ************************************************************/

/************************************************************
 * DEBT MANAGEMENT – Always visible details, scrollable
 ************************************************************/
let debtors = [];

async function loadDebtors() {
  try {
    const data = await apiGet("Gm.php?action=debt_list");
    debtors = Array.isArray(data.debtors) ? data.debtors : [];
    renderDebtors();
  } catch (e) {
    console.error("Failed to load debtors", e);
    document.getElementById("debtors_list").innerHTML =
      "<p style='color:red'>Failed to load debt data.</p>";
  }
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function startCountdown(element, dueDateISO) {
  function update() {
    const now = new Date();
    const due = new Date(dueDateISO + "T23:59:59");
    const diff = due - now;
    if (diff <= 0) {
      element.textContent = "⚠️ Overdue!";
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    element.textContent = `⏳ ${days}d ${hours}h left`;
  }
  update();
  setInterval(update, 1000 * 60 * 60);
}

function renderDebtors() {
  const container = document.getElementById("debtors_list");
  if (!container) return;
  container.innerHTML = "";

  if (!debtors.length) {
    container.innerHTML = "<p style='text-align:center'>No debtors recorded yet 🎉</p>";
    return;
  }

  debtors.forEach(debtor => {
    const balance = debtor.balance.toFixed(2);
    const balanceDisplay = Number(balance) <= 0
        ? '<span class="balance-cleared">✅ Cleared</span>'
        : `KES ${Number(balance).toLocaleString()}`;

    const phoneInfo = debtor.phone ? ` (${escapeHtml(debtor.phone)})` : "";
    const blacklistBadge = debtor.blacklisted ? " 🚫 BLACKLISTED" : "";

    const card = document.createElement("div");
    card.className = "debtor-card";
    card.dataset.id = debtor.id;

    card.innerHTML = `
      <div class="debtor-summary">
        <span class="debtor-name">${escapeHtml(debtor.name)}${phoneInfo}${blacklistBadge}</span>
        <span class="debtor-balance">${balanceDisplay}</span>
      </div>

      <div class="debtor-details">
        <div class="meta">
          Repayment: ${debtor.repay_rate}${debtor.due_date ? ` | Due: ${formatDate(debtor.due_date)}` : ""}
        </div>
        <div class="countdown"></div>

        <h4>Owed items</h4>
        <ul>
          ${debtor.items.map(it => `
            <li>
              <span>${escapeHtml(it.item_name)} – ${it.qty} × KES ${it.price.toFixed(2)}</span>
              <span>KES ${(it.qty * it.price).toFixed(2)}</span>
            </li>
          `).join("")}
        </ul>

        <p><strong>Total owed:</strong> KES ${debtor.total_owed.toFixed(2)} |
           <strong>Paid:</strong> KES ${debtor.total_paid.toFixed(2)}</p>

        <div class="ledger">
          <h5>📒 Payment history</h5>
          ${debtor.payments.length
            ? `<table>
                <thead><tr><th>Date</th><th>Amount</th></tr></thead>
                <tbody>${debtor.payments.map(p => `<tr><td>${formatDate(p.date)}</td><td>KES ${p.amount.toFixed(2)}</td></tr>`).join("")}</tbody>
              </table>`
            : "<p>No payments yet.</p>"
          }
        </div>

        <div class="actions">
          <button class="btn primary add_item_btn" data-debtor="${debtor.id}">➕ Add Item</button>
          <button class="btn secondary record_payment_btn" data-debtor="${debtor.id}">💵 Record Payment</button>
        </div>

        <div class="inline-form add-item-form" style="display:none;">
          <input type="text" class="item_name" placeholder="Item name" required>
          <input type="text" class="part_no" placeholder="Part no (opt)">
          <input type="number" class="qty" placeholder="Qty" min="1" required>
          <input type="number" step="0.01" class="price" placeholder="Unit price" required>
          <button class="btn primary save_item_btn" data-debtor="${debtor.id}">Save</button>
          <button class="btn cancel_item_btn" data-debtor="${debtor.id}">Cancel</button>
        </div>

        <div class="inline-form payment-form" style="display:none;">
          <input type="number" step="0.01" class="pay_amount" placeholder="Amount (KES)" min="1" required>
          <button class="btn primary save_payment_btn" data-debtor="${debtor.id}">Pay</button>
          <button class="btn cancel_payment_btn" data-debtor="${debtor.id}">Cancel</button>
        </div>
      </div>
    `;

    const countdownEl = card.querySelector(".countdown");
    if (debtor.due_date) startCountdown(countdownEl, debtor.due_date);

    container.appendChild(card);
  });
}

/************************************************************
 * Event delegation – all actions
 ************************************************************/
document.getElementById("debtors_list").addEventListener("click", async (e) => {
  const card = e.target.closest(".debtor-card");
  if (!card) return;
  const debtorId = card.dataset.id;

  // Show add item form
  if (e.target.classList.contains("add_item_btn")) {
    const form = card.querySelector(".add-item-form");
    form.style.display = form.style.display === "none" ? "flex" : "none";
  }

  // Save new item
  if (e.target.classList.contains("save_item_btn")) {
    const form = card.querySelector(".add-item-form");
    const item_name = form.querySelector(".item_name").value.trim();
    const part_no = form.querySelector(".part_no").value.trim();
    const qty = parseInt(form.querySelector(".qty").value);
    const price = parseFloat(form.querySelector(".price").value);

    if (!item_name || !qty || isNaN(price) || price <= 0) return alert("Fill all required fields");
    try {
      await apiGet(`Gm.php?action=debt_add_item&debtor_id=${debtorId}&item_name=${encodeURIComponent(item_name)}&qty=${qty}&price=${price}&part_no=${encodeURIComponent(part_no || "")}`);
      loadDebtors();
    } catch (err) { alert("Failed to add item"); }
  }

  // Cancel add item
  if (e.target.classList.contains("cancel_item_btn")) {
    card.querySelector(".add-item-form").style.display = "none";
  }

  // Show payment form
  if (e.target.classList.contains("record_payment_btn")) {
    const form = card.querySelector(".payment-form");
    form.style.display = form.style.display === "none" ? "flex" : "none";
  }

  // Save payment
  if (e.target.classList.contains("save_payment_btn")) {
    const amount = parseFloat(card.querySelector(".pay_amount").value);
    if (!amount || amount <= 0) return alert("Enter a valid amount");
    try {
      await apiGet(`Gm.php?action=debt_payment&debtor_id=${debtorId}&amount=${amount}`);
      loadDebtors();
    } catch (err) { alert("Payment failed"); }
  }

  // Cancel payment
  if (e.target.classList.contains("cancel_payment_btn")) {
    card.querySelector(".payment-form").style.display = "none";
  }
});

// Add debtor form
// Add debtor form – now includes items
document.getElementById("debt_add_form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name  = document.getElementById("debtor_name").value.trim();
  const phone = document.getElementById("debtor_phone").value.trim();
  const rate  = document.getElementById("debt_repay_rate").value;
  const due   = document.getElementById("debt_due_date").value;

  if (!name) return alert("Enter debtor name");

  // Collect items from the table
  const itemRows = document.querySelectorAll("#new_debtor_items_table tbody .item-row");
  const items = [];
  itemRows.forEach(row => {
    const itemName = row.querySelector(".item_name").value.trim();
    const partNo = row.querySelector(".part_no").value.trim();
    const qty = parseInt(row.querySelector(".qty").value);
    const price = parseFloat(row.querySelector(".price").value);

    if (itemName && qty > 0 && !isNaN(price) && price > 0) {
      items.push({
        item_name: itemName,
        part_no: partNo || null,
        qty: qty,
        price: price
      });
    }
  });

  // Build query string for GET (or use JSON POST – we'll keep it simple with GET)
  const params = new URLSearchParams();
  params.set("action", "debt_add");
  params.set("name", name);
  params.set("phone", phone);
  params.set("rate", rate);
  params.set("due", due);
  params.set("items", JSON.stringify(items));   // items as JSON

  try {
    await apiGet(`Gm.php?${params.toString()}`);
    document.getElementById("debt_add_form").reset();
    // Reset items table to one empty row (by re-creating the row)
    const tbody = document.getElementById("new_debtor_items_table").querySelector("tbody");
    tbody.innerHTML = `
      <tr class="item-row">
        <td><input type="text" class="item_name" required></td>
        <td><input type="text" class="part_no"></td>
        <td><input type="number" class="qty" min="1" value="1" required></td>
        <td><input type="number" step="0.01" class="price" required></td>
        <td><button type="button" class="remove_row_btn">✕</button></td>
      </tr>`;
    loadDebtors();
  } catch (e) { alert("Failed to add debtor"); }
});

// Add extra item row dynamically
// ============================================================
// ITEMS TABLE – ENTER adds row, X removes row
// ============================================================
const itemsTable = document.getElementById("new_debtor_items_table");
if (itemsTable) {
  // Press Enter on any input in the items table → add a new row if we are on the LAST row
  itemsTable.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      // prevent accidental form submit
      e.preventDefault();

      const input = e.target;
      // get the row that contains this input
      const currentRow = input.closest("tr.item-row");
      if (!currentRow) return;

      // Check if this is the LAST row in the table
      const allRows = itemsTable.querySelectorAll("tbody tr.item-row");
      const isLastRow = currentRow === allRows[allRows.length - 1];

      if (isLastRow) {
        // Add a new empty row after the current one
        const newRow = document.createElement("tr");
        newRow.className = "item-row";
        newRow.innerHTML = `
          <td><input type="text" class="item_name" required></td>
          <td><input type="text" class="part_no"></td>
          <td><input type="number" class="qty" min="1" value="1" required></td>
          <td><input type="number" step="0.01" class="price" required></td>
          <td><button type="button" class="remove_row_btn">✕</button></td>
        `;
        itemsTable.querySelector("tbody").appendChild(newRow);

        // Focus the item_name of the new row
        newRow.querySelector(".item_name").focus();
      }
    }
  });

  // Remove a row (delegated)
  itemsTable.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove_row_btn");
    if (!btn) return;
    const row = btn.closest("tr.item-row");
    if (!row) return;

    // prevent deleting the last remaining row
    const allRows = itemsTable.querySelectorAll("tbody tr.item-row");
    if (allRows.length <= 1) {
      // Clear the row instead of deleting it
      row.querySelectorAll("input").forEach(inp => inp.value = "");
      row.querySelector(".qty").value = "1";
      return;
    }
    row.remove();
  });
}
// Remove item row (delegated)
document.querySelector("#new_debtor_items_table").addEventListener("click", (e) => {
  const btn = e.target.closest(".remove_row_btn");
  if (btn) {
    const row = btn.closest("tr");
    if (row) row.remove();
  }
});
// Initial load
loadDebtors();
  /************************************************************
 * DASHBOARD: Low stock + Charts
 ************************************************************/
async function loadLowStock() {
  const tbody = document.getElementById("lows_stock_table");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5">Loading...</td></tr>`;

  try {
    const data = await apiGet("Gm.php?action=stats_low_stock");

    const items = data.items || [];
    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5">No low stock items 🎉</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    for (const it of items) {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${escapeHtml(it.item_name ?? "")}</td>
        <td>${escapeHtml(it.part_no ?? "")}</td>
        <td>${escapeHtml(String(it.quantity ?? ""))}</td>
        <td>${escapeHtml(it.brand ?? "")}</td>
        <td>${escapeHtml(it.updated_at ?? "")}</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">Failed: ${escapeHtml(e.message)}</td></tr>`;
  }
}

// Dashboard state
let charts = { weekly: null, top8: null, monthly: null, yearly: null };
let weeklyDates = [];
let selectedDate = null;

async function apiGet(url) {
  const res = await fetch(url, { method: "GET" });
  const data = await res.json();
  if (!data || data.success === false) {
    throw new Error((data && data.error) ? data.error : "Request failed");
  }
  return data;
}

function formatKesTick(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return String(n.toFixed(0));
}

function dayNameFromISO(isoDateStr) {
  if (!isoDateStr) return "";
  const d = new Date(isoDateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function shortDayFromISO(isoDateStr) {
  const full = dayNameFromISO(isoDateStr);
  return full ? full.slice(0, 3) : "";
}

function showEl(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "";
}
function hideEl(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

function isArrayEmptyOrAllZero(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return true;
  return arr.every(v => {
    const n = Number(v);
    return !Number.isFinite(n) || n === 0;
  });
}

function destroyChartSafely(ch) {
  try { if (ch) ch.destroy(); } catch (_) {}
}
function daysInMonth(y, m1to12) {
  return new Date(y, m1to12, 0).getDate();
}

function shouldShowMonthlyWindow(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const dim = daysInMonth(y, m);
  return (d >= (dim - 6)) || (d <= 7);
}

function shouldShowYearlyWindow(today = new Date()) {
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const isQuarterStart = (m === 1 || m === 4 || m === 7 || m === 10);
  return isQuarterStart && (d <= 7);
}

async function loadWeeklyGrowingChart(preFetched = null) {
  const wrapId = "weekly-card";
  const canvas = document.getElementById("weeklyChart");
  if (!canvas) return { rawLabels: [], revenue: [] };

  try {
    const data = preFetched || await apiGet("Gm.php?action=stats_weekly_current");

    const rawLabels = Array.isArray(data.labels) ? data.labels : [];
    const revenue = Array.isArray(data.revenue) ? data.revenue : [];

    if (rawLabels.length === 0 || isArrayEmptyOrAllZero(revenue)) {
      destroyChartSafely(charts.weekly);
      charts.weekly = null;
      hideEl(wrapId);
      return { rawLabels: [], revenue: [] };
    }

    showEl(wrapId);

    const labels = rawLabels.map(d => shortDayFromISO(d) || d);

    const ctx = canvas.getContext("2d");
    destroyChartSafely(charts.weekly);

    charts.weekly = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Revenue (KES)", data: revenue }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => formatKesTick(v) }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items || !items.length) return "";
                const idx = items[0].dataIndex;
                const iso = rawLabels[idx] || "";
                const day = dayNameFromISO(iso);
                return day ? `${day} (${iso})` : (iso || labels[idx]);
              }
            }
          }
        }
      }
    });

    return { rawLabels, revenue };

  } catch (e) {
    destroyChartSafely(charts.weekly);
    charts.weekly = null;
    hideEl(wrapId);
    return { rawLabels: [], revenue: [] };
  }
}

async function loadTop8ForDay(dayISO = null) {
  const wrapId = "top8-card";
  const titleEl = document.getElementById("top8Title");
  const canvas = document.getElementById("barChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const render = (labels, qty, dayLabelText) => {
    if (labels.length === 0 || isArrayEmptyOrAllZero(qty)) return false;

    showEl(wrapId);

    if (titleEl) {
      titleEl.textContent = dayLabelText ? `Most sold goods (${dayLabelText})` : "Most sold goods";
    }

    destroyChartSafely(charts.top8);
    charts.top8 = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Quantity sold", data: qty }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: true } }
      }
    });

    return true;
  };

  if (dayISO) {
    try {
      const url = `Gm.php?action=stats_top8_by_day&day=${encodeURIComponent(dayISO)}`;
      const data = await apiGet(url);
      const labels = Array.isArray(data.labels) ? data.labels : [];
      const qty = Array.isArray(data.qty) ? data.qty : [];
      const dayName = dayNameFromISO(dayISO) || null;
      if (render(labels, qty, dayName)) return;
    } catch (e) {
      console.warn("stats_top8_by_day failed, falling back:", e.message);
    }
  }

  // Fallback to yesterday
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayISO = `${yyyy}-${mm}-${dd}`;

    const url = `Gm.php?action=stats_top8_by_day&day=${yesterdayISO}`;
    const data = await apiGet(url);
    const labels = Array.isArray(data.labels) ? data.labels : [];
    const qty = Array.isArray(data.qty) ? data.qty : [];
    const dayName = dayNameFromISO(yesterdayISO);
    if (render(labels, qty, dayName)) return;

    destroyChartSafely(charts.top8);
    charts.top8 = null;
    hideEl(wrapId);
  } catch (e) {
    destroyChartSafely(charts.top8);
    charts.top8 = null;
    hideEl(wrapId);
  }
}

async function loadYearlyChart() {
  const sectionId = "yearly-chart";
  const canvas = document.getElementById("yearlyCharts");
  if (!canvas) return;

  try {
    const data = await apiGet("Gm.php?action=stats_yearly_months");
    const labels = Array.isArray(data.labels) ? data.labels : [];
    const revenue = Array.isArray(data.revenue) ? data.revenue : [];

    if (labels.length === 0 || isArrayEmptyOrAllZero(revenue)) {
      destroyChartSafely(charts.yearly);
      charts.yearly = null;
      hideEl(sectionId);
      return;
    }

    showEl(sectionId);

    const ctx = canvas.getContext("2d");
    destroyChartSafely(charts.yearly);

    charts.yearly = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Revenue (KES)", data: revenue }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
  } catch {
    destroyChartSafely(charts.yearly);
    charts.yearly = null;
    hideEl(sectionId);
  }
}

async function loadMonthlyChart() {
  const sectionId = "monthly-chart";
  const canvas = document.getElementById("monthlyChart");
  if (!canvas) return;

  try {
    const data = await apiGet("Gm.php?action=stats_monthly_weeks");
    const labels = Array.isArray(data.labels) ? data.labels : [];
    const revenue = Array.isArray(data.revenue) ? data.revenue : [];

    if (labels.length === 0 || isArrayEmptyOrAllZero(revenue)) {
      destroyChartSafely(charts.monthly);
      charts.monthly = null;
      hideEl(sectionId);
      return;
    }

    showEl(sectionId);

    const ctx = canvas.getContext("2d");
    destroyChartSafely(charts.monthly);

    charts.monthly = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Revenue (KES)", data: revenue }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
  } catch {
    destroyChartSafely(charts.monthly);
    charts.monthly = null;
    hideEl(sectionId);
  }
}

function enableWeeklyClickToTop8(rawISODateLabels) {
  if (!charts.weekly) return;
  const weeklyCanvas = document.getElementById("weeklyChart");
  if (weeklyCanvas) {
    weeklyCanvas.onclick = async (evt) => {
      const points = charts.weekly.getElementsAtEventForMode(
        evt,
        "nearest",
        { intersect: true },
        true
      );
      if (!points || !points.length) return;
      const idx = points[0].index;
      const iso = Array.isArray(rawISODateLabels) ? rawISODateLabels[idx] : null;
      if (!iso) return;
      await loadTop8ForDay(iso);
    };
  }
}

async function initDashboard() {
  if (typeof loadLowStock === 'function') await loadLowStock();

  let weeklyData = null;
  let rawLabels = [];
  let revenue = [];

  try {
    weeklyData = await apiGet("Gm.php?action=stats_weekly_current");
    rawLabels = Array.isArray(weeklyData.labels) ? weeklyData.labels : [];
    revenue = Array.isArray(weeklyData.revenue) ? weeklyData.revenue : [];
  } catch {
    rawLabels = [];
    revenue = [];
  }

  const weeklyDrawn = await loadWeeklyGrowingChart(weeklyData);

  if (weeklyDrawn.rawLabels.length > 0 && !isArrayEmptyOrAllZero(weeklyDrawn.revenue)) {
    enableWeeklyClickToTop8(weeklyDrawn.rawLabels);
  } else {
    hideEl("weekly-card");
  }

  let defaultDay = null;
  if (weeklyDrawn.rawLabels.length > 0 && Array.isArray(weeklyDrawn.revenue)) {
    for (let i = weeklyDrawn.revenue.length - 1; i >= 0; i--) {
      const n = Number(weeklyDrawn.revenue[i]);
      if (Number.isFinite(n) && n > 0) {
        defaultDay = weeklyDrawn.rawLabels[i];
        break;
      }
    }
  }

  await loadTop8ForDay(defaultDay);

  if (shouldShowMonthlyWindow()) {
    await loadMonthlyChart();
  } else {
    hideEl("monthly-chart");
  }

  if (shouldShowYearlyWindow()) {
    await loadYearlyChart();
  } else {
    hideEl("yearly-chart");
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
loadDebtors();
// Load everything on start

initDashboard().catch(err => console.error("Dashboard init failed:", err));
loadDebtors().catch(err => console.error("Debt load failed:", err));

}); // End of DOMContentLoaded