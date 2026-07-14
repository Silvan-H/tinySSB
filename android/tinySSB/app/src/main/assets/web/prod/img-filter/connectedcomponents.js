let connected_components = null;

function get_connected_components(data, width, height){
    const pixelIncluded = [];
    const components = {};
    let componentIndex = 0;
    
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            const index = get_index_of_pixel(x, y, width);
            if (pixelIncluded[index]) {
                continue;
            } 
            components[componentIndex] = extract_component(data, pixelIncluded , x, y, index, width, height);
            componentIndex++;
        }
    }
    
    return components;

}

function extract_component(data, pixelIncluded, x, y, index, width, height) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = data[index + 3];
    const color = [r, g, b, a];

    pixelIncluded[index] = true;

    const component = {
        pixels: [],
        atBoundary: [],
        color: color,
    };

    const stack = [[x, y, index]];
    
    while (stack.length > 0) {
        const [cx, cy, ci] = stack.pop();

        component.pixels.push(ci);
        component.atBoundary.push(is_at_boundary(data, cx, cy, ci, color, width, height));

        for (let i = cx - 1; i <= cx + 1; i++) {
            for (let j = cy - 1; j <= cy + 1; j++) {
                if (i === cx && j === cy) continue;
                if (i < 0 || i >= width || j < 0 || j >= height) continue;

                const neighborIndex = get_index_of_pixel(i, j, width);
                if (pixelIncluded[neighborIndex]) continue;

                const neighborColor = get_color(data, neighborIndex);
                if (same_color(neighborColor, color)) {
                    pixelIncluded[neighborIndex] = true;
                    stack.push([i, j, neighborIndex]);
                }
            }
        }
    }

    return component;
}

function same_color(a, b) {
    return (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]);
}

function is_at_boundary(data, i , j, indexA, colorA, width, height) {
    for (let x = i - 1; x <= i + 1; x++) {
        for (let y = j - 1; y <= j + 1; y++) {
            if (x === i && y === j) {
                continue;
            }

            if (x < 0 || x >= width || y < 0 || y >= height) {
                continue;
            }

            const indexB = get_index_of_pixel(x, y, width);
            const colorB = get_color(data, indexB);
            if (!same_color(colorA, colorB)){
                return true;
            }
        }
    }
    return false;
}

function get_color(data, index) {
    return [data[index], data[index+1], data[index+2], data[index+3]];
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

function merge_small_components(imageData, params){
    const minSize = params[0];

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    let components = get_connected_components(data, width, height);
    for (const key in components) {
        const component = components[key];
        if (component.pixels.length < minSize) {
            merge_color(data, component, width, height);
        }
    }

    //console.log("before merge: " + Object.keys(components).length);
    connected_components = get_connected_components(data, width, height);
    //console.log("after merge: " + Object.keys(connected_components).length);
    
    return imageData;
}

function merge_color(data, component, width, height) {
    const colors = {};
    count_neighbouring_colors(colors, data, component, width, height);
    const [r,g,b,a] = get_most_frequent_color(colors);
    
    for(let p = 0; p < component.pixels.length; p++) {
        let index = component.pixels[p];
        data[index] = r;
        data[index+1] = g;
        data[index+2] = b;
        data[index+3] = a;
    }
}

function count_neighbouring_colors(colors, data, component, width, height) {
    const colorA = component.color;

    for (let p = 0; p < component.pixels.length; p++) {
        if (component.atBoundary[p]) {
            let indexA = component.pixels[p];
            const [x, y] = get_coordinates_of_pixel(indexA, width);
            for (let i = x - 1; i <= x + 1; i++) {
                for (let j = y - 1; j <= y + 1; j++) {
                    if (i === x && j === y) {
                        continue;
                    }
                    if (i < 0 || i >= width || j < 0 || j >= height) {
                        continue;
                    }

                    let indexB = get_index_of_pixel(i, j, width);
                    const colorB = get_color(data, indexB);
                    if (!same_color(colorA, colorB)) {
                        colors[colorB] = (colors[colorB] || 0) + 1;
                    }

                }
            }
        }
    }
}

function get_most_frequent_color(colors) {
    let maxKey = null;
    let maxValue = -Infinity;

    for(const key in colors) {
        if (colors[key] > maxValue) {
            maxValue = colors[key];
            maxKey = key;
        }
    }
    return maxKey.split(",");
}



