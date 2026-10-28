# Kiosk portraits

Source images remain in `images/faces/`. Nine-digit MSSV filenames map exactly to
students; `.jpg`, then `.jpeg`, then `.png` is selected when multiple versions exist.
Anonymous `image*.png` and `.wdp` files are not guessed or assigned to students.

Run from the repository root (Python with Pillow installed):

```powershell
python esp32_kiosk/tools/generate_avatars.py
python esp32_kiosk/tools/generate_avatars.py --check
```

This writes `esp32_kiosk/kiosk_avatars.h`: baseline 100x100 JPEGs in flash, preserving
aspect ratio. Original photos are untouched. Build and upload the Kiosk sketch after
changing portraits. The header is a snapshot; website photo updates do not automatically
change an already-flashed Kiosk. Unknown MSSV uses initials.

At 115200 baud, the new firmware prints `Avatar FLASH v1` on boot and
`[AVT FLASH] MSSV=... decoded=OK` for a successful image. The
`[KIOSK TIMING]` line measures the Kiosk RPC round trip and drawing separately.
It excludes time spent on browser AI and waiting for the next polling cycle.
`draw_ms` includes the fullscreen layout and JPEG decoding. The 3500 ms display timer
starts after drawing; network calls in the main loop can delay the return to QR.
