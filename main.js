import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js?module";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js?module";
import RAPIER from "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.12.0/rapier.es.js";
const fileParams = window.DAMP_PARAMS;

if (!fileParams) {
    throw new Error("DAMP_PARAMS not found. Run gen_params.py to create params.js before loading this page.");
}

const canvas = document.getElementById("scene");
if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #scene is required.");
}

const hudElements = {
    m: document.getElementById("hud-m"),
    c: document.getElementById("hud-c"),
    k: document.getElementById("hud-k"),
    omega: document.getElementById("hud-omega"),
    zeta: document.getElementById("hud-zeta"),
};

const paramKeys = ["m", "c", "k", "y0", "v0", "duration"];
const paramInputs = paramKeys.reduce((acc, key) => {
    const el = document.getElementById(`input-${key}`);
    if (!el) {
        throw new Error(`Missing input element for parameter ${key}`);
    }
    acc[key] = el;
    return acc;
}, {});

const applyButton = document.getElementById("applyParams");
const playButton = document.getElementById("playPause");
const resetButton = document.getElementById("reset");
const plotPanel = document.getElementById("plotPanel");
const plotCanvas = document.getElementById("plotCanvas");
const downloadPlotButton = document.getElementById("downloadPlot");

if (!(plotCanvas instanceof HTMLCanvasElement)) {
    throw new Error("Plot canvas not available.");
}

const currentParams = { ...fileParams };
const DEFAULT_DT = Number.isFinite(currentParams.dt) ? currentParams.dt : 0.004;
const DEFAULT_SCALE = Number.isFinite(currentParams.scale) ? currentParams.scale : 25;
currentParams.dt = DEFAULT_DT;
currentParams.scale = DEFAULT_SCALE;

const state = {
    x: currentParams.y0,
    v: currentParams.v0,
    t: 0,
    playing: false,
};

let worldRef = null;
let rigidBodyRef = null;
const plotCtx = plotCanvas.getContext("2d");
if (!plotCtx) {
    throw new Error("Failed to access 2D context for plot canvas.");
}

const formatNumber = (value) => {
    if (!Number.isFinite(value)) {
        return "Kh\u00f4ng x\u00e1c \u0111\u1ecbnh";
    }

    const absVal = Math.abs(value);
    let options;

    if (absVal === 0 || absVal >= 1000) {
        options = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
    } else if (absVal >= 1) {
        options = { minimumFractionDigits: 0, maximumFractionDigits: 4 };
    } else if (absVal >= 1e-3) {
        options = { minimumFractionDigits: 3, maximumFractionDigits: 6 };
    } else {
        options = { minimumFractionDigits: 0, maximumFractionDigits: 8 };
    }

    return value.toLocaleString("vi-VN", options);
};

const computeDerived = (params) => {
    const omegaN = Math.sqrt(params.k / params.m);
    const dampingRatio = params.c / (2 * Math.sqrt(params.k * params.m));
    return { omegaN, dampingRatio };
};

const updateHud = () => {
    const { omegaN, dampingRatio } = computeDerived(currentParams);
    hudElements.m.textContent = `Kh\u1ed1i l\u01b0\u1ee3ng (m) = ${formatNumber(currentParams.m)} kg`;
    hudElements.c.textContent = `H\u1ec7 s\u1ed1 c\u1ea3n (c) = ${formatNumber(currentParams.c)} N\u00b7s/m`;
    hudElements.k.textContent = `\u0110\u1ed9 c\u1ee9ng l\u00f2 xo (k) = ${formatNumber(currentParams.k)} N/m`;
    hudElements.omega.textContent = `T\u1ea7n s\u1ed1 ri\u00eang (\u03c9\u2099) = ${formatNumber(omegaN)} rad/s`;
    hudElements.zeta.textContent = `T\u1ef7 s\u1ed1 c\u1ea3n (\u03b6) = ${formatNumber(dampingRatio)}`;
};

const populateInputs = () => {
    paramKeys.forEach((key) => {
        const el = paramInputs[key];
        el.value = String(currentParams[key]);
    });
};

const updatePlayButton = () => {
    playButton.textContent = state.playing ? "Pause" : "Play";
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const readParamsFromInputs = () => {
    const parsed = {};
    for (const key of paramKeys) {
        const value = Number(paramInputs[key].value);
        if (!Number.isFinite(value)) {
            throw new Error(`Parameter "${key}" is not a valid number.`);
        }
        if (["m", "k", "duration"].includes(key) && value <= 0) {
            throw new Error(`Parameter "${key}" must be greater than zero.`);
        }
        if (key === "c" && value < 0) {
            throw new Error(`Parameter "c" must be non-negative.`);
        }
        parsed[key] = value;
    }
    return parsed;
};

const springSegments = 60;
const springCoils = 7;
const springRadius = 0.22;

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
});
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0b0d10);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d10);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(6, 4, 10);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1.5, 0);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(6, 10, 6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x6ca8ff, 0.4);
rimLight.position.set(-6, 8, -4);
scene.add(rimLight);

const grid = new THREE.GridHelper(20, 20, 0x39424e, 0x242730);
grid.position.y = -2;
scene.add(grid);

const axes = new THREE.AxesHelper(2);
axes.position.set(-5, -2, -5);
scene.add(axes);

const supportMaterial = new THREE.MeshStandardMaterial({
    color: 0x5f6a7d,
    metalness: 0.2,
    roughness: 0.6,
});

const support = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), supportMaterial);
support.position.set(0, 2.6, 0);
scene.add(support);

const anchor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 20), supportMaterial);
anchor.position.set(0, 2.4, 0);
scene.add(anchor);

const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x4eb1ff,
    roughness: 0.4,
    metalness: 0.1,
});

const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bodyMaterial);
bodyMesh.castShadow = true;
scene.add(bodyMesh);

const bodyEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(bodyMesh.geometry),
    new THREE.LineBasicMaterial({ color: 0xfafbff, linewidth: 1 }),
);
bodyMesh.add(bodyEdges);

const springGeometry = new THREE.BufferGeometry();
const springPositions = new Float32Array((springSegments + 1) * 3);
springGeometry.setAttribute("position", new THREE.BufferAttribute(springPositions, 3));
const springMaterial = new THREE.LineBasicMaterial({ color: 0xc0d3ff });
const spring = new THREE.Line(springGeometry, springMaterial);
spring.position.set(0, 2.4, 0);
scene.add(spring);

const anchorHeight = 2.4;

const updateSpring = (length) => {
    const positions = spring.geometry.attributes.position;
    const array = positions.array;
    for (let i = 0; i <= springSegments; i += 1) {
        const t = i / springSegments;
        const angle = t * springCoils * Math.PI * 2;
        const radius = springRadius;
        const y = t * length;
        array[i * 3] = Math.cos(angle) * radius;
        array[i * 3 + 1] = y;
        array[i * 3 + 2] = Math.sin(angle) * radius;
    }
    positions.needsUpdate = true;
    spring.geometry.computeBoundingSphere();
};

const resetSimulation = ({ resume = false } = {}) => {
    state.x = currentParams.y0;
    state.v = currentParams.v0;
    state.t = 0;
    state.playing = resume;
    updatePlayButton();
    if (rigidBodyRef) {
        rigidBodyRef.setTranslation(
            { x: 0, y: anchorHeight + state.x * currentParams.scale, z: 0 },
            true,
        );
        rigidBodyRef.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    updateSpring(state.x * currentParams.scale);
};

const computeTrajectory = (params) => {
    if (params.dt <= 0) {
        throw new Error("dt must be positive.");
    }
    if (params.duration <= 0) {
        throw new Error("duration must be positive.");
    }
    const steps = Math.max(1, Math.ceil(params.duration / params.dt));
    const times = new Array(steps + 1);
    const xs = new Array(steps + 1);
    const vs = new Array(steps + 1);
    let x = params.y0;
    let v = params.v0;
    const invM = 1 / params.m;
    const accel = (px, pv) => -((params.c * pv) + (params.k * px)) * invM;

    times[0] = 0;
    xs[0] = x;
    vs[0] = v;

    for (let i = 0; i < steps; i += 1) {
        const a1 = accel(x, v);
        const xPredict = x + params.dt * v;
        const vPredict = v + params.dt * a1;
        const a2 = accel(xPredict, vPredict);
        x += params.dt * 0.5 * (v + vPredict);
        v += params.dt * 0.5 * (a1 + a2);

        const tNext = Math.min((i + 1) * params.dt, params.duration);
        times[i + 1] = tNext;
        xs[i + 1] = x;
        vs[i + 1] = v;
    }

    return { times, xs, vs };
};

const renderPlot = (times, xs, vs, width, height, minY, maxY) => {
    plotCtx.clearRect(0, 0, width, height);

    const padding = { top: 20, right: 20, bottom: 30, left: 45 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const minX = 0;
    const maxX = times[times.length - 1] ?? 1;
    const rangeY = maxY - minY || 1;

    const toScreenX = (t) =>
        padding.left + ((t - minX) / (maxX - minX || 1)) * plotWidth;
    const toScreenY = (y) =>
        padding.top + (1 - (y - minY) / rangeY) * plotHeight;

    plotCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    plotCtx.lineWidth = 1;
    plotCtx.strokeRect(padding.left, padding.top, plotWidth, plotHeight);

    reportAxis(plotCtx, padding, plotWidth, plotHeight, minX, maxX, minY, maxY);

    drawCurve(plotCtx, times, xs, toScreenX, toScreenY, "#4eb1ff");
    drawCurve(plotCtx, times, vs, toScreenX, toScreenY, "#ff9f40");

    plotCtx.fillStyle = "#f5f8ff";
    plotCtx.font = "12px 'Segoe UI', sans-serif";
    plotCtx.fillText("Time [s]", width / 2 - 24, height - 8);
    plotCtx.save();
    plotCtx.translate(12, height / 2 + 40);
    plotCtx.rotate(-Math.PI / 2);
    plotCtx.fillText("Response", 0, 0);
    plotCtx.restore();

    const legendX = padding.left + 12;
    const legendY = padding.top + 12;
    plotCtx.fillStyle = "#4eb1ff";
    plotCtx.fillRect(legendX, legendY, 12, 3);
    plotCtx.fillStyle = "#f5f8ff";
    plotCtx.fillText("x(t) [m]", legendX + 18, legendY + 4);
    plotCtx.fillStyle = "#ff9f40";
    plotCtx.fillRect(legendX, legendY + 18, 12, 3);
    plotCtx.fillStyle = "#f5f8ff";
    plotCtx.fillText("v(t) [m/s]", legendX + 18, legendY + 22);
};

const drawCurve = (ctx, times, values, toScreenX, toScreenY, color) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    times.forEach((t, idx) => {
        const x = toScreenX(t);
        const y = toScreenY(values[idx]);
        if (idx === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
};

const reportAxis = (ctx, padding, plotWidth, plotHeight, minX, maxX, minY, maxY) => {
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#cbd5f5";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    const tickCount = 5;
    for (let i = 0; i <= tickCount; i += 1) {
        const t = minX + ((maxX - minX) * i) / tickCount;
        const x = padding.left + (plotWidth * i) / tickCount;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + plotHeight);
        ctx.stroke();
        ctx.fillText(t.toFixed(1), x - 10, padding.top + plotHeight + 16);
    }

    for (let i = 0; i <= tickCount; i += 1) {
        const yValue = minY + ((maxY - minY) * i) / tickCount;
        const y = padding.top + (plotHeight * (tickCount - i)) / tickCount;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + plotWidth, y);
        ctx.stroke();
        ctx.fillText(yValue.toExponential(2), 6, y + 4);
    }

    ctx.setLineDash([]);
};

const updatePlot = () => {
    try {
        const cssWidth = plotCanvas.clientWidth || 320;
        const cssHeight = plotCanvas.clientHeight || 220;
        const dpr = window.devicePixelRatio || 1;
        plotCanvas.width = cssWidth * dpr;
        plotCanvas.height = cssHeight * dpr;
        plotCtx.setTransform(1, 0, 0, 1, 0, 0);
        plotCtx.scale(dpr, dpr);

        const { times, xs, vs } = computeTrajectory(currentParams);
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < xs.length; i += 1) {
            const xVal = xs[i];
            const vVal = vs[i];
            if (xVal < minY) minY = xVal;
            if (xVal > maxY) maxY = xVal;
            if (vVal < minY) minY = vVal;
            if (vVal > maxY) maxY = vVal;
        }
        if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
            minY = -1;
            maxY = 1;
        } else if (minY === maxY) {
            const offset = Math.max(Math.abs(minY) * 0.1, 1e-6);
            minY -= offset;
            maxY += offset;
        }

        renderPlot(times, xs, vs, cssWidth, cssHeight, minY, maxY);
        plotPanel.classList.add("visible");
    } catch (error) {
        console.error(error);
        alert(error.message);
    }
};

const syncVisual = (body) => {
    const translation = body.translation();
    bodyMesh.position.set(translation.x, translation.y, translation.z);
};

const resizeRenderer = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
};

window.addEventListener("resize", resizeRenderer);

const rapierReady = RAPIER.init();

const initWorld = async () => {
    await rapierReady;
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const initialY = anchorHeight + currentParams.y0 * currentParams.scale;
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, initialY, 0);
    const rigidBody = world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    world.createCollider(colliderDesc, rigidBody);
    return { world, rigidBody };
};

const applyParameters = ({ resume = true } = {}) => {
    try {
        const parsed = readParamsFromInputs();
        Object.assign(currentParams, parsed);
        updateHud();
        resetSimulation({ resume });
        updatePlot();
    } catch (error) {
        console.error(error);
        alert(error.message);
    }
};

playButton.addEventListener("click", () => {
    state.playing = !state.playing;
    updatePlayButton();
});

resetButton.addEventListener("click", () => {
    resetSimulation({ resume: false });
    updatePlot();
});

applyButton.addEventListener("click", () => {
    applyParameters({ resume: true });
});

document.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
        event.preventDefault();
        playButton.click();
    }
});

downloadPlotButton.addEventListener("click", () => {
    const dataUrl = plotCanvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "damped-response.png";
    link.click();
});

populateInputs();
updateHud();
updatePlayButton();

const start = async () => {
    const { world, rigidBody } = await initWorld();
    worldRef = world;
    rigidBodyRef = rigidBody;
    resizeRenderer();
    resetSimulation({ resume: false });

    const clock = new THREE.Clock();
    const dtMin = 1 / 120;
    const dtMax = 1 / 30;

    renderer.setAnimationLoop(() => {
        const elapsed = clock.getDelta();
        if (state.playing) {
            const dtSim = clamp(elapsed, dtMin, dtMax);
            const accel = -(currentParams.c / currentParams.m) * state.v - (currentParams.k / currentParams.m) * state.x;
            state.v += accel * dtSim;
            state.x += state.v * dtSim;
            state.t += dtSim;

            if (state.t >= currentParams.duration) {
                state.playing = false;
                updatePlayButton();
            }
        }

        if (rigidBodyRef) {
            const yScene = anchorHeight + state.x * currentParams.scale;
            rigidBodyRef.setTranslation({ x: 0, y: yScene, z: 0 }, true);
        }

        worldRef.step();
        if (rigidBodyRef) {
            syncVisual(rigidBodyRef);
        }
        updateSpring(state.x * currentParams.scale);

        controls.update();
        renderer.render(scene, camera);
    });
};

start().catch((error) => {
    console.error(error);
});
