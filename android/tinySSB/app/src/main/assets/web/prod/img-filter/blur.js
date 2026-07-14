const kernel = [
  [1,  4,  6,  4, 1],
  [4, 16, 24, 16, 4],
  [6, 24, 36, 24, 6],
  [4, 16, 24, 16, 4],
  [1,  4,  6,  4, 1]
];

// Gaussian Blur

function gaussian_blur(imageData) {
    const srcData = imageData.data;

    const dst = ctx.createImageData(imageData.width, imageData.height);
    const dstData = dst.data;

    var height = imageData.height;
    var width = imageData.width;

    for(let y = 0; y < height; y++) {
        for(let x = 0; x < width; x++) {
            apply_kernel(srcData, dstData, x, y, width, height)
        }
    }
    return dst;
}

function apply_kernel(srcData, dstData, x, y, width, height) {
    let weightedCount = 0;
    let sum_r = 0;
    let sum_g = 0;
    let sum_b = 0;

    let kernel_offset = Math.floor(kernel.length / 2);

    for (let i = x-kernel_offset; i <= x+kernel_offset; i++) {
        for(let j = y-kernel_offset; j <= y+kernel_offset; j++) {
            if (i < 0 || j < 0 || i >= width || j >= height) {
                continue;
            }
            const index = get_index_of_pixel(i, j, width);

            const kernel_i = i - x + kernel_offset;
            const kernel_j = j - y + kernel_offset;
            const kernel_value = kernel[kernel_j][kernel_i];;

            weightedCount += kernel_value;

            sum_r += srcData[index] * kernel_value;
            sum_g += srcData[index + 1] * kernel_value;
            sum_b += srcData[index + 2] * kernel_value;
        }
    }

    const index = get_index_of_pixel(x, y, width);
    dstData[index] = sum_r / weightedCount;
    dstData[index + 1] = sum_g / weightedCount;
    dstData[index + 2] = sum_b / weightedCount;
    dstData[index + 3] = srcData[index + 3];
}

// Bilateral Blur

function bilateral_blur(imageData, params) {
    const spatial_s = params[0]; // spatial sigma (3)
    const range_s = params[1]; // color range sigma (40)
    const radius = params[2]; // kernel radius (7)

    const width = imageData.width;
    const height = imageData.height;

    const srcData = imageData.data;

    const dst = ctx.createImageData(width, height);
    const dstData = dst.data;

    for (let y = 0; y < height; y++){
        for (let x = 0; x < width; x++) {
            bilateral_pixel(srcData, dstData, x, y, width, height, radius, spatial_s, range_s);
        }
    }

    return dst;
}

function bilateral_pixel(srcData, dstData, x, y, width, height, radius, spatial_s, range_s) {
    const centerIndex = get_index_of_pixel(x, y, width);
    const centerR = srcData[centerIndex];
    const centerG = srcData[centerIndex+1];
    const centerB = srcData[centerIndex+2];

    let weightSum = 0;

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    for (let j = y - radius; j <= y + radius; j++) {
        for (let i = x - radius; i <= x + radius; i++) {
            if (i < 0 || j < 0 || i >= width || j >= height) {
                continue;
            }

            const index = get_index_of_pixel(i, j, width);
            const r = srcData[index];
            const g = srcData[index+1];
            const b = srcData[index+2];

            const spatial = spatial_weight(i - x, j - y, spatial_s);
            //const diffSquared = Math.pow((Math.abs(r - centerR) + Math.abs(g - centerG) + Math.abs(b - centerB)) / 3,2);
            const diffSquared = (r - centerR) * (r - centerR) + (g - centerG) * (g - centerG) + (b - centerB) * (b - centerB);
            const range = range_weight(diffSquared, range_s)

            const weight = spatial * range;
            weightSum += weight;

            sumR += r * weight;
            sumG += g * weight;
            sumB += b * weight;
        }
    }

    dstData[centerIndex] = sumR / weightSum;
    dstData[centerIndex+1] = sumG / weightSum;
    dstData[centerIndex+2] = sumB / weightSum;
    dstData[centerIndex+3] = srcData[centerIndex+3];

}

function gaussian(x, sigma) {
    return Math.exp(-(x*x) / (2 * sigma * sigma));
}

function spatial_weight(dx, dy, spatial_s) {
    return Math.exp(-(dx * dx + dy * dy) / (2 * spatial_s * spatial_s));
}

function range_weight(diffSquared, range_s) {
    return Math.exp(-(diffSquared) / (2 * range_s * range_s));
}

//General Helper Functions

function get_index_of_pixel(x, y, width) {
    let i = (y * width + x) * 4;
    return i;
}
