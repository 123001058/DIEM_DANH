// Compile-time execution of the production helper, no camera/display required.
// Build with compiler.cpp.extra_flags=-I<repository root>.
#include "esp32_kiosk/camera_frame_fit.h"

static_assert(cameraFrameScale(480, 320, 120, 80) == 4, "legacy HVGA unchanged");
static_assert(cameraFrameScale(640, 480, 120, 80) == 8, "VGA fits at 80x60");
static_assert(cameraFrameScale(800, 600, 120, 80) == 8, "SVGA fits at 100x75");
static_assert(cameraFrameScale(960, 640, 120, 80) == 8, "maximum supported bounds");
static_assert(cameraFrameScale(961, 640, 120, 80) == 0, "reject width overflow");
static_assert(cameraFrameScale(960, 641, 120, 80) == 0, "reject height overflow");
static_assert(cameraFrameScale(120, 80, 120, 80) == 1, "native size");
static_assert(cameraFrameScale(240, 160, 120, 80) == 2, "half size");
static_assert(cameraFrameScale(481, 321, 120, 80) == 8, "odd dimensions round up safely");
static_assert(cameraFrameScale(0, 320, 120, 80) == 0, "reject missing width");
static_assert(cameraFrameScale(480, 0, 120, 80) == 0, "reject missing height");
static_assert(cameraFrameScale(480, 320, 0, 80) == 0, "reject empty target");
static_assert(cameraFrameScale(65535, 65535, 120, 80) == 0, "reject huge frame");

constexpr bool centeredVgaFits() {
  const unsigned scale = cameraFrameScale(640, 480, 120, 80);
  const unsigned w = (640 + scale - 1) / scale;
  const unsigned h = (480 + scale - 1) / scale;
  const unsigned x = 20 + (120 - w) / 2;
  const unsigned y = 52 + (80 - h) / 2;
  return x == 40 && y == 62 && x + w <= 140 && y + h <= 132;
}
static_assert(centeredVgaFits(), "VGA stays inside camera region, above banner at y136");
void setup() {}
void loop() {}
