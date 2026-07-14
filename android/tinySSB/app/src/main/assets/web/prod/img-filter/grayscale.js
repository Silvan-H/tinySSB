function gray_scale(imageData) {
    const data = imageData.data;

    for(let i = 0; i < data.length; i+=4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        
        const gray = 0.3 * r + 0.59 * g + 0.11 * b;

        data[i] = data[i+1] = data[i+2] = gray;
    }

    return imageData;
}