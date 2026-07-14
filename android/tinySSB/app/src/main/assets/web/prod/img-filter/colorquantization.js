const MAX_ITERATIONS = 20;

function quantize_color(imageData, params) {
    const k = params[0] // amount of colors (16)
    const data = imageData.data;
    let pixelData = extract_pixel_data(data);

    let results = kmeans(pixelData, k);

    let centroids = results.centroids;

    apply_color(data, pixelData, centroids);

    return imageData;
}

function apply_color(data, pixelData, centroids) {
    let closestCentroid, prevDistance;
    for (let i = 0; i < pixelData.length; i++) {
        for (let j = 0; j < centroids.length; j++) {
            if (j === 0) {
                closestCentroid = centroids[j];
                prevDistance = get_color_distance(pixelData[i], centroids[j]);
            } else {
                const distance = get_color_distance(pixelData[i], centroids[j])
                if (distance < prevDistance) {
                    closestCentroid = centroids[j];
                    prevDistance = distance;
                }
            }
        }

        let di = i*4;
        data[di] = closestCentroid[0];
        data[di+1] = closestCentroid[1];
        data[di+2] = closestCentroid[2];
    }



}

function get_color_distance(a, b) {
    return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

function extract_pixel_data(data) {
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
        pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
    return pixels;
}

function random_between(start, end) {
    return Math.floor(
        Math.random() * (end - start) + start
    );
}

function get_random_centroids(data, k) {
    const num_samples = data.length;
    const centroidsIndex = [];
    let index;
    while (centroidsIndex.length < k) {
        index = random_between(0, num_samples);
        if (centroidsIndex.indexOf(index) === -1) {
            centroidsIndex.push(index);
        }
    }
    const centroids = [];
    for (let i = 0; i < centroidsIndex.length; i++) {
        const centroid = [...data[centroidsIndex[i]]];
        centroids.push(centroid);
    }
    return centroids;
}

function get_distance_SQ(a, b) {
    const diffs = [];
    for (let i = 0; i< a.length; i++) {
        diffs.push(a[i] - b[i]);
    }
    return diffs.reduce((r, e) => (r + (e * e)), 0);
}

function get_labels(data, centroids) {
    const labels = {};
    for (let c = 0; c < centroids.length; c++) {
        labels[c] = {
            points: [],
            centroid: centroids[c],
        };
    }

    for (let i = 0; i < data.length; i++) {
        const element = data[i];
        let closestCentroid, closestCentroidIndex, prevDistance;
        for (let j = 0; j < centroids.length; j++) {
            let centroid = centroids[j];
            if (j === 0) {
                closestCentroid = centroid;
                closestCentroidIndex = j;
                prevDistance = get_distance_SQ(element, closestCentroid);
            } else {
                const distance = get_distance_SQ(element, centroid);
                if (distance < prevDistance) {
                    closestCentroid = centroid;
                    closestCentroidIndex = j;
                    prevDistance = distance;
                }
            }
        }
        labels[closestCentroidIndex].points.push(element)
    }
    return labels;
}

function get_points_mean(pointList) {
    const totalPoints = pointList.length;
    const means = [];
    for (let j = 0; j < pointList[0].length; j++ ) {
        means.push(0)
    }

    for (let i = 0; i < pointList.length; i++) {
        const point = pointList[i];
        for (let j = 0; j < point.length; j++) {
            const val = point[j];
            means[j] = means[j] + val / totalPoints;
        }
    }
    return means;
}

function recalculate_centroids(data, labels, k) {
    let newCentroid;
    const newCentroidList = [];
    for (const k in labels) {
        const centroidGroup = labels[k];
        if (centroidGroup.points.length > 0 ) {
            newCentroid = get_points_mean(centroidGroup.points);
        } else {
            newCentroid = get_random_centroids(data, 1)[0];
        }
        newCentroidList.push(newCentroid);
    }
    return newCentroidList;
}

function compare_centroids(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function should_stop(oldCentroids, centroids, iterations) {
    if (iterations > MAX_ITERATIONS) {
        return true;
    }

    if (!oldCentroids || !oldCentroids.length) {
        return false;
    }

    let sameCount = true;
    for (let i = 0; i < centroids.length; i++) {
        if (!compare_centroids(centroids[i], oldCentroids[i])) {
            sameCount = false;
        }
    }

    return sameCount;

}

function kmeans(data, k) {
    if(data.length && data[0].length && data.length > k) {
        let iterations = 0;
        let oldCentroids, labels, centroids;

        centroids = get_random_centroids(data, k);

        while(!should_stop(oldCentroids, centroids, iterations)) {
            oldCentroids = [...centroids];
            iterations++;

            labels = get_labels(data, centroids);
            centroids = recalculate_centroids(data, labels, k);
        }

        const clusters = [];
        for (let i = 0; i < k; i++) {
            clusters.push(labels[i]);
        }
        const results = {
            clusters: clusters,
            centroids: centroids,
            iterations: iterations,
            converged: iterations <= MAX_ITERATIONS,
        };
        return results;

    } else {
        throw new Error('Invalid dataset');
    }
}
