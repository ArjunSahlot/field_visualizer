(() => {
  "use strict";

  const WORLD_WIDTH = 10;
  const COULOMB_NC = 8.9875517923;
  const MIN_DISTANCE_SQ = 0.018;
  const STORAGE_KEY = "field-visualizer-scene-v2";
  const DENSITY_NAMES = ["Sparse", "Light", "Medium", "Dense", "Fine"];
  const DENSITY_GAPS = [78, 64, 52, 42, 34];
  const VIEW_DESCRIPTIONS = {
    vectors: "Direction and relative strength",
    lines: "Paths followed by a test charge",
    potential: "Voltage relative to infinity",
  };

  const canvas = document.querySelector("#field-canvas");
  const canvasWrap = document.querySelector("#canvas-wrap");
  const ctx = canvas.getContext("2d", { alpha: false });
  const inspector = document.querySelector("#inspector");
  const sceneSummary = document.querySelector("#scene-summary");
  const canvasHint = document.querySelector("#canvas-hint");
  const probePosition = document.querySelector("#probe-position");
  const probeField = document.querySelector("#probe-field");
  const toast = document.querySelector("#toast");

  let size = { width: 0, height: 0, dpr: 1, worldHeight: 8 };
  let chargeCounter = 1;
  let state = loadState() || {
    charges: presetCharges("dipole"),
    sceneName: "Dipole",
    view: "vectors",
    density: 3,
    vectorScale: 1,
  };
  let tool = "select";
  let selectedId = null;
  let hoverId = null;
  let pointerWorld = null;
  let drag = null;
  let frameRequested = false;
  let potentialCache = { key: "", canvas: null };
  let toastTimer = null;
  let history = [serializeScene()];
  let historyIndex = 0;
  chargeCounter = Math.max(0, ...state.charges.map((charge) => charge.id || 0)) + 1;

  function presetCharges(name) {
    const make = (x, y, q, label = "") => ({ id: chargeCounterSafe(), x, y, q, label, locked: false });
    switch (name) {
      case "like":
        return [make(-1.7, 0, 5), make(1.7, 0, 5)];
      case "capacitor": {
        const charges = [];
        for (let i = 0; i < 7; i += 1) {
          const y = -2.25 + i * 0.75;
          charges.push(make(-2.5, y, 1.5), make(2.5, y, -1.5));
        }
        return charges;
      }
      case "quadrupole":
        return [make(-1.5, -1.5, 4), make(1.5, 1.5, 4), make(-1.5, 1.5, -4), make(1.5, -1.5, -4)];
      case "dipole":
      default:
        return [make(-1.6, 0, 5), make(1.6, 0, -5)];
    }
  }

  function chargeCounterSafe() {
    if (typeof chargeCounter === "number") return chargeCounter++;
    chargeCounterSafe.seed = (chargeCounterSafe.seed || 0) + 1;
    return chargeCounterSafe.seed;
  }

  function loadState() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!value || value.version !== 2 || !Array.isArray(value.charges)) return null;
      return {
        charges: value.charges.filter(validCharge).map((charge) => ({ ...charge })),
        sceneName: value.sceneName || "Custom",
        view: ["vectors", "lines", "potential"].includes(value.view) ? value.view : "vectors",
        density: clamp(Math.round(Number(value.density) || 3), 1, 5),
        vectorScale: clamp(Number(value.vectorScale) || 1, 0.6, 1.6),
      };
    } catch (_) {
      return null;
    }
  }

  function validCharge(charge) {
    return charge && [charge.x, charge.y, charge.q].every(Number.isFinite);
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ...state }));
    } catch (_) {}
  }

  function serializeScene() {
    return JSON.stringify({ charges: state.charges, sceneName: state.sceneName });
  }

  function restoreScene(serialized) {
    const scene = JSON.parse(serialized);
    state.charges = scene.charges.map((charge) => ({ ...charge }));
    state.sceneName = scene.sceneName;
    selectedId = null;
    inspector.hidden = true;
    invalidatePotential();
    updateUi();
    persist();
    requestDraw();
  }

  function commitHistory() {
    const snapshot = serializeScene();
    if (history[historyIndex] === snapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    historyIndex = history.length - 1;
    updateHistoryButtons();
    persist();
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    restoreScene(history[historyIndex]);
    updateHistoryButtons();
    showToast("Undid last change");
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    restoreScene(history[historyIndex]);
    updateHistoryButtons();
    showToast("Redid change");
  }

  function updateHistoryButtons() {
    document.querySelector("#undo").disabled = historyIndex <= 0;
    document.querySelector("#redo").disabled = historyIndex >= history.length - 1;
  }

  function resizeCanvas() {
    const rect = canvasWrap.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (nextWidth === size.width && nextHeight === size.height && nextDpr === size.dpr) return;
    size.width = nextWidth;
    size.height = nextHeight;
    size.dpr = nextDpr;
    size.worldHeight = WORLD_WIDTH * (size.height / size.width);
    canvas.width = Math.round(size.width * size.dpr);
    canvas.height = Math.round(size.height * size.dpr);
    canvasWrap.style.setProperty("--meter", `${size.width / WORLD_WIDTH}px`);
    invalidatePotential();
    requestDraw();
  }

  function requestDraw() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(draw);
  }

  function draw() {
    frameRequested = false;
    const colors = getColors();
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = colors.canvas;
    ctx.fillRect(0, 0, size.width, size.height);

    if (state.view === "potential") drawPotential(colors);
    drawGrid(colors);
    if (state.view === "vectors") drawVectors(colors);
    if (state.view === "lines") drawFieldLines(colors);
    drawCharges(colors);
    if (pointerWorld) drawProbe(colors);
  }

  function getColors() {
    const css = getComputedStyle(document.documentElement);
    return {
      canvas: css.getPropertyValue("--canvas").trim(),
      bg: css.getPropertyValue("--bg").trim(),
      fg: css.getPropertyValue("--fg").trim(),
      muted: css.getPropertyValue("--muted").trim(),
      faint: css.getPropertyValue("--faint").trim(),
      line: css.getPropertyValue("--line").trim(),
      positive: css.getPropertyValue("--positive").trim(),
      negative: css.getPropertyValue("--negative").trim(),
      dark: document.documentElement.classList.contains("dark"),
    };
  }

  function drawGrid(colors) {
    const pixelsPerMeter = size.width / WORLD_WIDTH;
    const origin = worldToCanvas(0, 0);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.line;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let x = origin.x % pixelsPerMeter; x <= size.width; x += pixelsPerMeter) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, size.height);
    }
    for (let y = origin.y % pixelsPerMeter; y <= size.height; y += pixelsPerMeter) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(size.width, Math.round(y) + 0.5);
    }
    ctx.stroke();

    ctx.strokeStyle = colors.faint;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(origin.x + 0.5, 0);
    ctx.lineTo(origin.x + 0.5, size.height);
    ctx.moveTo(0, origin.y + 0.5);
    ctx.lineTo(size.width, origin.y + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function fieldAt(x, y) {
    let ex = 0;
    let ey = 0;
    let potential = 0;
    for (const charge of state.charges) {
      const dx = x - charge.x;
      const dy = y - charge.y;
      const r2 = Math.max(dx * dx + dy * dy, MIN_DISTANCE_SQ);
      const r = Math.sqrt(r2);
      const strength = (COULOMB_NC * charge.q) / (r2 * r);
      ex += strength * dx;
      ey += strength * dy;
      potential += (COULOMB_NC * charge.q) / r;
    }
    return { x: ex, y: ey, magnitude: Math.hypot(ex, ey), potential };
  }

  function drawVectors(colors) {
    const gap = DENSITY_GAPS[state.density - 1];
    const inset = gap * 0.5;
    ctx.save();
    ctx.strokeStyle = colors.fg;
    ctx.fillStyle = colors.fg;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let px = inset; px < size.width; px += gap) {
      for (let py = inset; py < size.height; py += gap) {
        const world = canvasToWorld(px, py);
        if (nearCharge(world.x, world.y, 0.3)) continue;
        const field = fieldAt(world.x, world.y);
        if (field.magnitude < 0.0001) continue;
        const directionX = field.x / field.magnitude;
        const directionY = -field.y / field.magnitude;
        const normalized = clamp((Math.log10(field.magnitude + 0.01) + 1.2) / 3.2, 0.08, 1);
        const length = (5.5 + normalized * gap * 0.48) * state.vectorScale;
        drawArrow(px, py, directionX, directionY, length, Math.min(gap * 0.12, 4), 0.2 + normalized * 0.65);
      }
    }
    ctx.restore();
  }

  function drawArrow(x, y, dx, dy, length, head, alpha = 1) {
    const startX = x - dx * length * 0.4;
    const startY = y - dy * length * 0.4;
    const endX = x + dx * length * 0.6;
    const endY = y + dy * length * 0.6;
    const nx = -dy;
    const ny = dx;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - dx * head * 1.8 + nx * head, endY - dy * head * 1.8 + ny * head);
    ctx.lineTo(endX - dx * head * 1.8 - nx * head, endY - dy * head * 1.8 - ny * head);
    ctx.closePath();
    ctx.fill();
  }

  function drawFieldLines(colors) {
    const sources = state.charges.some((charge) => charge.q > 0)
      ? state.charges.filter((charge) => charge.q > 0)
      : state.charges.filter((charge) => charge.q < 0);
    const direction = sources.some((charge) => charge.q > 0) ? 1 : -1;
    const lineCountBase = [8, 10, 13, 16, 20][state.density - 1];
    ctx.save();
    ctx.strokeStyle = colors.fg;
    ctx.fillStyle = colors.fg;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;

    for (const source of sources) {
      const count = Math.round(lineCountBase * clamp(Math.abs(source.q) / 5, 0.55, 1.5));
      for (let seed = 0; seed < count; seed += 1) {
        const angle = (seed / count) * Math.PI * 2;
        let point = { x: source.x + Math.cos(angle) * 0.23, y: source.y + Math.sin(angle) * 0.23 };
        const points = [point];
        for (let step = 0; step < 650; step += 1) {
          const field = fieldAt(point.x, point.y);
          if (field.magnitude < 0.00001) break;
          const ds = 0.055;
          const vx = (field.x / field.magnitude) * ds * direction;
          const vy = (field.y / field.magnitude) * ds * direction;
          const midpoint = fieldAt(point.x + vx * 0.5, point.y + vy * 0.5);
          if (midpoint.magnitude < 0.00001) break;
          point = {
            x: point.x + (midpoint.x / midpoint.magnitude) * ds * direction,
            y: point.y + (midpoint.y / midpoint.magnitude) * ds * direction,
          };
          points.push(point);
          if (!insideWorld(point.x, point.y, 0.1) || (step > 4 && nearCharge(point.x, point.y, 0.2))) break;
        }
        if (points.length < 4) continue;
        ctx.beginPath();
        points.forEach((p, index) => {
          const pixel = worldToCanvas(p.x, p.y);
          if (index === 0) ctx.moveTo(pixel.x, pixel.y);
          else ctx.lineTo(pixel.x, pixel.y);
        });
        ctx.stroke();

        const arrowIndex = Math.min(points.length - 2, Math.max(2, Math.floor(points.length * 0.58)));
        const a = worldToCanvas(points[arrowIndex - 1].x, points[arrowIndex - 1].y);
        const b = worldToCanvas(points[arrowIndex + 1].x, points[arrowIndex + 1].y);
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        drawArrow((a.x + b.x) / 2, (a.y + b.y) / 2, (b.x - a.x) / length, (b.y - a.y) / length, 6, 2.2, 0.62);
      }
    }
    ctx.restore();
  }

  function drawPotential(colors) {
    const cacheKey = `${size.width}x${size.height}:${colors.dark}:${state.charges.map((c) => `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.q}`).join(";")}`;
    if (potentialCache.key !== cacheKey) {
      const sample = document.createElement("canvas");
      sample.width = Math.max(80, Math.ceil(size.width / 4));
      sample.height = Math.max(60, Math.ceil(size.height / 4));
      const sampleCtx = sample.getContext("2d");
      const image = sampleCtx.createImageData(sample.width, sample.height);
      const base = colors.dark ? [25, 25, 23] : [248, 247, 243];
      const positive = colors.dark ? [194, 112, 91] : [177, 76, 58];
      const negative = colors.dark ? [114, 148, 191] : [70, 101, 143];
      for (let y = 0; y < sample.height; y += 1) {
        for (let x = 0; x < sample.width; x += 1) {
          const world = canvasToWorld((x / (sample.width - 1)) * size.width, (y / (sample.height - 1)) * size.height);
          const value = fieldAt(world.x, world.y).potential;
          const amount = Math.tanh((Math.abs(value) * state.vectorScale) / 24) * 0.52;
          const target = value >= 0 ? positive : negative;
          const index = (y * sample.width + x) * 4;
          image.data[index] = Math.round(base[0] + (target[0] - base[0]) * amount);
          image.data[index + 1] = Math.round(base[1] + (target[1] - base[1]) * amount);
          image.data[index + 2] = Math.round(base[2] + (target[2] - base[2]) * amount);
          image.data[index + 3] = 255;
        }
      }
      sampleCtx.putImageData(image, 0, 0);
      potentialCache = { key: cacheKey, canvas: sample };
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(potentialCache.canvas, 0, 0, size.width, size.height);
    drawPotentialLegend(colors);
    ctx.restore();
  }

  function drawPotentialLegend(colors) {
    const x = size.width - 91;
    const y = 15;
    const gradient = ctx.createLinearGradient(x, 0, x + 76, 0);
    gradient.addColorStop(0, colors.negative);
    gradient.addColorStop(0.5, colors.canvas);
    gradient.addColorStop(1, colors.positive);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, 76, 2);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = colors.faint;
    ctx.font = '9px "Geist Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillText("−V", x, y + 12);
    ctx.textAlign = "right";
    ctx.fillText("+V", x + 76, y + 12);
  }

  function drawCharges(colors) {
    for (const charge of state.charges) {
      const point = worldToCanvas(charge.x, charge.y);
      const selected = charge.id === selectedId;
      const hovered = charge.id === hoverId;
      const radius = 15 + Math.min(4, Math.abs(charge.q) * 0.35);
      ctx.save();
      if (selected || hovered) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = selected ? colors.fg : colors.faint;
        ctx.globalAlpha = selected ? 0.75 : 0.5;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = charge.q < 0 ? colors.negative : charge.q > 0 ? colors.positive : colors.muted;
      ctx.fill();
      ctx.fillStyle = colors.bg;
      ctx.strokeStyle = colors.bg;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(point.x - 4.25, point.y);
      ctx.lineTo(point.x + 4.25, point.y);
      if (charge.q > 0) {
        ctx.moveTo(point.x, point.y - 4.25);
        ctx.lineTo(point.x, point.y + 4.25);
      }
      ctx.stroke();
      if (charge.label) {
        ctx.fillStyle = colors.fg;
        ctx.font = '11px "Geist", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(charge.label, point.x, point.y - radius - 10);
      }
      if (charge.locked) {
        ctx.fillStyle = colors.canvas;
        ctx.beginPath();
        ctx.arc(point.x + radius * 0.7, point.y + radius * 0.7, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colors.fg;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawProbe(colors) {
    if (!insideWorld(pointerWorld.x, pointerWorld.y)) return;
    const point = worldToCanvas(pointerWorld.x, pointerWorld.y);
    const field = fieldAt(pointerWorld.x, pointerWorld.y);
    if (!Number.isFinite(field.magnitude)) return;
    ctx.save();
    ctx.strokeStyle = colors.faint;
    ctx.fillStyle = colors.fg;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    if (field.magnitude > 0.001 && !nearCharge(pointerWorld.x, pointerWorld.y, 0.22)) {
      drawArrow(point.x, point.y, field.x / field.magnitude, -field.y / field.magnitude, 18, 3, 0.75);
    }
    ctx.restore();
  }

  function worldToCanvas(x, y) {
    return {
      x: (x / WORLD_WIDTH + 0.5) * size.width,
      y: (0.5 - y / size.worldHeight) * size.height,
    };
  }

  function canvasToWorld(x, y) {
    return {
      x: (x / size.width - 0.5) * WORLD_WIDTH,
      y: (0.5 - y / size.height) * size.worldHeight,
    };
  }

  function eventToWorld(event) {
    const rect = canvas.getBoundingClientRect();
    return canvasToWorld(event.clientX - rect.left, event.clientY - rect.top);
  }

  function hitCharge(world) {
    const hitRadius = 26 / (size.width / WORLD_WIDTH);
    let closest = null;
    let closestDistance = Infinity;
    for (const charge of state.charges) {
      const distance = Math.hypot(world.x - charge.x, world.y - charge.y);
      if (distance < hitRadius && distance < closestDistance) {
        closest = charge;
        closestDistance = distance;
      }
    }
    return closest;
  }

  function nearCharge(x, y, radius) {
    return state.charges.some((charge) => Math.hypot(x - charge.x, y - charge.y) < radius);
  }

  function insideWorld(x, y, margin = 0) {
    return x >= -WORLD_WIDTH / 2 - margin && x <= WORLD_WIDTH / 2 + margin && y >= -size.worldHeight / 2 - margin && y <= size.worldHeight / 2 + margin;
  }

  function selectCharge(id) {
    selectedId = id;
    const charge = selectedCharge();
    inspector.hidden = !charge;
    if (charge) syncInspector(charge);
    requestDraw();
  }

  function selectedCharge() {
    return state.charges.find((charge) => charge.id === selectedId) || null;
  }

  function addCharge(world, q) {
    const charge = {
      id: chargeCounter++,
      x: clamp(world.x, -WORLD_WIDTH / 2 + 0.25, WORLD_WIDTH / 2 - 0.25),
      y: clamp(world.y, -size.worldHeight / 2 + 0.25, size.worldHeight / 2 - 0.25),
      q,
      label: "",
      locked: false,
    };
    state.charges.push(charge);
    state.sceneName = "Custom";
    selectCharge(charge.id);
    setTool("select");
    invalidatePotential();
    updateSceneSummary();
    commitHistory();
    requestDraw();
  }

  function deleteSelected() {
    const charge = selectedCharge();
    if (!charge) return;
    state.charges = state.charges.filter((item) => item.id !== charge.id);
    selectedId = null;
    inspector.hidden = true;
    state.sceneName = "Custom";
    invalidatePotential();
    updateSceneSummary();
    commitHistory();
    requestDraw();
    showToast("Charge removed");
  }

  function setTool(nextTool) {
    tool = nextTool;
    canvasWrap.dataset.tool = tool;
    document.querySelectorAll("[data-tool]").forEach((button) => {
      const active = button.dataset.tool === tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (tool !== "select") selectCharge(null);
    const sign = tool === "positive" ? "positive" : "negative";
    canvasHint.querySelector(".hint-icon").textContent = tool === "negative" ? "−" : "+";
    canvasHint.querySelector("span:last-child").textContent = `Click to place a ${sign} charge`;
    canvasHint.classList.toggle("is-visible", tool !== "select");
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelector("#display-description").textContent = VIEW_DESCRIPTIONS[view];
    const densityControl = document.querySelector("#density").closest("label");
    const scaleControl = document.querySelector("#vector-scale").closest("label");
    densityControl.hidden = view === "potential";
    scaleControl.hidden = view === "lines";
    document.querySelector("#scale-label").textContent = view === "potential" ? "Contrast" : "Scale";
    document.querySelector("#vector-scale").setAttribute("aria-label", view === "potential" ? "Potential contrast" : "Vector scale");
    persist();
    requestDraw();
  }

  function applyPreset(name) {
    const labels = { dipole: "Dipole", like: "Like charges", capacitor: "Capacitor", quadrupole: "Quadrupole" };
    state.charges = presetCharges(name);
    state.sceneName = labels[name];
    selectedId = null;
    inspector.hidden = true;
    setTool("select");
    invalidatePotential();
    updateSceneSummary();
    commitHistory();
    requestDraw();
    showToast(`${labels[name]} loaded`);
  }

  function updateSceneSummary() {
    const count = state.charges.length;
    sceneSummary.textContent = `${state.sceneName} · ${count} ${count === 1 ? "charge" : "charges"}`;
  }

  function updateUi() {
    updateSceneSummary();
    setView(state.view);
    document.querySelector("#density").value = state.density;
    document.querySelector("#density-output").textContent = DENSITY_NAMES[state.density - 1];
    document.querySelector("#vector-scale").value = Math.round(state.vectorScale * 100);
    document.querySelector("#scale-output").textContent = `${state.vectorScale.toFixed(1)}×`;
  }

  function syncInspector(charge) {
    document.querySelector("#selected-name").textContent = charge.q < 0 ? "Negative charge" : charge.q > 0 ? "Positive charge" : "Neutral point";
    document.querySelector("#charge-label").value = charge.label || "";
    document.querySelector("#charge-value").value = formatInput(charge.q);
    document.querySelector("#charge-x").value = formatInput(charge.x);
    document.querySelector("#charge-y").value = formatInput(charge.y);
    document.querySelector("#charge-locked").checked = Boolean(charge.locked);
  }

  function bindInspectorInput(selector, key, options = {}) {
    const input = document.querySelector(selector);
    input.addEventListener(options.text ? "input" : "change", () => {
      const charge = selectedCharge();
      if (!charge) return;
      if (options.text) {
        charge[key] = input.value;
      } else {
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) return;
        charge[key] = options.clamp ? options.clamp(parsed) : parsed;
      }
      state.sceneName = "Custom";
      invalidatePotential();
      updateSceneSummary();
      if (key === "q") syncInspector(charge);
      requestDraw();
    });
    input.addEventListener("change", () => {
      commitHistory();
    });
  }

  function bindEvents() {
    document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset)));

    document.querySelector("#undo").addEventListener("click", undo);
    document.querySelector("#redo").addEventListener("click", redo);
    document.querySelector("#clear").addEventListener("click", () => {
      if (!state.charges.length) return;
      state.charges = [];
      state.sceneName = "Empty field";
      selectedId = null;
      inspector.hidden = true;
      invalidatePotential();
      updateSceneSummary();
      commitHistory();
      requestDraw();
      showToast("Field cleared");
    });
    document.querySelector("#delete-charge").addEventListener("click", deleteSelected);

    const density = document.querySelector("#density");
    density.addEventListener("input", () => {
      state.density = Number(density.value);
      document.querySelector("#density-output").textContent = DENSITY_NAMES[state.density - 1];
      persist();
      requestDraw();
    });
    const vectorScale = document.querySelector("#vector-scale");
    vectorScale.addEventListener("input", () => {
      state.vectorScale = Number(vectorScale.value) / 100;
      document.querySelector("#scale-output").textContent = `${state.vectorScale.toFixed(1)}×`;
      persist();
      if (state.view === "potential") invalidatePotential();
      requestDraw();
    });

    bindInspectorInput("#charge-label", "label", { text: true });
    bindInspectorInput("#charge-value", "q", { clamp: (value) => clamp(value, -20, 20) });
    bindInspectorInput("#charge-x", "x", { clamp: (value) => clamp(value, -WORLD_WIDTH / 2 + 0.2, WORLD_WIDTH / 2 - 0.2) });
    bindInspectorInput("#charge-y", "y", { clamp: (value) => clamp(value, -size.worldHeight / 2 + 0.2, size.worldHeight / 2 - 0.2) });
    document.querySelector("#charge-locked").addEventListener("change", (event) => {
      const charge = selectedCharge();
      if (!charge) return;
      charge.locked = event.target.checked;
      state.sceneName = "Custom";
      updateSceneSummary();
      commitHistory();
      requestDraw();
    });

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", () => {
      if (!drag) {
        pointerWorld = null;
        hoverId = null;
        requestDraw();
      }
    });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    const help = document.querySelector("#shortcut-help");
    const popover = document.querySelector("#shortcut-popover");
    help.addEventListener("click", () => {
      const open = popover.hidden;
      popover.hidden = !open;
      help.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("pointerdown", (event) => {
      if (!popover.hidden && !popover.contains(event.target) && event.target !== help) {
        popover.hidden = true;
        help.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", onKeyDown);
    document.querySelector("#theme-toggle").addEventListener("click", toggleTheme);
    new ResizeObserver(resizeCanvas).observe(canvasWrap);
    new MutationObserver(() => {
      invalidatePotential();
      requestDraw();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  function onPointerDown(event) {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    const world = eventToWorld(event);
    pointerWorld = world;
    if (tool === "positive" || tool === "negative") {
      addCharge(world, tool === "positive" ? 5 : -5);
      return;
    }

    const charge = hitCharge(world);
    if (!charge) {
      selectCharge(null);
      return;
    }
    selectCharge(charge.id);
    if (charge.locked) {
      showToast("This charge is locked");
      return;
    }
    drag = { id: charge.id, offsetX: charge.x - world.x, offsetY: charge.y - world.y, moved: false };
    canvas.setPointerCapture(event.pointerId);
    canvasWrap.classList.add("is-dragging");
  }

  function onPointerMove(event) {
    const world = eventToWorld(event);
    pointerWorld = world;
    const field = fieldAt(world.x, world.y);
    probePosition.textContent = `x ${signed(world.x)} · y ${signed(world.y)} m`;
    probeField.textContent = `E ${formatMagnitude(field.magnitude)} N/C`;
    if (drag) {
      const charge = state.charges.find((item) => item.id === drag.id);
      if (charge) {
        charge.x = clamp(world.x + drag.offsetX, -WORLD_WIDTH / 2 + 0.2, WORLD_WIDTH / 2 - 0.2);
        charge.y = clamp(world.y + drag.offsetY, -size.worldHeight / 2 + 0.2, size.worldHeight / 2 - 0.2);
        drag.moved = true;
        state.sceneName = "Custom";
        invalidatePotential();
        syncInspector(charge);
        updateSceneSummary();
      }
    } else {
      hoverId = hitCharge(world)?.id || null;
    }
    requestDraw();
  }

  function onPointerUp(event) {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    canvasWrap.classList.remove("is-dragging");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (moved) commitHistory();
  }

  function onKeyDown(event) {
    const tag = event.target.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA";
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (typing) return;
    const key = event.key.toLowerCase();
    if (key === "v" || key === "escape") setTool("select");
    if (key === "p") setTool("positive");
    if (key === "n") setTool("negative");
    if ((key === "backspace" || key === "delete") && selectedId !== null) {
      event.preventDefault();
      deleteSelected();
    }
    const charge = selectedCharge();
    if (charge && !charge.locked && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
      event.preventDefault();
      const amount = event.shiftKey ? 0.5 : 0.1;
      if (key === "arrowleft") charge.x -= amount;
      if (key === "arrowright") charge.x += amount;
      if (key === "arrowup") charge.y += amount;
      if (key === "arrowdown") charge.y -= amount;
      charge.x = clamp(charge.x, -WORLD_WIDTH / 2 + 0.2, WORLD_WIDTH / 2 - 0.2);
      charge.y = clamp(charge.y, -size.worldHeight / 2 + 0.2, size.worldHeight / 2 - 0.2);
      state.sceneName = "Custom";
      invalidatePotential();
      syncInspector(charge);
      updateSceneSummary();
      commitHistory();
      requestDraw();
    }
    if ((key === "enter" || key === " ") && event.target === canvas && tool !== "select") {
      event.preventDefault();
      addCharge({ x: 0, y: 0 }, tool === "positive" ? 5 : -5);
    }
  }

  function toggleTheme(event) {
    const nextDark = !document.documentElement.classList.contains("dark");
    const apply = () => {
      document.documentElement.classList.toggle("dark", nextDark);
      document.documentElement.style.colorScheme = nextDark ? "dark" : "light";
      document.querySelector("#theme-toggle").setAttribute("aria-label", `Switch to ${nextDark ? "light" : "dark"} theme`);
      try {
        localStorage.setItem("field-theme", nextDark ? "dark" : "light");
      } catch (_) {}
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduced) {
      apply();
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.dataset.viewTransition = "";
    const transition = document.startViewTransition(apply);
    transition.finished.finally(() => delete document.documentElement.dataset.viewTransition);
    transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  }

  function invalidatePotential() {
    potentialCache.key = "";
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
  }

  function formatMagnitude(value) {
    if (!Number.isFinite(value)) return "∞";
    if (value === 0) return "0.00";
    if (value >= 10000 || value < 0.01) return value.toExponential(1);
    if (value >= 100) return value.toFixed(0);
    if (value >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function signed(value) {
    const rounded = Math.abs(value) < 0.05 ? 0 : value;
    return rounded.toFixed(1);
  }

  function formatInput(value) {
    return Number(value.toFixed(2)).toString();
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  updateUi();
  updateHistoryButtons();
  setTool("select");
  document.querySelector("#theme-toggle").setAttribute(
    "aria-label",
    `Switch to ${document.documentElement.classList.contains("dark") ? "light" : "dark"} theme`,
  );
  bindEvents();
  resizeCanvas();
})();
