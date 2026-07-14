const canvas = document.getElementById("preview-img");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const mainSizeText = document.getElementById("image-size-display");

let imageData = null;
let componentPoints = null;
let simplifiedComponentPoints = null;

async function loadImg(maxScale) {

    const res = await fetch(imgUrl);
    const blob = await res.blob();
    originalSize = blob.size;

    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    
    await new Promise((resolve, reject) => {
        img.onload = () => {
            const scale = Math.min(1, maxScale / img.width, maxScale / img.height);
            const targetWidth = Math.round(img.width * scale);
            const targetHeight = Math.round(img.height * scale);

            canvas.width = targetWidth;
            canvas.height = targetHeight;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

            set_size_text(mainSizeText, canvas);

            URL.revokeObjectURL(objectUrl);

            connected_components = null;
            componentPoints = null;
            simplifiedComponentPoints = null;
            finalSVG = null;

            currentState = STATE.INITIAL;
            updateButtonStates();

            resolve();
        };

        img.onerror = reject;

        img.src = objectUrl;
    });
}

function render(data) {
    ctx.putImageData(data, 0, 0);
}

function draw_contours(contours, drawCtx) {
    for (let c = 0; c < contours.length; c++) {
        const color = connected_components[c].color;
        drawCtx.beginPath();
        for (const contour of contours[c]) {
            if (contour.length < 2) continue;
            drawCtx.moveTo(contour[0].x_cord, contour[0].y_cord);
            for (let i = 1; i < contour.length; i++) {
                drawCtx.lineTo(contour[i].x_cord, contour[i].y_cord);
            }
            drawCtx.closePath();
        }
        drawCtx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
        drawCtx.fill("evenodd");
    }
}

function count_component_points(componentPoints) {
    return componentPoints.map(component =>
        component.reduce((sum, path) => sum + path.length, 0)
    );
}

function count_total_points(componentPoints) {
    let total = 0;

    for (const component of componentPoints) {
        for (const path of component) {
            total += path.length;
        }
    }

    return total;
}

function set_size_text(text, canvas) {
    canvas.toBlob(blob => {
        text.textContent = `${(blob.size / 1024).toFixed(1)} KB (${((blob.size / originalSize) * 100).toFixed(1)} %)`;
    });
}

async function getOriginalSize() {
    const res = await fetch(url, { method: "HEAD" });
    const size = res.headers.get("Content-Length");
    return size ? parseInt(size, 10) : null;
}