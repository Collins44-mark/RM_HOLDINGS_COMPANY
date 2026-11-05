export function readFittedImage(file: File, maxEdge = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose an image file."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not read that image."));
      image.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not read that image."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL("image/jpeg", 0.82);
        if (url.length > 350000) {
          reject(new Error("That image is still too large. Choose a smaller photo."));
          return;
        }
        resolve(url);
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export function isStoredImage(value: string) {
  return value.startsWith("data:image/jpeg;base64,") && value.length <= 350000;
}
