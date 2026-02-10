export const MOBILE_LAYERS = [
    // "year",
    "month-expanded",
    "month-agenda",
    "week",
    "agenda",
  ];
  
  export function getNextMobileLayer(current, direction) {
    const index = MOBILE_LAYERS.indexOf(current);
  
    if (direction === "up") {
      return MOBILE_LAYERS[Math.min(index + 1, MOBILE_LAYERS.length - 1)];
    }
  
    if (direction === "down") {
      return MOBILE_LAYERS[Math.max(index - 1, 0)];
    }
  
    return current;
  }
  