(function attachPreviewTools() {
  function filePathToUrl(filePath) {
    return `file://${filePath.replace(/\\/g, "/")}`;
  }

  function loadImageSource(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load the selected image."));
      image.src = src;
    });
  }

  function loadImage(filePath) {
    return loadImageSource(filePathToUrl(filePath));
  }

  function quantizeChannel(value, step) {
    return Math.max(0, Math.min(255, Math.round(value / step) * step));
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function applyContrast(value, contrast) {
    return clampChannel((value - 128) * contrast + 128);
  }

  function boostSaturation(red, green, blue, saturationBoost) {
    const average = (red + green + blue) / 3;
    return [
      clampChannel(average + (red - average) * saturationBoost),
      clampChannel(average + (green - average) * saturationBoost),
      clampChannel(average + (blue - average) * saturationBoost)
    ];
  }

  function buildLumaMap(pixels, width, height) {
    const luma = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        luma[y * width + x] =
          pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
      }
    }
    return luma;
  }

  function applyEdgeBoost(pixels, width, height, strength) {
    const lumaMap = buildLumaMap(pixels, width, height);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const centerIndex = y * width + x;
        const center = lumaMap[centerIndex];
        const neighbors =
          lumaMap[centerIndex - 1] +
          lumaMap[centerIndex + 1] +
          lumaMap[centerIndex - width] +
          lumaMap[centerIndex + width];
        const edgeScore = Math.abs(center * 4 - neighbors) / 4;

        if (edgeScore < 22) {
          continue;
        }

        const offset = centerIndex * 4;
        const shading = edgeScore > 58 ? -strength : strength * 0.45;
        pixels[offset] = clampChannel(pixels[offset] + shading);
        pixels[offset + 1] = clampChannel(pixels[offset + 1] + shading);
        pixels[offset + 2] = clampChannel(pixels[offset + 2] + shading);
      }
    }
  }

  async function generateLocalPixelPreview(sourcePath) {
    const image = await loadImage(sourcePath);
    const maxDimension = Math.max(image.width, image.height);
    const sampleMax = 96;
    const sampleScale = Math.max(1, Math.ceil(maxDimension / sampleMax));
    const sampleWidth = Math.max(24, Math.round(image.width / sampleScale));
    const sampleHeight = Math.max(24, Math.round(image.height / sampleScale));

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = sampleWidth;
    sampleCanvas.height = sampleHeight;
    const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
    sampleContext.imageSmoothingEnabled = true;
    sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);

    const imageData = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
    const pixels = imageData.data;
    const colorStep = 24;
    const contrast = 1.08;
    const saturationBoost = 1.18;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 16) {
        pixels[index + 3] = 0;
        continue;
      }

      let red = applyContrast(pixels[index], contrast);
      let green = applyContrast(pixels[index + 1], contrast);
      let blue = applyContrast(pixels[index + 2], contrast);

      [red, green, blue] = boostSaturation(red, green, blue, saturationBoost);

      pixels[index] = quantizeChannel(red, colorStep);
      pixels[index + 1] = quantizeChannel(green, colorStep);
      pixels[index + 2] = quantizeChannel(blue, colorStep);
    }

    applyEdgeBoost(pixels, sampleWidth, sampleHeight, 12);
    sampleContext.putImageData(imageData, 0, 0);

    const outputCanvas = document.createElement("canvas");
    const outputScale = Math.max(5, Math.floor(640 / Math.max(sampleWidth, sampleHeight)));
    outputCanvas.width = sampleWidth * outputScale;
    outputCanvas.height = sampleHeight * outputScale;

    const outputContext = outputCanvas.getContext("2d");
    outputContext.imageSmoothingEnabled = false;
    outputContext.drawImage(
      sampleCanvas,
      0,
      0,
      sampleWidth,
      sampleHeight,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height
    );

    return outputCanvas.toDataURL("image/png");
  }

  function drawOutlinedImage(targetContext, sourceCanvas, width, height) {
    targetContext.save();
    targetContext.shadowColor = "rgba(255, 255, 255, 0.95)";
    targetContext.shadowBlur = 8;
    for (const [x, y] of [
      [-4, 0],
      [4, 0],
      [0, -4],
      [0, 4],
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3]
    ]) {
      targetContext.drawImage(sourceCanvas, x, y, width, height);
    }
    targetContext.restore();
  }

  async function generateLocalChibiPreview(sourcePath) {
    const image = await loadImage(sourcePath);
    const width = 420;
    const height = 420;
    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = width;
    baseCanvas.height = height;
    const context = baseCanvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, width, height);

    const scale = Math.min(width / image.width, height / image.height) * 0.94;
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = (width - drawWidth) / 2;
    const drawY = (height - drawHeight) / 2 - height * 0.03;

    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    const imageData = context.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const colorStep = 34;

    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 12) {
        pixels[index + 3] = 0;
        continue;
      }

      let red = applyContrast(pixels[index], 1.12);
      let green = applyContrast(pixels[index + 1], 1.12);
      let blue = applyContrast(pixels[index + 2], 1.12);
      [red, green, blue] = boostSaturation(red, green, blue, 1.24);
      pixels[index] = quantizeChannel(red, colorStep);
      pixels[index + 1] = quantizeChannel(green, colorStep);
      pixels[index + 2] = quantizeChannel(blue, colorStep);
    }

    applyEdgeBoost(pixels, width, height, 16);
    context.putImageData(imageData, 0, 0);

    const stickerCanvas = document.createElement("canvas");
    stickerCanvas.width = width;
    stickerCanvas.height = height;
    const stickerContext = stickerCanvas.getContext("2d");
    drawOutlinedImage(stickerContext, baseCanvas, width, height);
    stickerContext.drawImage(baseCanvas, 0, 0);

    return stickerCanvas.toDataURL("image/png");
  }

  function isNearWhiteBackground(red, green, blue, alpha) {
    if (alpha < 20) {
      return true;
    }

    const minChannel = Math.min(red, green, blue);
    const maxChannel = Math.max(red, green, blue);
    const average = (red + green + blue) / 3;
    return average > 226 && maxChannel - minChannel < 28;
  }

  function removeBorderConnectedBackground(imageData, width, height) {
    const { data } = imageData;
    const backgroundMask = new Uint8Array(width * height);
    const queue = [];

    function tryPush(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return;
      }
      const index = y * width + x;
      if (backgroundMask[index]) {
        return;
      }

      const offset = index * 4;
      if (
        isNearWhiteBackground(
          data[offset],
          data[offset + 1],
          data[offset + 2],
          data[offset + 3]
        )
      ) {
        backgroundMask[index] = 1;
        queue.push(index);
      }
    }

    for (let x = 0; x < width; x += 1) {
      tryPush(x, 0);
      tryPush(x, height - 1);
    }

    for (let y = 0; y < height; y += 1) {
      tryPush(0, y);
      tryPush(width - 1, y);
    }

    let removedCount = 0;
    while (queue.length) {
      const index = queue.shift();
      const x = index % width;
      const y = Math.floor(index / width);
      const offset = index * 4;
      if (data[offset + 3] !== 0) {
        data[offset + 3] = 0;
        removedCount += 1;
      }

      tryPush(x - 1, y);
      tryPush(x + 1, y);
      tryPush(x, y - 1);
      tryPush(x, y + 1);
    }

    return removedCount;
  }

  function findOpaqueBounds(data, width, height) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] < 18) {
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  }

  function sampleCornerOpacity(data, width, height, xStart, yStart, sampleSize) {
    let opaqueCount = 0;
    let total = 0;
    for (let y = yStart; y < yStart + sampleSize; y += 1) {
      for (let x = xStart; x < xStart + sampleSize; x += 1) {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] > 24) {
          opaqueCount += 1;
        }
        total += 1;
      }
    }
    return total ? opaqueCount / total : 0;
  }

  async function createTransparentAsset(source, options = {}) {
    const {
      padding = 16,
      minRemovedRatio = 0.015,
      maxCornerOpacity = 0.22,
      maxFailedCorners = 2,
      failureMessage = "Generated asset still appears to have a solid white background. Please regenerate."
    } = options;

    const image = source.startsWith("data:")
      ? await loadImageSource(source)
      : await loadImage(source);

    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = image.width;
    baseCanvas.height = image.height;
    const baseContext = baseCanvas.getContext("2d", { willReadFrequently: true });
    baseContext.drawImage(image, 0, 0);

    const imageData = baseContext.getImageData(0, 0, image.width, image.height);
    const removedCount = removeBorderConnectedBackground(imageData, image.width, image.height);
    baseContext.putImageData(imageData, 0, 0);

    const bounds = findOpaqueBounds(imageData.data, image.width, image.height);
    if (!bounds) {
      throw new Error("Transparent asset processing removed the whole image.");
    }

    const cropX = Math.max(0, bounds.minX - padding);
    const cropY = Math.max(0, bounds.minY - padding);
    const cropWidth = Math.min(image.width - cropX, bounds.maxX - bounds.minX + 1 + padding * 2);
    const cropHeight = Math.min(image.height - cropY, bounds.maxY - bounds.minY + 1 + padding * 2);

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;
    const croppedContext = croppedCanvas.getContext("2d", { willReadFrequently: true });
    croppedContext.drawImage(
      baseCanvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    const croppedImageData = croppedContext.getImageData(0, 0, cropWidth, cropHeight);
    const cornerSample = Math.max(6, Math.floor(Math.min(cropWidth, cropHeight) * 0.08));
    const cornerOpacities = [
      sampleCornerOpacity(croppedImageData.data, cropWidth, cropHeight, 0, 0, cornerSample),
      sampleCornerOpacity(
        croppedImageData.data,
        cropWidth,
        cropHeight,
        cropWidth - cornerSample,
        0,
        cornerSample
      ),
      sampleCornerOpacity(
        croppedImageData.data,
        cropWidth,
        cropHeight,
        0,
        cropHeight - cornerSample,
        cornerSample
      ),
      sampleCornerOpacity(
        croppedImageData.data,
        cropWidth,
        cropHeight,
        cropWidth - cornerSample,
        cropHeight - cornerSample,
        cornerSample
      )
    ];

    const failedCorners = cornerOpacities.filter((ratio) => ratio > 0.55).length;
    const averageCornerOpacity =
      cornerOpacities.reduce((sum, ratio) => sum + ratio, 0) / cornerOpacities.length;
    const removedRatio = removedCount / Math.max(1, image.width * image.height);
    if (failedCorners > maxFailedCorners || (removedRatio < minRemovedRatio && averageCornerOpacity > maxCornerOpacity)) {
      throw new Error(failureMessage);
    }

    return {
      dataUrl: croppedCanvas.toDataURL("image/png"),
      removedRatio
    };
  }

  async function createTransparentPetAsset(source) {
    return createTransparentAsset(source, {
      padding: 16,
      minRemovedRatio: 0.015,
      maxCornerOpacity: 0.22,
      maxFailedCorners: 2,
      failureMessage: "Generated pet asset still appears to have a solid white background. Please regenerate."
    });
  }

  async function createTransparentRewardAsset(source) {
    return createTransparentAsset(source, {
      padding: 10,
      minRemovedRatio: 0.01,
      maxCornerOpacity: 0.18,
      maxFailedCorners: 1,
      failureMessage: "Generated reward asset still appears to have a solid white background. Please regenerate."
    });
  }

  window.previewTools = {
    filePathToUrl,
    generateLocalPixelPreview,
    generateLocalChibiPreview,
    createTransparentPetAsset,
    createTransparentRewardAsset
  };
})();
