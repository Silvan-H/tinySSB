
/*
Returns contours grouped by connected image regions.

The component behind contours[c] corresponds directly to connected_components[c],
allowing access to the associated fill color.

componentContours = [
  component 0: [
    componentPath 0: [ {x_cord, y_cord}, ... ],
    componentPath 1: [ {x_cord, y_cord}, ... ]
  ],
  component 1: [
    componentPath 0: [ {x_cord, y_cord}, ... ]
  ]
]

Each path is an ordered polyline of edge points.
Multiple paths per component represent separate boundaries including holes.
Rendering uses evenodd fill rule to interpret them correctly.
*/
function marching_squares(imageData) {
    if (!connected_components) {
        return null;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    let componentEdges = [];
    
    for (let c = 0; c < Object.keys(connected_components).length; c++) {
        componentEdges[c] = [];
        const refPixel = connected_components[c].pixels[0];
        const [rx, ry] = get_coordinates_of_pixel(refPixel, width);

        for (let y = -1; y < height; y++) {
            for (let x = -1; x < width; x++) {
                const cornerCase = get_case(data, x, y, width, height, refPixel);
                const edges = get_points(x, y, cornerCase);
                for (const edge of edges) {
                    if (edge.length !== 2) continue;
                    componentEdges[c].push(edge);
                    /*
                    draw_edge(edge, connected_components[c].color);
                    for (const point of edge) {
                        draw_point(point, connected_components[c].color);
                    }
                    */
                }
            }
        }
    }

    const componentContours = [];

    for (let c = 0; c < componentEdges.length; c++) {
        componentContours[c] = build_contour(componentEdges[c]);

    }

    draw_contours(componentContours, ctx);
    set_size_text(mainSizeText, canvas);

    return componentContours;
}

function get_case(data, x, y, width, height, refPixel) {
    function isInside(cx, cy) { 
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) return false;
        const index = get_index_of_pixel(cx, cy, width)
        return data[index] === data[refPixel] && 
               data[index+1] === data[refPixel+1] &&
               data[index+2] === data[refPixel+2] &&
               data[index+3] === data[refPixel+3];
    }

    const UL = isInside(x,     y    ) ? 8 : 0;
    const UR = isInside(x + 1, y    ) ? 4 : 0;
    const LR = isInside(x + 1, y + 1) ? 2 : 0;
    const LL = isInside(x,     y + 1) ? 1 : 0;

    return UL + UR + LR + LL;
}

function get_points(x, y, corner_case) {
    const leftMid = {
        x_cord: x,
        y_cord: y + 0.5
    }
    const bottomMid = {
        x_cord: x + 0.5,
        y_cord: y + 1
    }
    const rightMid = {
        x_cord: x + 1,
        y_cord: y + 0.5
    }
    const topMid = {
        x_cord: x + 0.5,
        y_cord: y
    }

    switch (corner_case) {
        case 0: return [[]]; 
        case 1: return [[bottomMid, leftMid]];
        case 2: return [[bottomMid, rightMid]];
        case 3: return [[leftMid, rightMid]];
        case 4: return [[rightMid, topMid]];
        case 5: return [[leftMid, topMid], [bottomMid, rightMid]];
        case 6: return [[bottomMid, topMid]];
        case 7: return [[leftMid, topMid]];
        case 8: return [[leftMid, topMid]];
        case 9: return [[bottomMid, topMid]];
        case 10: return [[leftMid, bottomMid], [rightMid, topMid]];
        case 11: return [[rightMid, topMid]];
        case 12: return [[leftMid, rightMid]];
        case 13: return [[bottomMid, rightMid]];
        case 14: return [[bottomMid, leftMid]];
        case 15: return [[]];
  }
}

function get_index_of_pixel(x, y, width) {
    let i = (y * width + x) * 4;
    return i;
}

function get_coordinates_of_pixel(index, width) {
    const pixelIndex = index / 4; 
    let y = Math.floor(pixelIndex / width);
    let x = pixelIndex % width;
    return [x, y];
}

function draw_point(p, color, scale = 1) {
    ctx.beginPath();
    ctx.arc(p.x_cord * scale, p.y_cord * scale, 1, 0, Math.PI);
    ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
    ctx.fill();
}

function draw_edge(edge, color, scale = 1) {
    if (edge.length <= 1) {
        return;
    }
    ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
    ctx.beginPath();
    ctx.moveTo(edge[0].x_cord * scale, edge[0].y_cord * scale);
    ctx.lineTo(edge[1].x_cord * scale, edge[1].y_cord * scale);
    ctx.stroke();
}

function build_contour(componentEdges) {
    const neighbors = new Map();

    function get_point_key(p) {
        return `${p.x_cord},${p.y_cord}`;
    }

    function add_neighbor(from, to) {
        const key = get_point_key(from);
        if (!neighbors.has(key)) {
            neighbors.set(key, { point: from, edges: [] });
        }
        neighbors.get(key).edges.push({ key: get_point_key(to), point: to });
    }

    for (const edge of componentEdges) {
        if (edge.length !== 2) continue;
        const [a, b] = edge;
        add_neighbor(a, b);
        add_neighbor(b, a);
    }

    const visitedEdges = new Set();
    const componentPath = [];

    function get_edge_key(ka, kb) {
        return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    }

    for (const [startKey, startData] of neighbors) {
        for (const neighbor of startData.edges) {
            const ek = get_edge_key(startKey, neighbor.key);
            if (visitedEdges.has(ek)) continue;

            const path = [startData.point, neighbor.point];
            visitedEdges.add(ek);

            let currKey = neighbor.key;

            while (true) {
                const currData = neighbors.get(currKey);
                if (!currData) break;

                let advanced = false;
                for (const next of currData.edges) {
                    const nextEk = get_edge_key(currKey, next.key);
                    if (visitedEdges.has(nextEk)) continue;

                    visitedEdges.add(nextEk);
                    path.push(next.point);
                    currKey = next.key;
                    advanced = true;
                    break;
                }

                if (!advanced) break;
            }

            if (path.length > 1) componentPath.push(path);
        }
    }

    return componentPath;
}