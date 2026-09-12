# Device Bridge Console

Operational configuration and video bridging for Go2, Hikvision, Dahua/NVR,
generic RTSP, HTTP snapshot/MJPEG and local USB cameras. The bridge never issues
robot movement commands.

## Run on Windows

For a new installation, follow the root `README.md` and double-click `start.cmd`.
The complete Windows-native deployment includes this console at `/admin/bridges`.
The launcher below is for developers who already configured Python, Node.js and
PostgreSQL; it is not a second required installation step.

Use the existing project Python environment with `server/requirements.txt`
installed. The backend still needs the project's PostgreSQL `DATABASE_URL`.

```powershell
powershell -ExecutionPolicy Bypass -File tools\start_device_bridge_console.ps1
```

The launcher starts separate loopback services on 8012 and 5180, preserving
existing processes. Occupied ports cause a clear error; choose other ports with
`-ApiPort 8013 -WebPort 5181`. Open `http://127.0.0.1:5180/admin/bridges`.
An external Python environment can be selected with `-PythonPath <python.exe>`
or `CICSIC_BRIDGE_PYTHON`. `-WebRoot <workspace>` supports an isolated frontend
copy using the same source and lockfile.
The launcher waits for both the dashboard and its API proxy to respond before
reporting readiness, and cleans up its launched process trees on failure.
The local authorization token is generated under
`server/.secrets/bridge-console/admin.token`, with access restricted to the
current Windows user and SYSTEM. It is supplied only to the new API process;
existing platform credentials are not changed.
This loopback-only launcher explicitly enables local tokens of 4 to 256
characters with `APP_ENV=local` and `CICSIC_ALLOW_SHORT_LOCAL_ADMIN_TOKEN=true`.
Edit the private token file and restart the console to change the local token.
The local flag has no effect outside `APP_ENV=local`. Other environments require
at least 16 characters unless the deployment owner explicitly enables the separate
`CICSIC_ALLOW_SHORT_ADMIN_TOKEN=true` compatibility setting. This preserves
authentication but short tokens are not recommended for public deployments.

For an existing deployment, restart the updated API and serve the rebuilt
dashboard with `/api` proxied to that API. Use the existing administrator token.
Run a single API worker per bridge data directory.

## Connect a Device

1. Sign in to the device console with the administrator token.
2. Add a device by brand, address and device account.
3. For an NVR choose the actual channel and main/substream. For a generic RTSP
   source enter only its path, such as `/live/stream1`; credentials belong in the
   separate account fields, never in a URL.
4. Go2 supports local network (`LocalSTA`) and robot hotspot (`LocalAP`) modes.
   Exact hardware and firmware compatibility must be tested on the real robot.
5. Run connection testing. A saved profile or open TCP port is not proof of video.
   Success requires a decoded frame. A test-only connection is stopped afterward.
6. Start bridging for continued preview, then persist a video-wall slot assignment.

The device editor also provides **Connect and Add** (`连接并接入`): choose a
video-wall slot and submit the device settings. It saves the encrypted profile,
starts the source, requires decoded-frame evidence, fetches a real JPEG, and
then saves and verifies the slot assignment. Occupied slots cannot be replaced
by this action. An existing device can use its current slot.

A failed attempt leaves the saved device available for editing and retry without
creating another profile. Newly started decoders are stopped on pre-binding
failure; already active devices are left running. An uncertain binding response
leaves the decoder running until the operator verifies the inventory.
The editor retains the separate save-only command and optional auto-start flag.
Auto-start also requires the deployment-wide `CICSIC_BRIDGE_AUTOSTART` setting;
the UI does not override a disabled deployment-wide setting.

Binding updates use the existing re-read/compare/write/verify flow. This is
optimistic conflict detection, not a server-side compare-and-swap transaction;
do not edit bindings concurrently from multiple management sessions.

## YOLO-Compatible Access Methods

The adapters preserve the access methods present in `detection/monitor.py`,
`VideoStreamController.java` and `CameraSnapshotService.java` from the original
YOLO project:

- RTSP uses TCP transport and a backend decoder. Existing Hikvision/Dahua paths
  and credentials remain unchanged when an HTTP alternative is also imported.
- HTTP snapshot polls JPEG images once per second. HTTP MJPEG decodes a
  continuous multipart stream. Both support Basic/Digest authentication, separate
  host/port/path fields and ordinary HTTPS certificate verification.
- HTTP connections pin the validated address while retaining the original Host
  and TLS hostname. Redirects and environment proxies are disabled. Compressed
  input and native decoder pixel allocation are bounded.
- USB uses the explicitly selected local index. On Windows it requests
  DirectShow, MJPG, 1280x720 and 30 fps, matching the original capture setup.
  Live video follows the decoded source cadence; compatibility JPEG output is
  limited separately. Saving/importing never opens hardware.
- Go2 keeps the existing local WebRTC adapter. The original optional go2rtc
  service is not installed or started by this migration. A separately managed
  RTSP relay can still be entered as a generic RTSP source.

Changing the source type discards previous credentials and inapplicable paths.
All new imported devices remain stopped until explicitly tested or started.

## Import the Existing YOLO Cameras

Pass your own YOLO project directory with `--source-root`; the importer does not
assume the original development machine's path or modify source data. It prefers
`server/detection/cameras.json`, then `detection/cameras.json`, and supplements
unique endpoints from `detection/cameras.json.bak`. A file with unresolved merge
markers is skipped and explicitly reported by default. `--conflict-side incoming`
or `--conflict-side current` selects conflict hunks in memory without changing the
source file. `--include-local` imports explicit USB indices;
`--include-http-alternatives` imports explicit snapshot/MJPEG endpoints as
separate profiles. Brand selection follows the actual RTSP path, not the device
name. Disabled application-level snapshot defaults are not activated.

It reads `${CAM_PASSWORD}` from the source `.env`, separates credentials before
substitution, and passes the resulting profile directly to the authenticated
loopback API. It does not copy plaintext configuration or credentials here.
Existing endpoint matches are kept without overwriting passwords or settings.
New entries have auto-start disabled. Do not edit devices or bindings concurrently
with import; the binding API does not support conditional writes.

```powershell
& '<python.exe>' -B tools/import_yolo_camera_bridges.py `
  --source-root '<your-yolo-project>' `
  --token-file server/.secrets/bridge-console/admin.token --dry-run --bind-empty `
  --include-local --include-http-alternatives --conflict-side incoming
& '<python.exe>' -B tools/import_yolo_camera_bridges.py `
  --source-root '<your-yolo-project>' `
  --token-file server/.secrets/bridge-console/admin.token --apply --bind-empty `
  --include-local --include-http-alternatives --conflict-side incoming
```

The importer normally requires a token of at least 16 characters. For an existing
short local token, explicitly add `--allow-short-local-token`; that exception is
limited to 4-15 character tokens over HTTP loopback and never enables remote use.

An interrupted apply can leave completed creates in place. Rerun the dry-run,
then apply again; endpoint matching avoids recreating completed entries.
`--bind-empty` only fills vacant slots and never replaces existing assignments.

The bridge host must be able to reach the camera or robot. A web browser opening
the dashboard does not make an unreachable camera network accessible. For remote
deployments provide a protected network route or place the bridge host in the
device network. This release does not configure VPNs or expose camera ports.

## Security and Operations

- Configuration, including credentials, is encrypted using a separately stored
  Fernet key under `server/.secrets/device-bridges` (override with
  `CICSIC_BRIDGE_DATA_DIR`). Back up the encrypted data and its key securely.
- Losing the key makes existing credentials unreadable. Corrupt or unreadable
  configuration fails closed and is not silently replaced.
- Device credentials never appear in response JSON, playback URLs or worker
  command lines. Backend and worker errors are sanitized.
- The browser retains its administrator token only in memory. Preview uses an
  HttpOnly, SameSite cookie; mutation endpoints still require the admin header.
  Reauthenticate after reloading the page or when preview authorization expires.
  Session renewal revokes the replaced cookie. Active MJPEG streams and WebRTC
  sessions recheck authorization every 0.5 seconds.
- Use HTTPS and authenticated reverse proxy access for non-loopback deployment.
  Disable proxy buffering for MJPEG and configure a suitable stream read timeout.
- Start, stop and reconnect manage isolated decoder processes. Auto-start is off
  unless explicitly enabled per device. Disconnecting or stale frames clear
  online status and no generated image is substituted.
- At most 16 devices can be configured. WebRTC-capable bridges publish decoded
  frames directly to a bounded latest-frame relay and encode H264 for browser
  video playback. This is not compressed RTSP passthrough. Wall and focus views
  share one browser connection per source. JPEG snapshots remain available for
  compatibility and connection checks, but do not pace WebRTC video.
- Each worker accepts at most four viewer connections. Worker leases expire
  after six seconds without API renewal; browser leases expire after ten seconds.
  Signaling is authenticated and private worker endpoints listen on loopback.
  ICE uses directly reachable network candidates, without a configured TURN
  relay; remote viewing needs a suitable protected network route.
- Source frame rate and host encoding capacity still bound playback. An HTTP
  snapshot source polled once per second does not become high-frame-rate video
  merely by using WebRTC. Sixteen slots are not a 16-camera capacity claim.
- There are no ONVIF discovery, PTZ, recording or robot motion controls in this
  increment. These capabilities are not implied by a successful RTSP connection.

## Verification Boundary

Automated tests exercise configuration, encryption, access control, failure
handling and actual decoding of controlled test media. Such media is synthetic
test input, not a live camera acceptance result. Physical Go2 and every camera/NVR
model must pass sustained video and reconnect checks before deployment acceptance.

On September 11, 2026, the local Go2 hotspot and wired Hikvision streams were
verified together at 1280x720. A 25-second receiving test measured 14.29 fps and
24.22 fps respectively, with maximum inter-frame gaps of 79 ms and 94 ms.
Browser observations were approximately 14.5/25 fps with zero reported dropped
frames. Jitter-buffer delay is not end-to-end camera latency. These observations
cover these two sources, not every supported model or full-wall capacity.

```powershell
npm run dashboard:build
node --experimental-vm-modules --test apps/dashboard/src/lib/admin-request.test.mjs apps/dashboard/src/lib/device-bridges-api.test.mjs
```

Backend tests are in `server/tests`. Run each file in a separate Python process
with an isolated test database, never against an existing deployment. The root
README records the complete deployment acceptance scope. Local browser scripts,
device inventories, credentials and developer-specific reports are not part
of the distribution. Synthetic test streams do not establish capacity for
16 distinct cameras. The production build retains a large-bundle warning.

For loopback RTSP tests, install FFmpeg and set `CICSIC_TEST_MEDIAMTX` to the
MediaMTX executable. Without these dependencies the optional tests skip, which
is not a successful live-media acceptance result.
