"use strict";

let imgUrl = null;
let originalSize = null;
let resolution = 200;

let grayFilter = false;
let blurs = 0;
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
    COLORB: true,
    GRAYB: false,
    BLURU: false,
    BLURD: true,
    REQUIREDF: true,
    SENDI: true,
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
}

function close_image() {
    document.getElementById("image-filter").style.display = "none";
    cache.svg = null;
    cache.custom = null;

    grayFilter = false;
    blurs = 0;
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

function applyCountourSimplification(epsilon) {
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
    await loadImg(resolution);
    blurs = 0;
    colorsFilter = 4;
    grayFilter = false;

    document.getElementById("gray-switch").checked = grayFilter;
    document.getElementById("colors").value = colorsFilter;

    buttonInitialState();
    blurHistory = [];
    imgWithoutCF = null;
    imgWithoutCFSet = false;
}

async function requiredFilters() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        await applyFilter(merge_small_components, [10]);
        await applyMarchingSquares();
        applyCountourSimplification(3);
        generateSVG(2.0);

        BUTTONSTATE.COLORB = true;
        BUTTONSTATE.SENDI = false;
        BUTTONSTATE.REQUIREDF = true;

        updateButton();
    } finally {
        isProcessing = false;
    }
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
    document.getElementById("img-custom").style.background = "var(--passiveCol)";
    document.getElementById("custom-buttons-area").style.display = "none";
    document.getElementById("send-img").disabled = false;


    if (cache.svg) {
        restoreState(cache.svg);
        return;
    }

    await loadImg(resolution);
    await apply_preset_filters();
    cache.svg = saveState();
}

async function apply_preset_filters() {
    let previousSize = await getCanvasFileSize(canvas);
    const minReduction = 0.08;
    const maxIterations = 10;

    for (let i = 0; i < maxIterations; i++) {
        await applyFilter(bilateral_blur, [3, 40, 7]);

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
    await applyFilter(quantize_color, [4]);
    await applyFilter(merge_small_components, [10]);
    await applyMarchingSquares();
    applyCountourSimplification(3);
    generateSVG(2.0);
}

async function press_custom() {
    currentMode = "custom";
    document.getElementById("img-svg").style.background = "var(--passiveCol)";
    document.getElementById("img-custom").style.background = "var(--activeCol)";
    document.getElementById("custom-buttons-area").style.display = "flex";

    document.getElementById("required-filters").disabled = true;

    if (cache.custom) {
        restoreState(cache.custom);
        return;
    }

    await loadImg(resolution);

    cache.custom = saveState();
    updateButton();
}

async function stepBlur(number) {
    const t0 = performance.now();
    if (isProcessing) return;
    isProcessing = true;

    try {
        if (number === 1) {
            if (blurs === 10) return;
            blurHistory.push(cloneImageData(imageData));
            await applyFilter(bilateral_blur, [3, 40, 7]);
            blurs++;

            BUTTONSTATE.BLURD = blurs === 10;
            updateButton();
        } else {
            if (blurs === 0) {
                return;
            }
            imageData = blurHistory.pop();
            blurs--;

            BUTTONSTATE.BLURU = blurs === 0
            updateButton();

            await set_size_text(mainSizeText, canvas);
            render(imageData);
            if (currentMode === "custom") {
                cache.custom = saveState();
            }
        }
        BUTTONSTATE.COLORB = blurs <= 1;
        updateButton();
    } finally {
        isProcessing =false;
    }

    //console.log(`stepBlur took ${performance.now() - t0}ms, historyLen=${blurHistory.length}`);
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
    BUTTONSTATE.GRAYB = true;
    BUTTONSTATE.BLURD = true;
    BUTTONSTATE.BLURU = true;
    BUTTONSTATE.REQUIREDF = false;

    updateButton();
    blurHistory = [];
    blurs = 0;
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
    blurHistory = [];
    blurs = 0;
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
    BUTTONSTATE.COLORB = true;
    BUTTONSTATE.GRAYB = false;
    BUTTONSTATE.BLURD = false;
    BUTTONSTATE.BLURU = false;
    BUTTONSTATE.SENDI = true;
    BUTTONSTATE.REQUIREDF = true;

    updateButton();
}

function updateButton() {
    document.getElementById("colors").disabled = BUTTONSTATE.COLORB;
    document.getElementById("gray-switch").disabled = BUTTONSTATE.GRAYB;
    document.getElementById("blurD").disabled = BUTTONSTATE.BLURD;
    document.getElementById("blurU").disabled = BUTTONSTATE.BLURU;
    document.getElementById("send-img").disabled = BUTTONSTATE.SENDI;
    document.getElementById("required-filters").disabled = BUTTONSTATE.REQUIREDF;
}

async function rebuildFromScratch() {
    await loadImg(resolution);
    if (grayFilter) {
        await applyFilter(gray_scale, [], false);
    }

    blurHistory = [];
    for (let i = 0; i < blurs; i++) {
        blurHistory.push(cloneImageData(imageData));
        await applyFilter(bilateral_blur, [3, 40, 7], false);
    }

    if (currentMode === "custom") {
        cache.custom = saveState();
    }
}

function cloneImageData(data) {
    return new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
}