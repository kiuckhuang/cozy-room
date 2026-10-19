# Hardware OpenGL in WSL2 (RTX 5090)

WSL2 exposes the GPU as **D3D12** through `/dev/dxg`. CUDA works out of the box, but Linux
OpenGL/Vulkan needs a driver that speaks D3D12, and AlmaLinux 10 does not package one — so every
GUI app here used to fall back to software rendering (llvmpipe/SwiftShader, ~1 fps on this game).

This document records how a Mesa D3D12 driver was built and installed so **all WSL GUI apps
render on the GPU**, and what still does not work.

## Result

| Check | Before | After |
|---|---|---|
| `glxinfo -B` | llvmpipe (CPU) | `D3D12 (NVIDIA GeForce RTX 5090)`, OpenGL 4.6, accelerated |
| `es2_info` | llvmpipe | `GLES 3.1 · D3D12 (NVIDIA GeForce RTX 5090)` |
| Chrome (windowed on WSLg) WebGL2 | SwiftShader | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 5090), OpenGL 4.6)` |
| This game @1280×720, q=high | **1.1 fps** | **60 fps** (vsync), `effective q=high` |

Takes effect in **new** shells. To apply now: `source /etc/profile.d/mesa-d3d12.sh`.

## What is installed

```
/usr/local/lib64/libgallium-25.2.7.so        Mesa megadriver (d3d12 gallium)
/usr/local/lib64/libEGL_mesa.so.0*           EGL
/usr/local/lib64/libGLX_mesa.so.0*           GLX
/usr/local/lib64/libgbm.so.1*                GBM
/usr/local/lib64/dri/d3d12_dri.so            the D3D12 driver (-> libdril_dri.so)
/usr/local/lib64/gbm/dri_gbm.so              GBM DRI backend
/etc/ld.so.conf.d/mesa-local.conf            makes /usr/local/lib64 visible to the loader
/etc/profile.d/mesa-d3d12.sh                 environment for login shells
~/.config/environment.d/mesa-d3d12.conf      same variables for systemd user units
```

Environment (already applied by the file above):

| Variable | Value | Why |
|---|---|---|
| `MESA_LOADER_DRIVER_OVERRIDE` | `d3d12` | WSL has no DRM device, so the driver must be named explicitly |
| `LIBGL_DRIVERS_PATH` | `/usr/local/lib64/dri` | only our DRI dir, keeping the distro's stale modules out |
| `LD_LIBRARY_PATH` | `/usr/local/lib64:…` | guarantees our Mesa wins over the distro copy |
| `MESA_D3D12_DEFAULT_ADAPTER_NAME` | `NVIDIA` | the box also has an Intel UHD 770; without this Mesa picks the iGPU |
| `GALLIUM_DRIVER` | `d3d12` | belt-and-braces for gallium-based apps |

## Rebuild / upgrade recipe

```bash
sudo dnf install -y meson bison flex python3-mako python3-pyyaml python3-packaging \
  ninja-build gcc-c++ pkgconf-pkg-config libdrm-devel libglvnd-devel wayland-devel \
  wayland-protocols-devel libX11-devel libXext-devel libxcb-devel libXrandr-devel \
  libXfixes-devel libXdamage-devel libXxf86vm-devel libxshmfence-devel expat-devel \
  zlib-devel libzstd-devel mesa-demos vulkan-tools

mkdir -p ~/mesa-gpu && cd ~/mesa-gpu
git clone --depth 1 https://github.com/microsoft/DirectX-Headers
meson setup dxbuild DirectX-Headers --prefix=$PWD/dxprefix -Dbuild-test=false
ninja -C dxbuild && meson install -C dxbuild

curl -O https://archive.mesa3d.org/mesa-25.2.7.tar.xz && tar xf mesa-25.2.7.tar.xz
CCACHE_DISABLE=1 PKG_CONFIG_PATH=$PWD/dxprefix/lib64/pkgconfig \
meson setup mesa-build mesa-25.2.7 --prefix=$PWD/mesa-prefix \
  -Dgallium-drivers=d3d12 -Dvulkan-drivers= -Dplatforms=x11,wayland -Dglx=dri \
  -Degl=enabled -Dgbm=enabled -Dllvm=disabled -Dvalgrind=disabled -Dbuild-tests=false \
  -Dgallium-va=disabled -Dgallium-vdpau=disabled -Dvideo-codecs= -Dzstd=disabled
ninja -C mesa-build && meson install -C mesa-build

sudo cp -a mesa-prefix/lib64/. /usr/local/lib64/ && sudo ldconfig
```

Notes:
- Keep the Mesa version equal to the distro's (`rpm -q mesa-dri-drivers` → 25.2.7) so the distro's
  GLVND loaders (`libglvnd`) can `dlopen` the driver without ABI complaints.
- `CCACHE_DISABLE=1` is needed when `$HOME/.ccache` is read-only (container/sandbox setups).
- Build time on 8 cores: ~4 minutes (only the d3d12 gallium driver is built).

## Chrome: headless vs windowed

Headless Chrome on Linux initialises EGL through the surfaceless/GBM path, which needs a DRM
render node. WSL only has a dummy `vgem` node, so `--headless` still falls back to SwiftShader.
Two ways to get GPU-rendered Chrome output:

1. **Windowed Chrome on WSLg** — the harness switches headless off automatically:
   ```bash
   LOCAL_GPU=1 node tools/gpucheck.mjs      # renderer: D3D12 (NVIDIA GeForce RTX 5090)
   ```
2. **Chrome on the Windows host over CDP** — no display needed, and CPU-bound at ~116 fps:
   ```bash
   export CDP_URL=$(node tools/host-gpu.mjs start --quiet)
   node tools/perf.mjs
   ```

### Per-app overrides
The profile script forces the D3D12 driver for everything. If one app misbehaves, run it with the
old behaviour instead of editing the global file:

```bash
env -u LIBGL_DRIVERS_PATH -u MESA_LOADER_DRIVER_OVERRIDE -u GALLIUM_DRIVER \
    LD_LIBRARY_PATH=/usr/lib64 LIBGL_ALWAYS_SOFTWARE=1 <app>   # software (llvmpipe)
```

## Vulkan

Vulkan still runs on **lavapipe (CPU)**: Mesa's `dzn` (Vulkan-on-D3D12) driver needs LLVM and
SPIRV-LLVM-Translator at build time. Nothing here needs it — browsers use ANGLE over GL — but if
you want Vulkan apps accelerated, build Mesa with `-Dvulkan-drivers=microsoft-experimental` plus
those dependencies.

## Revert

```bash
sudo rm /etc/profile.d/mesa-d3d12.sh /etc/ld.so.conf.d/mesa-local.conf \
        ~/.config/environment.d/mesa-d3d12.conf
sudo rm -rf /usr/local/lib64/dri /usr/local/lib64/gbm \
            /usr/local/lib64/libgallium-25.2.7.so /usr/local/lib64/libgbm.so* \
            /usr/local/lib64/libEGL_mesa.so* /usr/local/lib64/libGLX_mesa.so*
sudo ldconfig
```

The distro's own Mesa packages are untouched, so removing the files above restores the previous
(software) behaviour.
