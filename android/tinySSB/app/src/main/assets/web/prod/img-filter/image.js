"use strict";

const imgLoader = document.getElementById("img-loader");
const customBtn = document.getElementById("img-custom");

let imgUrl = null;
let originalSize = null;

let grayFilter = false;
let blurs = 2;
let colorsFilter = 4;

let isProcessing = false;

let blurHistory = [];
let imgWithoutCF = null;
let imgWithoutCFSet = false;

const STATE = {
    INITIAL: "initial",
    AFTER_FILTER: "after_filter",
    AFTER_MARCHING: "after_marching",
    AFTER_SIMPLIFY: "after_simplify",
    AFTER_SVG: "after_svg",
};

const BUTTONSTATE = {
    BLURU: false,
    BLURD: true,
    SENDI: true,
}

let settings = {
    MAXSCALE: 200,
    BLURSPATIAL: 3,
    BLURRANGE: 40,
    BLURRADIUS: 7,
    COLORS: 4,
    MINCOMPONENTSIZE: 10,
    SIMPLIFICATIONFACTOR: 3,
    CURVETHRESHOLD: 2.0,
}

let currentState = STATE.INITIAL;

let cache = {
    svg: null,
    custom: null,
};

let currentMode = null;

function temp() {
    closeOverlay();
    document.getElementById("image-filter").style.display = "flex";
}

async function b2f_new_image_blob(ref) {
    closeOverlay();
    imgUrl = "https://appassets.androidplatform.net/blobs/" + ref;
    document.getElementById("image-filter").style.display = "flex";

    await press_svg();
    document.getElementById("first-filter").style.display = "flex";
}

function close_image() {
    document.getElementById("image-filter").style.display = "none";
    document.getElementById("colors").disabled = false;
    document.getElementById("finish").disabled = false;
    document.getElementById("color-cont").style.opacity = "100";
    cache.svg = null;
    cache.custom = null;

    grayFilter = false;
    blurs = 2;
    colorsFilter = 4;

    buttonInitialState();
    blurHistory = [];
    imgWithoutCF = null;
    imgWithoutCFSet = false;
}

async function menu_pick_image() {
    closeOverlay();
    backend('get:media');
}

async function menu_take_picture() {
    closeOverlay();
    backend('get:camera');
}

async function applyFilter(filter, params, updateCache = true) {
    if (!imageData) return;

    imageData = filter(imageData, params);
    await set_size_text(mainSizeText, canvas);
    render(imageData);

    if (currentMode === "custom" && updateCache) {
        cache.custom = saveState();
    }
}
async function applyMarchingSquares() {
    if (!imageData) return;

    componentPoints = await marching_squares(imageData);

    if (currentMode === "custom") {
        cache.custom = saveState();
    }
}

function applyContourSimplification(epsilon) {
    if (!componentPoints) return;

    simplifiedComponentPoints = simplify_contours(componentPoints, epsilon);
    draw_contours(simplifiedComponentPoints, ctx);
    //console.log(count_component_points(simplifiedComponentPoints));
    //console.log(count_total_points(simplifiedComponentPoints));

    if (currentMode === "custom") {
        cache.custom = saveState();
    }

}

function generateSVG(curveTolerance){
    if (!componentPoints) return;
    let svgString;
    if(!simplifiedComponentPoints){
        svgString = build_svg(componentPoints, curveTolerance);
    } else {
        svgString = build_svg(simplifiedComponentPoints, curveTolerance);
    }

    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgString);

    if (currentMode === "custom") {
        cache.custom = saveState();
    }
}

async function resetImage() {
    cache.custom = null;
    await loadImg(settings.MAXSCALE);
    await apply2blurs();
    colorsFilter = 4;
    grayFilter = false;

    document.getElementById("gray-switch").checked = grayFilter;
    document.getElementById("colors").value = colorsFilter;
    document.getElementById("first-filter").style.display = "flex";
    document.getElementById("second-filter").style.display = "none";
    document.getElementById("colors").disabled = false;
    document.getElementById("finish").disabled = false;
    document.getElementById("color-cont").style.opacity = "100";


    buttonInitialState();

    imgWithoutCF = null;
    imgWithoutCFSet = false;
}

async function requiredFilters() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        await applyFilter(merge_small_components, [settings.MINCOMPONENTSIZE]);
        await applyMarchingSquares();
        applyContourSimplification(settings.SIMPLIFICATIONFACTOR);
        generateSVG(settings.CURVETHRESHOLD);

        BUTTONSTATE.SENDI = false;

        updateButton();
    } finally {
        isProcessing = false;
    }
    document.getElementById("colors").disabled = true;
    document.getElementById("finish").disabled = true;
    document.getElementById("color-cont").style.opacity = "0";
}

function saveState() {
    return structuredClone({
        imageData,
        componentPoints,
        simplifiedComponentPoints,
        finalSVG,
        payloadSVG,
        size,
        currentState,
    });
}

function restoreState(state) {
    imageData = state.imageData;
    componentPoints = state.componentPoints;
    simplifiedComponentPoints = state.simplifiedComponentPoints;
    finalSVG = state.finalSVG;
    payloadSVG = state.payloadSVG;
    size = state.size;
    currentState = state.currentState;

    canvas.width = imageData.width;
    canvas.height = imageData.height;

    if (finalSVG) {
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = "data:image/svg+xml;base64," + btoa(finalSVG);
    } else if (simplifiedComponentPoints) {
        draw_contours(simplifiedComponentPoints, ctx);
    } else if (componentPoints) {
        draw_contours(componentPoints,ctx);
    } else {
        render(imageData);
    }

    set_size_text_cached(mainSizeText, size);
}

async function press_svg() {
    currentMode = "svg";
    document.getElementById("img-svg").style.background = "var(--activeCol)";
    customBtn.style.background = "var(--passiveCol)";
    document.getElementById("custom-buttons-area").style.display = "none";
    document.getElementById("send-img").disabled = false;


    if (cache.svg) {
        restoreState(cache.svg);
        return;
    }

    await loadImg(settings.MAXSCALE);
    await apply_preset_filters();
    cache.svg = saveState();
}

async function apply_preset_filters() {
    canvas.style.display = "none";
    imgLoader.style.display = "block";
    customBtn.disabled = true;
    let previousSize = await getCanvasFileSize(canvas);
    const minReduction = 0.08;
    const maxIterations = 10;

    for (let i = 0; i < maxIterations; i++) {
        await applyFilter(bilateral_blur, [settings.BLURSPATIAL, settings.BLURRANGE, settings.BLURRADIUS]);

        const currentSize = await getCanvasFileSize(canvas);

        const reduction = (previousSize - currentSize) / previousSize;

        /*
        console.log(
            `Iteration ${i + 1}: ${previousSize} -> ${currentSize} (${(reduction * 100).toFixed(2)}%)`
        );
        */

        if (reduction < minReduction) {
            break;
        }

        previousSize = currentSize;
    }
    await applyFilter(quantize_color, [settings.COLORS]);
    await applyFilter(merge_small_components, [settings.MINCOMPONENTSIZE]);
    await applyMarchingSquares();
    applyContourSimplification(settings.SIMPLIFICATIONFACTOR);
    generateSVG(settings.CURVETHRESHOLD);
    canvas.style.display = "block";
    imgLoader.style.display = "none";
    customBtn.disabled = false;
}

async function press_custom() {
    currentMode = "custom";
    document.getElementById("img-svg").style.background = "var(--passiveCol)";
    customBtn.style.background = "var(--activeCol)";
    document.getElementById("custom-buttons-area").style.display = "flex";

    if (cache.custom) {
        restoreState(cache.custom);
        return;
    }

    await loadImg(settings.MAXSCALE);
    await apply2blurs();

    cache.custom = saveState();
    updateButton();
}

async function stepBlur(number) {
    if (isProcessing) return;
    isProcessing = true;

    try {
        if (number === 1) {
            if (blurs === 10) return;
            blurHistory.push(cloneImageData(imageData));
            await applyFilter(bilateral_blur, [settings.BLURSPATIAL, settings.BLURRANGE, settings.BLURRADIUS]);
            blurs++;
        } else {
            if (blurs === 2) {
                return;
            }
            imageData = blurHistory.pop();
            blurs--;

            await set_size_text(mainSizeText, canvas);
            render(imageData);
            if (currentMode === "custom") {
                cache.custom = saveState();
            }
        }
        BUTTONSTATE.BLURU = blurs === 10;
        BUTTONSTATE.BLURD = blurs === 2
        updateButton();
    } finally {
        isProcessing =false;
    }
}

async function applyGray(el) {
    if (isProcessing) return;
    isProcessing = true;

    try {
        grayFilter = el;
        await rebuildFromScratch();
    } finally {
        isProcessing = false;
    }
}

async function applyColor(number) {
    if (isProcessing) return;
    isProcessing = true;

    try {
        if (!imgWithoutCFSet) {
            imgWithoutCF = cloneImageData(imageData);
            imgWithoutCFSet = true;
        }
        imageData = cloneImageData(imgWithoutCF);
        colorsFilter = number;
        await applyFilter(quantize_color, [colorsFilter]);
    } finally {
        isProcessing = false;
    }
    BUTTONSTATE.BLURD = true;
    BUTTONSTATE.BLURU = true;

    updateButton();
}

async function getImg() {
    switch(currentMode) {
        case "svg": {
            if (!cache.svg.finalSVG) break;
            return cache.svg.payloadSVG;
        }
        case "custom": {
            if (!cache.custom.finalSVG) break;
            return cache.custom.payloadSVG;
        }
        default:
            return null;
    }
}

async function chat_sendImg() {
    buttonInitialState();
    document.getElementById("colors").disabled = false;
    document.getElementById("finish").disabled = false;
    document.getElementById("color-cont").style.opacity = "100";
    blurHistory = [];
    blurs = 2;
    imgWithoutCF = null;
    imgWithoutCFSet = false;

    var img = await getImg()
    if (!img || img.length == 0)
        return;

    launch_snackbar("sending image ...")
    setTimeout(function () { // delay sending (and getting location beforehand), allows snackbar to show

        //add geolocation to message if enabled.
        if (Android.isGeoLocationEnabled() == "true"){ //ony add if enabled
            var plusCode = Android.getCurrentLocationAsPlusCode();
            if (plusCode != null && plusCode.length > 0) //check if we actually received a location
                img = "pfx:loc/plus," + plusCode + "|" + img;
        }

        // send to backend
        var ch = tremola.chats[curr_chat]
        if (!(ch.timeline instanceof Timeline))
            ch.timeline = Timeline.fromJSON(ch.timeline)
        let tips = JSON.stringify(ch.timeline.get_tips())
        if (curr_chat == "ALL") {
            var cmd = `publ:post ${tips} ` + btoa(img) + " null"; // + recps
            // console.log(cmd)
            backend(cmd);
        } else {
            var recps = tremola.chats[curr_chat].members.join(' ');
            var cmd = `priv:post ${tips} ` + btoa(img) + " null " + recps;
            backend(cmd);
        }

        closeOverlay();
        // setTimeout(function () { // let image rendering (fetching size) take place before we scroll
        let c = document.getElementById('core');
        c.scrollTop = c.scrollHeight;
        // }, 100);

        // close image
        close_image();
    }, 100);
}

function buttonInitialState() {
    BUTTONSTATE.BLURD = true;
    BUTTONSTATE.BLURU = false;
    BUTTONSTATE.SENDI = true;
    document.getElementById("second-filter").style.display = "none";
    document.getElementById("colors").value = 4;

    updateButton();
}

function updateButton() {
    document.getElementById("blurD").disabled = BUTTONSTATE.BLURD;
    document.getElementById("blurU").disabled = BUTTONSTATE.BLURU;
    document.getElementById("send-img").disabled = BUTTONSTATE.SENDI;
}

async function rebuildFromScratch() {
    await loadImg(settings.MAXSCALE);
    if (grayFilter) {
        await applyFilter(gray_scale, [], false);
    }

    blurHistory = [];
    for (let i = 0; i < blurs; i++) {
        blurHistory.push(cloneImageData(imageData));
        await applyFilter(bilateral_blur, [settings.BLURSPATIAL, settings.BLURRANGE, settings.BLURRADIUS], false);
    }

    if (currentMode === "custom") {
        cache.custom = saveState();
    }
}

function cloneImageData(data) {
    return new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
}

function pressNext() {
    document.getElementById("first-filter").style.display = "none";
    document.getElementById("second-filter").style.display = "flex";
}

async function apply2blurs() {
    blurHistory = [];
    blurs = 2;
    await applyFilter(bilateral_blur, [3, 40, 7], false);
    await applyFilter(bilateral_blur, [3, 40, 7], false);
}