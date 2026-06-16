// Image cache to store loaded images
export const imageCache = new Map();
export const failedImageUrls = new Set();
export const loadingImages = new Map();

let imageLoadCallback = null;

export const setImageLoadCallback = callback => {
  imageLoadCallback = callback;
};

export const getImageLoadCallback = () => imageLoadCallback;

export const clearImageCache = () => {
  imageCache.clear();
  failedImageUrls.clear();
  loadingImages.clear();
};
