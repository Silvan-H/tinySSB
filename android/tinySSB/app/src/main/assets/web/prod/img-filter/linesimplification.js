
function simplify_contours(componentContours, epsilon) {
    let simplifiedContours = [];

    for (let c = 0; c < componentContours.length; c++) {
        const contour = componentContours[c];
        let simplifiedComponentPaths = [];
        for (let p = 0; p < contour.length; p++) {
            const path = contour[p];
            simplifiedComponentPaths = [...simplifiedComponentPaths, douglas_peucker(path, epsilon)];
        }
        simplifiedContours = [...simplifiedContours, simplifiedComponentPaths];
    }

    //console.log(count_component_points(simplifiedContours));
    //console.log(count_total_points(simplifiedContours));

    const colorCounts = get_color_counts(simplifiedContours);
    const maxColor = get_background_color(colorCounts);
    backgroundColor = maxColor;

    const bgKey = get_color_key(maxColor);

    for (let c = 0; c < simplifiedContours.length; c++) {
        if (get_color_key(connected_components[c].color) === bgKey)
            simplifiedContours[c] = []; 
    }

    prepend_background_contour(simplifiedContours);
    prepend_background_component(maxColor);

    return simplifiedContours;
}

function douglas_peucker(pointList, epsilon) {
    const n = pointList.length;

    if (n < 3) return pointList;

    let dmax = 0;
    let maxIndex = 0;

    for (let i = 1; i < n-1; i++) {
        d = get_distance_to_line(pointList[i], pointList[0], pointList[n-1]);
        if (d > dmax) {
            dmax = d;
            maxIndex = i;
        }
    }

    let resultPointList = [];

    if (dmax > epsilon) {
        const segment1 = pointList.slice(0, maxIndex + 1);
        const segment2 = pointList.slice(maxIndex);

        const segmentPointList1 = douglas_peucker(segment1, epsilon);
        const segmentPointList2 = douglas_peucker(segment2, epsilon);

        resultPointList = [...segmentPointList1.slice(0, -1), ...segmentPointList2];
    } else {
        resultPointList = [pointList[0], pointList[n-1]];
    }
    return resultPointList;
}

function get_distance_to_line(point, lineStartPoint, lineEndPoint) {
    const dx = lineEndPoint.x_cord - lineStartPoint.x_cord;
    const dy = lineEndPoint.y_cord - lineStartPoint.y_cord;

    const lineLength = Math.hypot(dx, dy);

    //Return distance between the two points
    if (lineLength === 0) {
        const px = point.x_cord - lineStartPoint.x_cord;
        const py = point.y_cord - lineStartPoint.y_cord;
        return Math.hypot(px, py);
    }

    const nx = -dy / lineLength;
    const ny = dx / lineLength;

    const px = point.x_cord - lineStartPoint.x_cord;
    const py = point.y_cord - lineStartPoint.y_cord;

    const distance = Math.abs(px * nx + py * ny);
    return distance;
}

function get_color_key(color) {
    return `${color[0]},${color[1]},${color[2]},${color[3]}`;
}

function get_color_counts(simplifiedContours) {
    const colorCounts = new Map();

    for (let c = 0; c < simplifiedContours.length; c++){
        const contour = simplifiedContours[c];
        const colorKey = get_color_key(connected_components[c].color);
        let count = 0;
        for(let p = 0; p < contour.length; p++) {
            count+= contour[p].length;
        }

        colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + count);
    }
    return colorCounts;
}

function get_background_color(colorCounts) {
    let maxColor = null;
    let maxCount = -1;

    for (const [color, count] of colorCounts.entries()) {
        if (count > maxCount) {
            let splitColor = color.split(",").map(Number);
            if (splitColor[3] === 0) return splitColor;
            maxCount = count;
            maxColor = splitColor;
        }
    }

    return maxColor;
}

function prepend_background_contour(simplifiedContours) {
    const w = imageData.width;
    const h = imageData.height;
    const bgPath = [
        { x_cord: 0,   y_cord: 0   },
        { x_cord: w,   y_cord: 0   },
        { x_cord: w,   y_cord: h   },
        { x_cord: 0,   y_cord: h   },
        { x_cord: 0,   y_cord: 0   }, 
    ];

    simplifiedContours.unshift([bgPath]);
}   

function prepend_background_component(backgroundColor) {
    const n = Object.keys(connected_components).length;
    for (let k = n - 1; k >= 0; k--) {
        connected_components[k + 1] = connected_components[k];
    }
        
    connected_components[0] = {
        pixels: [], atBoundary: [],
        color: backgroundColor,
    };
}