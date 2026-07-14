"use strict";

let imgUrl = null;
let originalSize = null;

const STATE = {
    INITIAL: "initial",
    AFTER_FILTER: "after_filter",
    AFTER_MARCHING: "after_marching",
    AFTER_SIMPLIFY: "after_simplify",
    AFTER_SVG: "after_svg",
};

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
}

async function menu_pick_image() {
    closeOverlay();
    backend('get:media');
}

async function menu_take_picture() {
    closeOverlay();
    backend('get:camera');
}

function applyFilter(filter, params) {
    if (!imageData) return;

    imageData = filter(imageData, params);
    set_size_text(mainSizeText, canvas);
    render(imageData);

    if (currentState === STATE.INITIAL) {
        currentState = STATE.AFTER_FILTER;
    }
    updateButtonStates();

    if (currentMode === "custom") {
        cache.custom = saveState();
    }
}
function applyMarchingSquares() {
    if (!imageData) return;

    componentPoints = marching_squares(imageData);

    currentState = STATE.AFTER_MARCHING;
    updateButtonStates();

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

    currentState = STATE.AFTER_SIMPLIFY;
    updateButtonStates();

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

    canvas.innerHTML = svgString;

    currentState = STATE.AFTER_SVG;
    updateButtonStates();

    if (currentMode === "custom") {
        cache.custom = saveState();
    }
}

async function resetImage() {
    cache.custom = null;
    await loadImg(200);
    currentState = STATE.INITIAL;
    updateButtonStates();
}

function saveState() {
    return {
        imageData,
        componentPoints,
        simplifiedComponentPoints,
        finalSVG,
        currentState,
    };
}

function restoreState(state) {
    imageData = state.imageData;
    componentPoints = state.componentPoints;
    simplifiedComponentPoints = state.simplifiedComponentPoints;
    finalSVG = state.finalSVG;
    currentState = state.currentState;

    canvas.width = imageData.width;
    canvas.height = imageData.height;
    render(imageData);
    set_size_text(mainSizeText, canvas);
    updateButtonStates();
}

async function press_svg() {
    currentMode = "svg";
    document.getElementById("img-svg").style.background = "var(--activeCol)";
    document.getElementById("img-custom").style.background = "var(--passiveCol)";
    document.getElementById("custom-buttons-area").style.display = "none";

    if (cache.svg) {
        restoreState(cache.svg);
        return;
    }

    await loadImg(200);
    await apply_preset_filters();
    cache.svg = saveState();
}

async function apply_preset_filters() {
    let previousSize = await getCanvasFileSize(canvas);
    const minReduction = 0.08;
    const maxIterations = 10;

    for (let i = 0; i < maxIterations; i++) {
        applyFilter(bilateral_blur, [3, 40, 7]);

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
    applyFilter(quantize_color, [4]);
    applyFilter(merge_small_components, [10]);
    applyMarchingSquares();
    applyCountourSimplification(3);
    generateSVG(2.0);
}

async function press_custom() {
    currentMode = "custom";
    document.getElementById("img-svg").style.background = "var(--passiveCol)";
    document.getElementById("img-custom").style.background = "var(--activeCol)";
    document.getElementById("custom-buttons-area").style.display = "flex";

    if (cache.custom) {
        restoreState(cache.custom);
        return;
    }

    await loadImg(200);
    cache.custom = saveState();
}

function updateButtonStates() {
    const firstFive = [
        "gray-filter", "gaussian-blur", "bilateral-blur",
        "quantize-color", "merge-components"
    ];
    const marching = document.getElementById("marching-squares");
    const simplify = document.getElementById("simplify-contours");
    const svg = document.getElementById("png/svg");

    [...firstFive.map(id => document.getElementById(id)), marching, simplify, svg]
        .forEach(btn => btn.disabled = true);

    switch (currentState) {
        case STATE.INITIAL:
            firstFive.forEach(id => document.getElementById(id).disabled = false);
            break;

        case STATE.AFTER_FILTER:
            firstFive.forEach(id => document.getElementById(id).disabled = false);
            marching.disabled = false;
            break;

        case STATE.AFTER_MARCHING:
            marching.disabled = false;
            simplify.disabled = false;
            break;

        case STATE.AFTER_SIMPLIFY:
            simplify.disabled = false
            svg.disabled = false;
            break;

        case STATE.AFTER_SVG:
            break;
    }
}

async function getImg() {
    switch(currentMode) {
        case "svg": {
            if (!cache.svg.finalSVG) break;
            return cache.svg.finalSVG;
        }
        case "custom": {
            if (!cache.custom.finalSVG) break;
            return cache.custom.finalSVG;
        }
        default:
            return null;
    }
}

async function chat_sendImg() {
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