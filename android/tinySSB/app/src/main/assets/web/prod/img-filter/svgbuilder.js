let CURVE_TOLERANCE = null;
const svgSizeText = document.getElementById("svg-size");
let finalSVG = null;

function build_svg(componentPoints, curveTolerance) {
    CURVE_TOLERANCE = curveTolerance;
    /*
    for (const key in stats) delete stats[key];
    stats.saved = 0;
    */

    const pairs = build_pairs(componentPoints);
    const merged = merge_consecutive(pairs);
    const paths = pairs_to_paths(merged);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${imageData.width} ${imageData.height}" fill-rule="evenodd">${paths.join("")}</svg>`;
    const svgSize = byteSize(svg);

    /*
    const { saved, ...counts } = stats;
    console.log("winner counts:", counts);
    console.log("total chars saved:", saved);
    console.log("bytes:", svgSize);
    console.log(svg);
     */

    const encodedSvg = encode_svg(svg);
    const encodedSvgSize = byteSize(encodedSvg);
    mainSizeText.textContent = `${(encodedSvgSize / 1024).toFixed(1)} KB (${((encodedSvgSize / originalSize) * 100).toFixed(1)} %)`

    finalSVG = encodedSvg;
    return svg;
}

function build_pairs(componentPoints) {
    return componentPoints
        .map((component, i) => {
            const fill = rgbaToHex(connected_components[i].color);
            const d = component.map(path_to_svg).filter(Boolean).join(" ");
            return d ? [fill, d] : null;
        })
        .filter(Boolean);
}

function merge_consecutive(pairs) {
    const merged = [];
    for (const [fill, d] of pairs) {
        const last = merged[merged.length - 1];
        if (last && last.fill === fill) {
            last.d += " " + d;
        } else {
            merged.push({ fill, d });
        }
    }
    return merged;
}

function pairs_to_paths(merged) {
    return merged.map(({ fill, d }) => `<path d="${d}" fill="${fill}"/>`);
}

/*
function component_to_svg(component, fill) {
    const d = component.map(path_to_svg).filter(Boolean).join(" ");
    if (!d) return "";
    return `<path d="${d}" fill="${fill}"/>`;
}
*/

function path_to_svg(path) {
    if (!path.length) return "";

    const parts = [`M${path[0].x_cord} ${path[0].y_cord}`];
    let i = 1;

    while (i < path.length) {
        const prev = path[i - 1];
        const p = path[i];
        const dx = p.x_cord - prev.x_cord;
        const dy = p.y_cord - prev.y_cord;

        if (dx === 0 && dy === 0) { i++; continue; }

        const curveCandidate = CURVE_TOLERANCE > 0 ? try_curve(path, i) : null;

        if (curveCandidate) {
            parts.push(curveCandidate.str);
            /*
            stats[curveCandidate.label] = (stats[curveCandidate.label] ?? 0) + 1;
            stats.saved += curveCandidate.saved;
             */
            i += curveCandidate.consumed;
            continue;
        }

        const candidates = segment_candidates(p, dx, dy);
        log_candidates(candidates);
        parts.push(candidates.sort((a, b) => a.str.length - b.str.length)[0].str);
        i++;
    }

    return parts.join("") + "Z";
}


function try_curve(path, i) {
    const p0 = path[i - 1];
    const maxLookahead = path.length - 1 - i;
    let best = null;

    for (let L = 1; L <= maxLookahead; L++) {
        const end = path[i + L];
        const interior = path.slice(i, i + L);

        const control = fit_quadratic_control(p0, end, interior);
        if (!control) break;

        const deviation = check_deviation(p0, control, end, interior);
        if (deviation > CURVE_TOLERANCE) break;

        const dcx = Math.round(control.x - p0.x_cord);
        const dcy = Math.round(control.y - p0.y_cord);
        const dx = Math.round(end.x_cord - p0.x_cord);
        const dy = Math.round(end.y_cord - p0.y_cord);
        const curveStr = `q${dcx} ${dcy} ${dx} ${dy}`;

        const lineCost = line_cost(p0, interior, end);
        if (curveStr.length < lineCost) {
            best = { str: curveStr, saved: lineCost - curveStr.length, consumed: L + 1, label: "curve" };
        }
    }

    return best;
}

function line_cost(p0, interior, end) {
    let cost = 0;
    let prevPt = p0;
    for (const pt of [...interior, end]) {
        const ddx = pt.x_cord - prevPt.x_cord;
        const ddy = pt.y_cord - prevPt.y_cord;
        const winner = segment_candidates(pt, ddx, ddy)
            .sort((a, b) => a.str.length - b.str.length)[0];
        cost += winner.str.length;
        prevPt = pt;
    }
    return cost;
}

function fit_quadratic_control(p0, end, interior) {
    const L = interior.length;
    let sumW2 = 0, sumWRx = 0, sumWRy = 0;

    for (let k = 0; k < L; k++) {
        const t = (k + 1) / (L + 1);
        const w = 2 * t * (1 - t);
        const oneMinusT2 = (1 - t) * (1 - t);
        const t2 = t * t;

        const rx = interior[k].x_cord - oneMinusT2 * p0.x_cord - t2 * end.x_cord;
        const ry = interior[k].y_cord - oneMinusT2 * p0.y_cord - t2 * end.y_cord;

        sumW2 += w * w;
        sumWRx += w * rx;
        sumWRy += w * ry;
    }

    if (sumW2 === 0) return null;
    return { x: sumWRx / sumW2, y: sumWRy / sumW2 };
}

function check_deviation(p0, control, end, interior, samplesPerSpan = 6) {
    const polyline = [p0, ...interior, end];
    const samples = samplesPerSpan * (interior.length + 1);
    let maxErr = 0;

    for (let s = 1; s < samples; s++) {
        const t = s / samples;
        const bp = bezier_point(p0, control, end, t);

        let minDist = Infinity;
        for (let k = 0; k < polyline.length - 1; k++) {
            const d = find_distance(bp, polyline[k], polyline[k + 1]);
            if (d < minDist) minDist = d;
        }
        if (minDist > maxErr) maxErr = minDist;
    }
    return maxErr;
}

function bezier_point(p0, c, p2, t) {
    const mt = 1 - t;
    return {
        x: mt * mt * p0.x_cord + 2 * mt * t * c.x + t * t * p2.x_cord,
        y: mt * mt * p0.y_cord + 2 * mt * t * c.y + t * t * p2.y_cord,
    };
}

function find_distance(pt, a, b) {
    const dx = b.x_cord - a.x_cord;
    const dy = b.y_cord - a.y_cord;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((pt.x - a.x_cord) * dx + (pt.y - a.y_cord) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x_cord + t * dx;
    const projY = a.y_cord + t * dy;
    return Math.hypot(pt.x - projX, pt.y - projY);
}

function segment_candidates(p, dx, dy) {
    if (dy === 0) return [{ label: "horizontal", str: `h${dx}` }];
    if (dx === 0) return [{ label: "vertical", str: `v${dy}` }];
    return [
        { label: "absolute", str: `L${p.x_cord} ${p.y_cord}` },
        { label: "relative", str: `l${dx} ${dy}` },
    ];
}

// const stats = { saved: 0 };

function log_candidates(candidates) {
    const sorted = [...candidates].sort((a, b) => a.str.length - b.str.length);
    const winner = sorted[0];
    const loser = sorted[sorted.length - 1];
    /*
    stats[winner.label] = (stats[winner.label] ?? 0) + 1;
    stats.saved += loser.str.length - winner.str.length;
     */
}

function rgbaToHex(c) {
    const [r, g, b, a] = c;
    const toHex = (v) => v.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
}

function byteSize(str) {
    return new TextEncoder().encode(str).length;
}

function encode_svg(svg) {
    const svgBytes = new TextEncoder().encode(svg);
    const compressed = pako.deflate(svgBytes);

    // console.log(`SVG: ${svgBytes.length} bytes raw -> ${compressed.length} bytes compressed`);

    let binary = '';
    for (let i = 0; i < compressed.length; i++) {
        binary += String.fromCharCode(compressed[i]);
    }
    const compressedBase64 = btoa(binary);

    const identifier = 'data:image/svg+xml;base64,';

    const payload = identifier + compressedBase64;
    // console.log(`Final payload size: ${payload.length} bytes`);
    return payload;
}
function download_svg(svg) {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "output.svg";
    a.click();
    URL.revokeObjectURL(url);
}