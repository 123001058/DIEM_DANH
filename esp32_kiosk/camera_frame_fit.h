#pragma once
#include <stdint.h>

// TJpg_Decoder supports only 1, 2, 4 and 8. Zero means the frame cannot fit.
constexpr uint8_t cameraFrameScale(uint16_t width, uint16_t height,
                                uint16_t boxWidth, uint16_t boxHeight) {
  if (!width || !height || !boxWidth || !boxHeight) return 0;
  for (uint8_t scale = 1; scale <= 8; scale *= 2) {
    if ((width + scale - 1) / scale <= boxWidth &&
        (height + scale - 1) / scale <= boxHeight) return scale;
  }
  return 0;
}
