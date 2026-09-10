"""Offline importer tests. All camera details and credentials are synthetic."""
from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
HAS_IMPORTER = importlib.util.find_spec("import_yolo_camera_bridges") is not None
if HAS_IMPORTER:
    import import_yolo_camera_bridges as importer


def camera(address="rtsp://fixture-user:fixture-secret@192.0.2.10/live", **extra):
    return {"id": "fixture-id", "name": "Fixture camera", "type": "rtsp",
            "address": address, **extra}


class ImporterPresenceTests(unittest.TestCase):
    def test_importer_exists(self):
        self.assertTrue(HAS_IMPORTER, "The scoped camera importer is not implemented")


@unittest.skipUnless(HAS_IMPORTER, "Importer not implemented yet")
class ParserTests(unittest.TestCase):
    def test_separate_credentials_expand_without_url_decoding(self):
        secret = "literal@:/#%41"
        config = importer.parse_camera(camera("rtsp://192.0.2.10/live",
                                               user="user%40raw", password="${CAM_PASSWORD}"),
                                       {"CAM_PASSWORD": secret})
        self.assertEqual(config["username"], "user%40raw")
        self.assertEqual(config["password"], secret)

    def test_conflicting_url_and_separate_credentials_are_rejected(self):
        for row in (camera(username="other"),
                    camera(password="other"),
                    camera(user="fixture-user", username="other"),
                    camera(username=None), camera(password=12)):
            with self.assertRaises(importer.ImportFailure) as caught:
                importer.parse_camera(row, {})
            self.assertNotIn("fixture-secret", str(caught.exception))
        config = importer.parse_camera(camera(
            "rtsp://user%40lab:${CAM_PASSWORD}@192.0.2.10/live",
            user="user@lab", username="user@lab", password="${CAM_PASSWORD}"),
            {"CAM_PASSWORD": "fixture%41"})
        self.assertEqual(config["username"], "user@lab")
        self.assertEqual(config["password"], "fixture%41")

    def test_placeholder_is_expanded_after_url_split_without_decoding_its_value(self):
        secret = "fixture@:/#%41% space"
        config = importer.parse_camera(camera(
            "rtsp://user%40lab:${CAM_PASSWORD}@192.0.2.10:8554/Streaming/Channels/202"
        ), {"CAM_PASSWORD": secret})
        self.assertEqual(config["password"], secret)
        self.assertEqual(config["username"], "user@lab")
        self.assertEqual((config["host"], config["port"]), ("192.0.2.10", 8554))
        self.assertEqual((config["kind"], config["channel"], config["stream"]),
                         ("hikvision", 2, "sub"))
        self.assertEqual(config["rtspPath"], "")
        self.assertFalse(config["autoStart"])

    def test_literal_credentials_are_percent_decoded_exactly_once(self):
        config = importer.parse_camera(camera(
            "rtsp://fixture%3Auser:p%40%3A%2F%23%25%2541@192.0.2.10/live"
        ), {})
        self.assertEqual(config["username"], "fixture:user")
        self.assertEqual(config["password"], "p@:/#%%41")

    def test_literal_segments_and_placeholder_values_have_distinct_decoding(self):
        config = importer.parse_camera(camera(
            "rtsp://user:prefix%40${CAM_PASSWORD}%23@192.0.2.10/live"
        ), {"CAM_PASSWORD": "%2F"})
        self.assertEqual(config["password"], "prefix@%2F#")

    def test_brand_comes_from_rtsp_path_not_name_or_http_preview(self):
        config = importer.parse_camera(camera(
            "rtsp://192.0.2.10/cam/realmonitor?subtype=1&channel=4",
            name="Hikvision misleading fixture",
            httpMjpegUrl="http://fixture-secret@192.0.2.10/Streaming/Channels/101",
        ), {})
        self.assertEqual((config["kind"], config["channel"], config["stream"]),
                         ("dahua", 4, "sub"))
        generic = importer.parse_camera(camera(name="Hikvision fixture"), {})
        self.assertEqual(generic["kind"], "rtsp")
        self.assertEqual(generic["rtspPath"], "/live")

    def test_custom_paths_preserve_extra_parameters_and_missing_brand_parameters(self):
        for path, kind, channel, stream in (
            ("/Streaming/Channels/301?transportmode=unicast", "hikvision", 3, "main"),
            ("/cam/realmonitor?channel=2&subtype=1&unicast=true", "dahua", 2, "sub"),
            ("/cam/realmonitor", "dahua", 1, "main"),
            ("/custom%20video?profile=3", "rtsp", 1, "main"),
        ):
            if "%20" in path:
                # The destination rejects decoded whitespace, even if the URL is otherwise valid.
                with self.assertRaises(importer.ImportFailure):
                    importer.parse_camera(camera("rtsp://192.0.2.10" + path), {})
                continue
            config = importer.parse_camera(camera("rtsp://192.0.2.10" + path), {})
            self.assertEqual((config["kind"], config["channel"], config["stream"]),
                             (kind, channel, stream))
            self.assertEqual(config["rtspPath"], path)

    def test_missing_or_unsupported_placeholders_and_malformed_urls_fail_safely(self):
        invalid = (
            "rtsp://user:${MISSING}@192.0.2.10/live",
            "rtsp://user:${CAM_PASSWORD:-unsafe}@192.0.2.10/live",
            "rtsp://${HOST}/live",
            "rtsp://192.0.2.10/${CAM_PASSWORD}",
            "rtsp://user:bad%ZZ@192.0.2.10/live",
            "rtsp://user:%ff@192.0.2.10/live",
            "rtsp://192.0.2.10:bad/live",
            "rtsp://192.0.2.10:65536/live",
            "rtsp://192.0.2.10",
            "rtsp://192.0.2.10/live#fixture-secret",
            "rtsp://192.0.2.10/live?password=fixture-secret",
            "rtsp://192.0.2.10/cam/realmonitor?channel=1&channel=2",
            "rtsp://192.0.2.10/Streaming/Channels/001",
            "rtsp://user:fixture-secret@169.254.169.254/live",
            "rtsp://user:fixture-secret@192.0.2.10/\nlive",
            "rtsp:/192.0.2.10/live",
        )
        for address in invalid:
            with self.subTest(case=invalid.index(address)):
                with self.assertRaises(importer.ImportFailure) as caught:
                    importer.parse_camera(camera(address), {"CAM_PASSWORD": "fixture-secret"})
                self.assertNotIn("fixture-secret", str(caught.exception))
                self.assertNotIn("192.0.2.10", str(caught.exception))
                self.assertNotIn("rtsp:", str(caught.exception))

    def test_api_specific_field_limits_are_checked_before_import(self):
        for row in (camera(name="x" * 101),
                    camera("rtsp://" + "u" * 129 + ":p@192.0.2.10/live"),
                    camera("rtsp://user:${CAM_PASSWORD}@192.0.2.10/live")):
            with self.assertRaises(importer.ImportFailure):
                importer.parse_camera(row, {"CAM_PASSWORD": "x" * 513})

    def test_usb_non_rtsp_and_example_endpoints_are_skipped(self):
        for row in (camera(0, type="usb"), camera("rtsp://192.0.2.10/live", type="usb"),
                    camera("http://192.0.2.10/live"), camera("file:///fixture.mp4"),
                    camera("rtsp://camera.example/live")):
            self.assertIsNone(importer.parse_camera(row, {}))

    def test_endpoint_dedup_ignores_credentials_names_and_known_query_order(self):
        first = importer.parse_camera(camera(
            "rtsp://user:old@CAMERA.LOCAL/cam/realmonitor?channel=1&subtype=0"), {})
        second = importer.parse_camera(camera(
            "rtsp://other:new@camera.local:554/cam/realmonitor?subtype=0&channel=1",
            name="Different fixture"), {})
        self.assertEqual(importer.endpoint_key(first), importer.endpoint_key(second))
        second["rtspPath"] = "/cam/realmonitor?channel=2&subtype=0"
        self.assertNotEqual(importer.endpoint_key(first), importer.endpoint_key(second))

    def test_existing_custom_brand_url_matches_derived_template(self):
        incoming = importer.parse_camera(camera(
            "rtsp://192.0.2.10/cam/realmonitor?channel=1&subtype=0"), {})
        existing = {**incoming, "kind": "rtsp",
                    "rtspPath": "/cam/realmonitor?subtype=0&channel=1"}
        self.assertEqual(importer.endpoint_key(incoming), importer.endpoint_key(existing))
        existing["rtspPath"] += "&profile=custom"
        self.assertNotEqual(importer.endpoint_key(incoming), importer.endpoint_key(existing))

    def test_credentials_malformed_as_url_delimiters_cannot_be_silently_lost(self):
        for address in ("rtsp://user:p@ss@192.0.2.10/live",
                        "rtsp://user:p/ss@192.0.2.10/live",
                        "rtsp://user:p#ss@192.0.2.10/live"):
            with self.assertRaises(importer.ImportFailure):
                importer.parse_camera(camera(address), {})

    def test_usb_capture_is_explicit_bounded_and_has_no_credentials(self):
        for index in (0, "0", 15):
            row = camera(index, type="usb", username="unused", password="${MISSING}")
            self.assertIsNone(importer.parse_camera(row, {}))
            config = importer.parse_camera(row, {}, include_local=True)
            self.assertEqual((config["kind"], config["host"], config["usbIndex"]),
                             ("usb", "", int(index)))
            self.assertNotIn("password", config)
            self.assertNotIn("username", config)
            self.assertFalse(config["autoStart"])
            self.assertTrue(config["name"].endswith("[USB]"))
        for value in (-1, 16, True, "0.0", "rtsp://192.0.2.10/live", None):
            with self.assertRaises(importer.ImportFailure):
                importer.parse_camera(camera(value, type="usb"), {}, include_local=True)
        for source_type in ("http_snapshot", "http_mjpeg", "rtsp"):
            with self.assertRaises(importer.ImportFailure):
                importer.parse_camera(camera(0, type=source_type), {},
                                      include_local=True, include_http_alternatives=True)

    def test_http_capture_defaults_and_raw_credentials(self):
        for scheme, port in (("http", 80), ("https", 443)):
            row = camera(f"{scheme}://user%40lab:${{CAM_PASSWORD}}@192.0.2.10",
                         type="http")
            self.assertIsNone(importer.parse_camera(row, {}))
            config = importer.parse_camera(row, {"CAM_PASSWORD": "fixture@:/#%41"},
                                           include_http_alternatives=True)
            self.assertEqual((config["kind"], config["port"], config["httpScheme"],
                              config["httpPath"]), ("http_snapshot", port, scheme, "/"))
            self.assertEqual(config["username"], "user@lab")
            self.assertEqual(config["password"], "fixture@:/#%41")
            self.assertFalse(config["autoStart"])
            self.assertTrue(config["name"].endswith("[HTTP snapshot]"))

    def test_explicit_http_mjpeg_preserves_case_query_and_port(self):
        config = importer.parse_camera(camera(
            "https://[::1]:8443/Streaming/channels/1/httppreview?profile=1",
            type="http_mjpeg", username="fixture", password="raw%40@:/#"),
            {}, include_http_alternatives=True)
        self.assertEqual((config["kind"], config["host"], config["port"]),
                         ("http_mjpeg", "::1", 8443))
        self.assertEqual(config["httpPath"], "/Streaming/channels/1/httppreview?profile=1")
        self.assertEqual(config["password"], "raw%40@:/#")
        self.assertTrue(config["name"].endswith("[HTTP MJPEG]"))

    def test_http_sources_reject_unsafe_or_incompatible_urls(self):
        for address in ("https://169.254.169.254/snapshot",
                        "http://192.0.2.10/live?password=fixture-secret",
                        "http://192.0.2.10/live#fixture-secret",
                        "http://192.0.2.10:0/live",
                        "http://192.0.2.10/%0d%0a",
                        "http://192.0.2.10/${CAM_PASSWORD}",
                        "http://user:bad%ZZ@192.0.2.10/live",
                        "file:///fixture", "rtsp://192.0.2.10/live"):
            with self.assertRaises(importer.ImportFailure) as caught:
                importer.parse_camera(camera(address, type="http_snapshot"),
                                       {}, include_http_alternatives=True)
            self.assertNotIn("fixture-secret", str(caught.exception))
        self.assertIsNone(importer.parse_camera(camera("http://camera.example/live", type="http"),
                                                {}, include_http_alternatives=True))

    def test_endpoint_keys_distinguish_protocols_and_usb_indexes(self):
        rtsp = importer.parse_camera(camera("rtsp://192.0.2.10:80/live"), {})
        snapshot = importer.parse_camera(camera("http://192.0.2.10/live", type="http"), {},
                                         include_http_alternatives=True)
        mjpeg = {**snapshot, "kind": "http_mjpeg", "username": "different"}
        self.assertNotEqual(importer.endpoint_key(rtsp), importer.endpoint_key(snapshot))
        self.assertEqual(importer.endpoint_key(snapshot), importer.endpoint_key(mjpeg))
        self.assertNotEqual(importer.endpoint_key(snapshot),
                            importer.endpoint_key({**snapshot, "httpScheme": "https"}))
        usb = importer.parse_camera(camera(0, type="usb"), {}, include_local=True)
        self.assertEqual(importer.endpoint_key(usb), ("usb", 0))
        self.assertNotEqual(importer.endpoint_key(usb),
                            importer.endpoint_key({**usb, "usbIndex": 1}))


class SourceFixture:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, relative, value):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value if isinstance(value, str) else json.dumps(value),
                        encoding="utf-8")
        return path


@unittest.skipUnless(HAS_IMPORTER, "Importer not implemented yet")
class SourceTests(SourceFixture, unittest.TestCase):
    def test_conflict_selection_is_structural_readonly_and_default_skips(self):
        usb = camera(0, type="usb")
        primary = camera("rtsp://192.0.2.10/live",
                         httpMjpegUrl="http://user:${CAM_PASSWORD}@192.0.2.10/cgi-bin/mjpg/video.cgi")
        self.write(".env", "CAM_PASSWORD='fixture@:/#%41'\n")
        self.write("server/detection/cameras.json", {"cameras": [usb, primary]})
        current = json.dumps({"cameras": [usb]})
        incoming = json.dumps({"cameras": [usb, primary]})
        conflict = self.write("detection/cameras.json",
                              f"<<<<<<< HEAD\n{current}\n=======\n{incoming}\n>>>>>>> fixture\n")
        before = conflict.read_bytes()
        default = importer.read_sources(self.root)
        self.assertEqual([c.config["kind"] for c in default.candidates], ["rtsp"])
        for side in ("current", "incoming"):
            plan = importer.read_sources(self.root, conflict_side=side, include_local=True,
                                         include_http_alternatives=True)
            self.assertFalse(plan.errors)
            self.assertEqual([c.config["kind"] for c in plan.candidates],
                             ["usb", "rtsp", "http_mjpeg"])
            origin = next(o for o in plan.origins if o["origin"] == "detection/cameras.json")
            self.assertEqual(origin["conflictSide"], side)
            self.assertEqual(origin["status"], "valid")
            self.assertEqual(conflict.read_bytes(), before)

    def test_conflict_incoming_supplements_http_even_when_rtsp_is_duplicate(self):
        runtime = camera("rtsp://u:${CAM_PASSWORD}@192.0.2.10/live")
        incoming = {**runtime, "httpMjpegUrl":
                    "http://u:${CAM_PASSWORD}@192.0.2.10/cgi-bin/mjpg/video.cgi"}
        self.write(".env", "CAM_PASSWORD='fixture@:/#%41'\n")
        self.write("server/detection/cameras.json", {"cameras": [runtime]})
        self.write("detection/cameras.json",
                   '<<<<<<< HEAD\n{"cameras":[]}\n=======\n'
                   + json.dumps({"cameras": [incoming]}) + "\n>>>>>>> branch\n")
        plan = importer.read_sources(self.root, conflict_side="incoming", include_http_alternatives=True)
        self.assertFalse(plan.errors)
        self.assertEqual([c.config["kind"] for c in plan.candidates], ["rtsp", "http_mjpeg"])
        self.assertEqual(plan.duplicates, 1)
        self.assertEqual(plan.candidates[1].origin, "detection/cameras.json")
        self.assertEqual(plan.candidates[1].config["password"], "fixture@:/#%41")
        self.assertNotIn("192.0.2.", repr(plan))
        self.assertNotIn("fixture@:", repr(plan))
        skipped = importer.read_sources(self.root, conflict_side="current",
                                        include_http_alternatives=True)
        self.assertEqual(len(skipped.candidates), 1)

    def test_multiple_hunks_and_diff3_base_select_only_requested_side(self):
        text = ('{"cameras":[\n<<<<<<< HEAD\n'
                + json.dumps(camera("rtsp://192.0.2.10/current"))
                + "\n||||||| base\n"
                + json.dumps(camera("rtsp://192.0.2.10/base"))
                + "\n=======\n" + json.dumps(camera("rtsp://192.0.2.10/incoming"))
                + "\n>>>>>>> incoming\n,\n<<<<<<< HEAD\n"
                + json.dumps(camera("rtsp://192.0.2.11/current"))
                + "\n=======\n" + json.dumps(camera("rtsp://192.0.2.11/incoming"))
                + "\n>>>>>>> incoming\n]}\n")
        self.write("detection/cameras.json", text)
        for side in ("current", "incoming"):
            plan = importer.read_sources(self.root, conflict_side=side)
            self.assertFalse(plan.errors)
            self.assertEqual([c.config["rtspPath"] for c in plan.candidates], ["/" + side] * 2)

    def test_malformed_or_nested_conflicts_are_fatal_before_api_access(self):
        malformed = (
            "<<<<<<< HEAD\n{}\n=======\n{}\n",
            "=======\n{}\n>>>>>>> branch\n",
            "<<<<<<< HEAD\n<<<<<<< nested\n{}\n=======\n{}\n>>>>>>> nested\n=======\n{}\n>>>>>>> branch\n",
            "<<<<<<< HEAD\n{}\n=======\n<<<<<<< discarded\n{}\n=======\n{}\n>>>>>>> branch\n",
            "<<<<<<< HEAD\n{}\n======= label\n{}\n>>>>>>> branch\n",
            "<<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> branch\n",
            "<<<<<<< HEAD\n{}\n>>>>>>> branch\n",
            "<<<<<<< HEAD\n{}\n=======\n{}\n||||||| late-base\n{}\n>>>>>>> branch\n",
        )
        for text in malformed:
            self.write("detection/cameras.json", text)
            plan = importer.read_sources(self.root, conflict_side="current")
            self.assertTrue(plan.errors)
            self.assertTrue(any(e["code"] == "invalid_conflict_markers" for e in plan.errors))
            api = FakeApi()
            with self.assertRaises(importer.ImportFailure):
                importer.import_plan(plan, api, dry_run=False)
            self.assertFalse(api.calls)

    def test_http_alternatives_are_opt_in_and_do_not_inherit_rtsp_url_credentials(self):
        row = camera("rtsp://private:fixture-secret@192.0.2.10/live",
                     httpMjpegUrl="http://192.0.2.11/mjpeg",
                     httpSnapshotUrl="https://192.0.2.10/snapshot")
        self.write("server/detection/cameras.json", {"cameras": [row]})
        self.assertEqual(len(importer.read_sources(self.root).candidates), 1)
        plan = importer.read_sources(self.root, include_http_alternatives=True)
        self.assertFalse(plan.errors)
        self.assertEqual([c.config["kind"] for c in plan.candidates],
                         ["rtsp", "http_mjpeg", "http_snapshot"])
        self.assertEqual(plan.candidates[1].config["username"], "")
        self.assertEqual(plan.candidates[1].config["password"], "")
        self.assertTrue(all(not c.config["autoStart"] for c in plan.candidates))
        self.assertEqual(len({c.config["name"] for c in plan.candidates}), 3)

    def test_bad_selected_http_alternative_blocks_all_import_and_disabled_properties_are_ignored(self):
        row = camera(httpMjpegUrl="http://192.0.2.10/live?token=fixture-secret")
        self.write("server/detection/cameras.json", {"cameras": [row]})
        self.assertFalse(importer.read_sources(self.root).errors)
        plan = importer.read_sources(self.root, include_http_alternatives=True)
        self.assertTrue(plan.errors)
        api = FakeApi()
        with self.assertRaises(importer.ImportFailure):
            importer.import_plan(plan, api, dry_run=False)
        self.assertFalse(api.calls)
        self.write("server/detection/cameras.json", {"cameras": []})
        self.write("server/src/main/resources/application.properties",
                   "snapshot.enabled=false\nsnapshot.url=http://192.0.2.100/snapshot\n")
        self.write("detection/cameras.json.example", {"cameras": [row]})
        self.assertFalse(importer.read_sources(
            self.root, include_http_alternatives=True, include_local=True).candidates)

    def test_numeric_http_alternative_is_not_silently_imported_as_usb(self):
        self.write("server/detection/cameras.json", {"cameras": [camera(httpMjpegUrl=0)]})
        plan = importer.read_sources(self.root, include_http_alternatives=True, include_local=True)
        self.assertTrue(plan.errors)
        self.assertFalse(any(c.config["kind"] == "usb" for c in plan.candidates))
        with self.assertRaises(importer.ImportFailure):
            importer.import_plan(plan, FakeApi(), dry_run=False)

    def test_runtime_preferred_backup_supplements_and_conflict_is_never_resolved(self):
        self.write(".env", 'CAM_PASSWORD="fixture@:/#%41"\n')
        self.write("server/detection/cameras.json", {"cameras": [
            camera(0, type="usb"),
            camera("rtsp://user:${CAM_PASSWORD}@192.0.2.10/cam/realmonitor?channel=1&subtype=0"),
        ]})
        conflict = self.write("detection/cameras.json",
                              "<<<<<<< HEAD\nfixture-secret\n=======\nother\n>>>>>>> branch\n")
        self.write("detection/cameras.json.bak", {"cameras": [
            camera("rtsp://old:old-secret@192.0.2.10/cam/realmonitor?subtype=0&channel=1"),
            camera("rtsp://192.0.2.11/Streaming/Channels/101"),
        ]})
        self.write("detection/cameras.json.example", "{invalid example")
        before = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        plan = importer.read_sources(self.root)
        self.assertFalse(plan.errors)
        self.assertEqual(len(plan.candidates), 2)
        self.assertEqual(plan.candidates[0].config["password"], "fixture@:/#%41")
        self.assertEqual([c.origin for c in plan.candidates],
                         ["server/detection/cameras.json", "detection/cameras.json.bak"])
        self.assertEqual(plan.duplicates, 1)
        self.assertEqual(plan.skipped, 1)
        self.assertEqual(next(o["status"] for o in plan.origins
                              if o["origin"] == "detection/cameras.json"), "conflict")
        self.assertEqual(conflict.read_bytes(), before[conflict])
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()})
        self.assertNotIn("fixture@:", repr(plan))
        self.assertNotIn("192.0.2.", repr(plan))

    def test_malformed_json_duplicate_keys_and_bad_rows_are_fatal_preflight(self):
        bad_sources = ('{"cameras": [}', '{"cameras": [], "cameras": []}',
                       {"cameras": "wrong"}, {"cameras": [None]},
                       {"cameras": [camera(), camera("rtsp://bad:port/live")]})
        for value in bad_sources:
            self.write("server/detection/cameras.json", value)
            plan = importer.read_sources(self.root)
            self.assertTrue(plan.errors)
            api = FakeApi()
            with self.assertRaises(importer.ImportFailure):
                importer.import_plan(plan, api, dry_run=False)
            self.assertEqual(api.calls, [])

    def test_dotenv_is_not_environment_expansion_and_malformed_dotenv_is_safe(self):
        self.write(".env", "CAM_PASSWORD='literal${NOT_AN_ENV}%41'\n")
        self.write("server/detection/cameras.json", {"cameras": [
            camera("rtsp://u:${CAM_PASSWORD}@192.0.2.10/live"),
        ]})
        before = dict(os.environ)
        with patch.dict(os.environ, {"CAM_PASSWORD": "wrong-fixture"}):
            plan = importer.read_sources(self.root)
        self.assertFalse(plan.errors)
        self.assertEqual(plan.candidates[0].config["password"], "literal${NOT_AN_ENV}%41")
        self.assertEqual(before, dict(os.environ))
        self.write(".env", 'CAM_PASSWORD="unterminated-fixture-secret\n')
        capture = io.StringIO()
        with contextlib.redirect_stderr(capture):
            invalid = importer.read_sources(self.root)
        self.assertTrue(invalid.errors)
        self.assertNotIn("fixture-secret", capture.getvalue() + repr(invalid))

    def test_missing_dotenv_placeholder_is_not_satisfied_by_process_environment(self):
        self.write("server/detection/cameras.json", {"cameras": [
            camera("rtsp://u:${CAM_PASSWORD}@192.0.2.10/live"),
        ]})
        with patch.dict(os.environ, {"CAM_PASSWORD": "fixture-secret"}):
            self.assertTrue(importer.read_sources(self.root).errors)


class FakeApi:
    def __init__(self, items=None, bindings=None):
        self.items = copy.deepcopy(items or [])
        self.bindings = list(bindings or [None] * 16)
        self.calls = []
        self.next_id = 100
        self.before_binding_read = None

    def request(self, method, path="", payload=None):
        self.calls.append((method, path, copy.deepcopy(payload)))
        if method == "GET" and path == "/auth":
            return {"enabled": True, "authorized": True, "tokenConfigured": True}
        if method == "GET" and path == "":
            if self.before_binding_read and any(c[0] == "POST" for c in self.calls):
                self.before_binding_read(self)
                self.before_binding_read = None
            return {"items": copy.deepcopy(self.items), "bindings": list(self.bindings)}
        if method == "POST" and path == "":
            self.next_id += 1
            item = {**payload, "id": f"{self.next_id:032x}", "status": "stopped"}
            self.items.append(item)
            return {"device": copy.deepcopy(item)}
        if method == "PUT" and path == "/bindings":
            self.bindings = list(payload["bindings"])
            return {"bindings": list(self.bindings)}
        raise AssertionError("Unexpected importer operation")


@unittest.skipUnless(HAS_IMPORTER, "Importer not implemented yet")
class ImportTests(SourceFixture, unittest.TestCase):
    def test_mixed_protocol_import_and_binding_are_idempotent_without_any_capture(self):
        self.write("server/detection/cameras.json", {"cameras": [
            camera(0, type="usb"),
            camera(httpMjpegUrl="http://192.0.2.10/mjpeg"),
            camera("https://192.0.2.10/snapshot", type="http"),
        ]})
        plan = importer.read_sources(self.root, include_local=True, include_http_alternatives=True)
        self.assertFalse(plan.errors)
        self.assertEqual(len(plan.candidates), 4)
        api = FakeApi()
        with patch.object(socket, "create_connection", side_effect=AssertionError("No network")):
            preview = importer.import_plan(plan, api, bind_empty=True)
            self.assertEqual(preview["toCreate"], 4)
            self.assertFalse(any(c[0] != "GET" for c in api.calls))
            first = importer.import_plan(plan, api, dry_run=False, bind_empty=True)
            self.assertEqual(first["created"], 4)
            self.assertEqual(first["bindingsAdded"], 4)
            usb_payload = next(c[2] for c in api.calls if c[0] == "POST" and c[2]["kind"] == "usb")
            self.assertNotIn("password", usb_payload)
            self.assertNotIn("username", usb_payload)
            before = copy.deepcopy(api.items)
            api.calls.clear()
            second = importer.import_plan(plan, api, dry_run=False, bind_empty=True)
            self.assertEqual(second["alreadyPresent"], 4)
            self.assertEqual(second["created"], 0)
            self.assertEqual(api.items, before)
            self.assertFalse(any(c[0] != "GET" for c in api.calls))
            self.assertTrue(all(not item["autoStart"] for item in api.items))

    def plan(self):
        self.write("server/detection/cameras.json", {"cameras": [
            camera(), camera("rtsp://192.0.2.11/Streaming/Channels/101"),
        ]})
        return importer.read_sources(self.root)

    def test_dry_run_and_rerun_do_not_overwrite_existing_credentials_or_config(self):
        plan = self.plan()
        existing = {**plan.candidates[0].config, "id": "a" * 32,
                    "name": "Existing fixture", "password": "keep-this-fixture", "autoStart": True}
        api = FakeApi([existing], ["a" * 32] + [None] * 15)
        preview = importer.import_plan(plan, api, dry_run=True, bind_empty=True)
        self.assertEqual((preview["alreadyPresent"], preview["toCreate"]), (1, 1))
        self.assertFalse(any(c[0] != "GET" for c in api.calls))
        result = importer.import_plan(plan, api, dry_run=False, bind_empty=True)
        self.assertEqual(result["created"], 1)
        self.assertEqual(api.items[0], existing)
        self.assertEqual(api.bindings[0], existing["id"])
        self.assertEqual(api.bindings[1], api.items[1]["id"])
        self.assertFalse(api.items[1]["autoStart"])
        api.calls.clear()
        again = importer.import_plan(plan, api, dry_run=False, bind_empty=True)
        self.assertEqual(again["created"], 0)
        self.assertFalse(any(c[0] != "GET" for c in api.calls))
        self.assertNotIn("keep-this-fixture", json.dumps(result))
        self.assertNotIn("192.0.2.", json.dumps(result))

    def test_bind_only_source_matches_and_refresh_slots_before_binding(self):
        plan = self.plan()
        unrelated = importer.parse_camera(camera("rtsp://192.0.2.50/unrelated"), {})
        unrelated["id"] = "b" * 32
        api = FakeApi([unrelated])
        api.before_binding_read = lambda client: client.bindings.__setitem__(0, "b" * 32)
        importer.import_plan(plan, api, dry_run=False, bind_empty=True)
        self.assertEqual(api.bindings[0], "b" * 32)
        self.assertEqual(api.bindings.count("b" * 32), 1)
        self.assertEqual(api.bindings[1:3], [item["id"] for item in api.items[1:]])
        self.assertTrue(all(call[1] in ("", "/auth", "/bindings") for call in api.calls))

    def test_full_slots_are_preserved_and_binding_is_opt_in(self):
        plan = self.plan()
        existing = {**plan.candidates[0].config, "id": "a" * 32}
        api = FakeApi([existing], ["a" * 32] * 16)
        result = importer.import_plan(plan, api, dry_run=False, bind_empty=True)
        self.assertEqual(result["bindingsAdded"], 0)
        self.assertEqual(api.bindings, ["a" * 32] * 16)
        other = FakeApi()
        importer.import_plan(plan, other, dry_run=False)
        self.assertFalse(any(call[0] == "PUT" for call in other.calls))

    def test_capacity_and_malformed_inventory_fail_before_any_write(self):
        plan = self.plan()
        items = [{**importer.parse_camera(camera(f"rtsp://192.0.2.{n + 100}/live"), {}),
                  "id": f"{n:032x}"} for n in range(16)]
        for api in (FakeApi(items), FakeApi(bindings=[None] * 15)):
            with self.assertRaises(importer.ImportFailure):
                importer.import_plan(plan, api, dry_run=False, bind_empty=True)
            self.assertFalse(any(c[0] != "GET" for c in api.calls))

    def test_failed_create_is_not_retried_and_prior_success_is_preserved(self):
        plan = self.plan()
        api = FakeApi()
        original = api.request
        def request(method, path="", payload=None):
            if method == "POST" and len(api.items) == 1:
                raise importer.ImportFailure("api_request_failed")
            return original(method, path, payload)
        api.request = request
        with self.assertRaises(importer.ImportFailure):
            importer.import_plan(plan, api, dry_run=False, bind_empty=True)
        self.assertEqual(len(api.items), 1)
        self.assertFalse(any(c[0] in ("PUT", "DELETE") for c in api.calls))
        api.request = original
        result = importer.import_plan(plan, api, dry_run=False, bind_empty=True)
        self.assertEqual(result["created"], 1)
        self.assertEqual(len(api.items), 2)

    def test_disabled_or_unauthorized_auth_blocks_all_writes(self):
        plan = self.plan()
        for auth in ({"enabled": False, "authorized": True},
                     {"enabled": True, "authorized": False}):
            api = FakeApi()
            original = api.request
            api.request = lambda method, path="", payload=None: (
                auth if path == "/auth" else original(method, path, payload))
            with self.assertRaises(importer.ImportFailure):
                importer.import_plan(plan, api, dry_run=False)
            self.assertFalse(api.calls)

    def test_candidate_mutation_is_revalidated_before_api_access(self):
        plan = self.plan()
        plan.candidates[-1].config["autoStart"] = True
        api = FakeApi()
        with self.assertRaises(importer.ImportFailure):
            importer.import_plan(plan, api, dry_run=False)
        self.assertFalse(api.calls)

    def test_binding_target_reconfigured_during_import_is_not_bound(self):
        plan = self.plan()
        api = FakeApi()
        api.before_binding_read = lambda client: client.items[0].update(host="192.0.2.200")
        with self.assertRaises(importer.ImportFailure):
            importer.import_plan(plan, api, dry_run=False, bind_empty=True)
        self.assertFalse(any(c[0] == "PUT" for c in api.calls))


@unittest.skipUnless(HAS_IMPORTER, "Importer not implemented yet")
class HttpAndCliTests(SourceFixture, unittest.TestCase):
    def token(self, value="synthetic-admin-token-123456"):
        return self.write("admin.token", value + "\n")

    def test_short_local_token_requires_explicit_per_client_opt_in(self):
        token = self.token("abcd")
        with self.assertRaises(importer.ImportFailure):
            importer.BridgeApi("http://127.0.0.1:8012", token)
        for value in ("abcd", "x" * 15, "x" * 16):
            with patch.object(importer, "build_opener") as build:
                client = importer.BridgeApi("http://localhost:8012", self.token(value),
                                            allow_short_local_token=True)
            self.assertEqual(client._base, "http://127.0.0.1:8012/api/device-bridges")
            self.assertFalse(build.return_value.open.called)
        with self.assertRaises(importer.ImportFailure):
            importer.BridgeApi("http://127.0.0.1:8012", self.token("abcd"))

    def test_short_token_opt_in_keeps_loopback_and_token_content_restrictions(self):
        for value in ("", "abc", "a bcd", "abcd\x00", "a\r\nbcd", "x" * 257):
            with self.assertRaises(importer.ImportFailure):
                importer.BridgeApi("http://127.0.0.1:8012", self.token(value),
                                   allow_short_local_token=True)
        for url in ("http://remote.example", "http://192.0.2.10",
                    "http://user:fixture-secret@127.0.0.1"):
            with patch.object(importer, "_read_text") as read:
                with self.assertRaises(importer.ImportFailure):
                    importer.BridgeApi(url, self.root / "absent.token",
                                       allow_short_local_token=True)
                read.assert_not_called()

    def test_short_token_exception_is_http_only_and_https_retains_default_minimum(self):
        for value in ("abcd", "x" * 15):
            with self.assertRaises(importer.ImportFailure):
                importer.BridgeApi("https://127.0.0.1:8012", self.token(value),
                                   allow_short_local_token=True)
        with patch.object(importer, "build_opener") as build:
            importer.BridgeApi("https://127.0.0.1:8012", self.token("x" * 16),
                               allow_short_local_token=True)
            self.assertFalse(build.return_value.open.called)

    def test_cli_short_token_flag_is_explicit_and_dry_run_remains_read_only(self):
        self.write("server/detection/cameras.json", {"cameras": [camera()]})
        args = ["--source-root", str(self.root), "--token-file", str(self.token("abcd")), "--dry-run"]
        for opt_in, expected in ((False, 1), (True, 0)):
            stdout, stderr, api = io.StringIO(), io.StringIO(), FakeApi()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                with patch.object(importer.BridgeApi, "request", side_effect=api.request):
                    with patch.object(socket, "create_connection", side_effect=AssertionError("No network")):
                        code = importer.main(args + (["--allow-short-local-token"] if opt_in else []))
            self.assertEqual(code, expected)
            self.assertNotIn("abcd", stdout.getvalue() + stderr.getvalue())
            if opt_in:
                report = json.loads(stdout.getvalue())
                self.assertEqual(report["mode"], "dry-run")
                self.assertEqual(report["created"], 0)
                self.assertTrue(report["inventoryChecked"])
                self.assertTrue(all(call[0] == "GET" for call in api.calls))
            else:
                self.assertEqual(api.calls, [])

    def test_loopback_validation_pins_localhost_and_rejects_remote_or_credential_urls(self):
        for value, expected in (
            ("http://127.0.0.1:8012", "http://127.0.0.1:8012/api/device-bridges"),
            ("http://localhost:8012/api/", "http://127.0.0.1:8012/api/device-bridges"),
            ("http://[::1]:8012/api/device-bridges/", "http://[::1]:8012/api/device-bridges"),
        ):
            self.assertEqual(importer.normalize_api_url(value), expected)
        for value in ("http://192.0.2.1:8012", "http://remote.example", "http://127.0.0.1.example",
                      "http://user:fixture-secret@127.0.0.1", "http://127.0.0.1?token=fixture",
                      "file:///fixture", "http://127.1", "http://2130706433",
                      "http://127.0.0.1/api/device-bridges/other", "http://[::1%25scope]"):
            with self.assertRaises(importer.ImportFailure):
                importer.normalize_api_url(value)

    def test_client_uses_file_token_disables_proxies_and_redirects(self):
        with patch.object(importer, "build_opener") as build:
            client = importer.BridgeApi("http://localhost:8012", self.token())
        handlers = build.call_args.args
        self.assertTrue(any(getattr(h, "proxies", None) == {} for h in handlers))
        redirect = next(h for h in handlers if hasattr(h, "redirect_request"))
        self.assertIsNone(redirect.redirect_request(None, None, 302, "", {}, "http://remote.example"))
        response = io.BytesIO(b'{"items": [], "bindings": []}')
        response.status = 200
        build.return_value.open.return_value = response
        client.request("GET")
        req = build.return_value.open.call_args.args[0]
        self.assertEqual(req.full_url, "http://127.0.0.1:8012/api/device-bridges")
        self.assertEqual(req.get_header("X-admin-token"), "synthetic-admin-token-123456")
        self.assertIsNone(req.data)

    def test_bad_token_and_api_failures_never_echo_credentials(self):
        for value in ("short", "synthetic-admin-token\r\nInjected: secret", "x" * 257,
                      "synthetic-admin-token\x00"):
            with self.assertRaises(importer.ImportFailure) as caught:
                importer.BridgeApi("http://127.0.0.1:8012", self.token(value))
            self.assertNotIn(value, str(caught.exception))
        for failure in (URLError("fixture-secret at 192.0.2.10"),
                        HTTPError("http://fixture-secret", 401, "fixture-secret", {}, None)):
            with patch.object(importer, "build_opener") as build:
                client = importer.BridgeApi("http://127.0.0.1:8012", self.token())
            build.return_value.open.side_effect = failure
            with self.assertRaises(importer.ImportFailure) as caught:
                client.request("GET")
            self.assertNotIn("fixture-secret", str(caught.exception))
            self.assertNotIn("192.0.2.", str(caught.exception))

    def test_http_client_serializes_secret_in_body_only_and_bounds_bad_responses(self):
        with patch.object(importer, "build_opener") as build:
            client = importer.BridgeApi("http://127.0.0.1:8012", self.token())
        response = io.BytesIO(b'{"device": {}}')
        response.status = 200
        build.return_value.open.return_value = response
        client.request("POST", payload={"password": "fixture@:/#%41"})
        request = build.return_value.open.call_args.args[0]
        self.assertEqual(json.loads(request.data)["password"], "fixture@:/#%41")
        self.assertNotIn("fixture@", request.full_url + repr(request.headers))
        for raw in (b'{"password": "fixture-secret"', b'{"a":1,"a":2}', b"x" * 2_000_001):
            response = io.BytesIO(raw)
            response.status = 200
            build.return_value.open.return_value = response
            with self.assertRaises(importer.ImportFailure) as caught:
                client.request("GET")
            self.assertNotIn("fixture-secret", str(caught.exception))

    def test_default_dry_run_is_offline_and_cli_errors_are_sanitized(self):
        self.write("server/detection/cameras.json", {"cameras": [camera()]})
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            with patch.object(socket, "create_connection", side_effect=AssertionError("No network")):
                code = importer.main(["--source-root", str(self.root)])
        self.assertEqual(code, 0)
        report = json.loads(stdout.getvalue())
        self.assertEqual(report["mode"], "dry-run")
        self.assertFalse(report["inventoryChecked"])
        self.assertEqual(report["candidates"], 1)
        self.assertNotIn("fixture-secret", stdout.getvalue() + stderr.getvalue())
        for args in (["--apply"], ["--token", "fixture-secret"],
                     ["--api-url", "http://fixture-secret@remote.example"]):
            stdout, stderr = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = importer.main(["--source-root", str(self.root), *args])
            self.assertNotEqual(code, 0)
            self.assertNotIn("fixture-secret", stdout.getvalue() + stderr.getvalue())

    def test_cli_new_flags_select_incoming_and_remain_offline_without_token(self):
        incoming = {"cameras": [camera(0, type="usb"),
                                camera(httpMjpegUrl="http://192.0.2.10/mjpeg")]}
        self.write("detection/cameras.json", '<<<<<<< HEAD\n{"cameras":[]}\n=======\n'
                   + json.dumps(incoming) + "\n>>>>>>> incoming\n")
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            with patch.object(socket, "create_connection", side_effect=AssertionError("No network")):
                code = importer.main(["--source-root", str(self.root), "--conflict-side", "incoming",
                                      "--include-local", "--include-http-alternatives"])
        self.assertEqual(code, 0, stderr.getvalue())
        report = json.loads(stdout.getvalue())
        self.assertEqual(report["kinds"], {"usb": 1, "rtsp": 1, "http_mjpeg": 1})
        self.assertFalse(report["inventoryChecked"])
        self.assertEqual(report["created"], 0)
        self.assertNotIn("fixture-secret", stdout.getvalue() + stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
