"""Run only in an isolated go2rtc container with --network none, no private data."""

import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    process = subprocess.Popen(["go2rtc", "-config", "/config/go2rtc.yaml"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = "http://127.0.0.1:1984"

    def request(query="", method="GET", data=None):
        req = urllib.request.Request(base + "/api/streams" + query, method=method, data=data,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as response:
            return response.status, response.read()

    try:
        for attempt in range(50):
            try:
                request()
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise AssertionError("go2rtc readiness failed")
        source = "rtsp://fixture-user:fixture-password@camera.example.invalid/live?x=1&y=2"
        try:
            status, _ = request("?src=fixture", "PUT", json.dumps({"sources": [source]}).encode())
        except urllib.error.HTTPError as error:
            status = error.code
        _, body = request()
        assert "fixture" not in json.loads(body), "Legacy registration unexpectedly worked"
        legacy_status = status
        query = "?" + urllib.parse.urlencode({"dst": "fixture", "src": source})
        status, _ = request(query, "PUT")
        assert status == 200
        _, body = request()
        assert "fixture" in json.loads(body)
        request("?src=fixture", "DELETE")
        _, body = request()
        assert "fixture" not in json.loads(body)
        subprocess.run(["ffmpeg", "-version"], check=True, stdout=subprocess.DEVNULL)
        print(f"PASS: legacy registration HTTP {legacy_status}; encoded dst/src add/list/delete; FFmpeg executable")
    finally:
        process.terminate()
        process.wait(timeout=10)


if __name__ == "__main__":
    main()
