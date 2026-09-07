"""Training API regressions using only unique temporary databases and servers."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import json
import math
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
TASK_IDS = [f"TRAIN-READINESS-{index:03d}" for index in range(1, 4)]


class TrainingWorkspaceAPI(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="cicsic-training-api-")
        self.addCleanup(self.temporary.cleanup)
        self.database_file = Path(self.temporary.name) / "training.sqlite3"
        self.log_file = Path(self.temporary.name) / "server.log"
        self.process = None
        self.addCleanup(self.stop_server)
        self.start_server()

    def start_server(self) -> None:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        self.assertNotEqual(port, 8010)
        self.base_url = f"http://127.0.0.1:{port}"
        environment = {
            **os.environ,
            "APP_ENV": "development",
            "CICSIC_ADMIN_AUTH_ENABLED": "false",
            "DATABASE_URL": f"sqlite:///{self.database_file.as_posix()}",
            "CICSIC_ALLOW_SQLITE_TESTS": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": os.pathsep.join(path for path in sys.path if path),
        }
        with self.log_file.open("ab") as log:
            self.process = subprocess.Popen(
                [
                    # Bypass the Windows venv redirector so this PID owns the server.
                    getattr(sys, "_base_executable", sys.executable), "-B", "-m", "uvicorn", "app.main:app",
                    "--app-dir", str(SERVER_DIR), "--host", "127.0.0.1",
                    "--port", str(port), "--log-level", "warning",
                ],
                cwd=ROOT,
                env=environment,
                stdout=log,
                stderr=log,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                self.fail(self.log_file.read_text(encoding="utf-8", errors="replace"))
            try:
                status, _ = self.request("/api/health")
                if status == 200:
                    return
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(0.1)
        self.fail("Isolated API server did not become ready")

    def stop_server(self) -> None:
        if self.process is not None:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=8)
            self.process = None

    def request(self, path: str, method: str = "GET", payload: dict | None = None) -> tuple[int, dict]:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path, data=body, method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            response = urllib.request.urlopen(request, timeout=8)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            text = response.read().decode("utf-8")
            try:
                result = json.loads(text)
            except json.JSONDecodeError:
                result = {"detail": text}
            return response.code, result

    def api(self, path: str, method: str = "GET", payload: dict | None = None, expected: int = 200) -> dict:
        status, result = self.request("/api/training" + path, method, payload)
        self.assertEqual(status, expected, f"{method} {path}: {result}")
        return result

    def task(self, task_id: str = TASK_IDS[0]) -> dict:
        return next(item for item in self.api("/tasks")["items"] if item["taskId"] == task_id)

    def completed(self, task_id: str = TASK_IDS[0], elapsed: int = 28) -> dict:
        self.api(f"/tasks/{task_id}/start", "POST")
        return self.api(f"/tasks/{task_id}/complete", "POST", {"elapsedSeconds": elapsed})["task"]

    def assessed(self, task_id: str = TASK_IDS[0], elapsed: int = 28) -> dict:
        self.completed(task_id, elapsed)
        return self.api(f"/tasks/{task_id}/assessment", "POST")["assessment"]

    def review(self, assessment: dict, decision: str = "confirmed", expected: int = 200) -> dict:
        return self.api(
            f"/assessments/{assessment['assessmentId']}/review", "POST",
            {"decision": decision, "reason": "样例教官复核", "reviewerId": "INSTRUCTOR-TEST"},
            expected=expected,
        )

    def stored_rows(self) -> dict:
        with closing(sqlite3.connect(self.database_file)) as connection:
            return {
                table: connection.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
                for table in ("training_tasks", "training_assessments", "training_exceptions", "training_archives")
            }

    def test_assessment_gets_are_read_only_even_before_sample_initialization(self) -> None:
        before = self.stored_rows()
        self.assertEqual(before["training_tasks"], [])
        self.assertEqual(self.api("/assessments"), {"dataMode": "desensitized_sample", "items": []})
        self.api(f"/tasks/{TASK_IDS[0]}/assessment", expected=404)
        self.api("/tasks/missing/assessment", expected=404)
        self.assertEqual(self.stored_rows(), before)
        self.api("/tasks")
        before = self.stored_rows()
        self.api(f"/tasks/{TASK_IDS[0]}/assessment", expected=404)
        self.assertEqual(self.api("/assessments")["items"], [])
        self.assertEqual(self.stored_rows(), before)
        self.completed()
        before = self.stored_rows()
        self.api(f"/tasks/{TASK_IDS[0]}/assessment", expected=404)
        self.assertEqual(self.api("/assessments")["items"], [])
        self.assertEqual(self.stored_rows(), before)

    def test_unstarted_completion_is_conflict_without_writes(self) -> None:
        self.api("/tasks")
        before = self.stored_rows()
        self.api(f"/tasks/{TASK_IDS[0]}/complete", "POST", {"elapsedSeconds": 28}, expected=409)
        self.assertEqual(self.stored_rows(), before)

    def test_premature_assessment_is_conflict_without_writes(self) -> None:
        self.api("/tasks")
        for started in (False, True):
            with self.subTest(started=started):
                if started:
                    self.api(f"/tasks/{TASK_IDS[0]}/start", "POST")
                before = self.stored_rows()
                self.api(f"/tasks/{TASK_IDS[0]}/assessment", "POST", expected=409)
                self.assertEqual(self.stored_rows(), before)

    def test_start_is_idempotent_but_completed_without_assessment_cannot_start(self) -> None:
        first = self.api(f"/tasks/{TASK_IDS[0]}/start", "POST")
        self.assertEqual(first["task"]["status"], "训练中")
        before = self.stored_rows()
        self.assertEqual(self.api(f"/tasks/{TASK_IDS[0]}/start", "POST"), first)
        self.assertEqual(self.stored_rows(), before)
        self.api(f"/tasks/{TASK_IDS[0]}/complete", "POST", {"elapsedSeconds": 28})
        before = self.stored_rows()
        self.api(f"/tasks/{TASK_IDS[0]}/start", "POST", expected=409)
        self.assertEqual(self.stored_rows(), before)

    def test_completion_replay_preserves_result_and_rejects_conflicting_elapsed(self) -> None:
        completed = self.completed()
        self.assertIsInstance(completed.get("createdAt"), str)
        self.assertEqual(
            self.api(f"/tasks/{TASK_IDS[0]}/complete", "POST", {"elapsedSeconds": 28})["task"], completed,
        )
        before = self.stored_rows()
        self.api(f"/tasks/{TASK_IDS[0]}/complete", "POST", {"elapsedSeconds": 29}, expected=409)
        self.assertEqual(self.stored_rows(), before)
        assessment = self.api(f"/tasks/{TASK_IDS[0]}/assessment", "POST")["assessment"]
        self.review(assessment)
        before = self.stored_rows()
        self.api(f"/tasks/{TASK_IDS[0]}/complete", "POST", {"elapsedSeconds": 28})
        self.api(f"/tasks/{TASK_IDS[0]}/complete", "POST", {"elapsedSeconds": 29}, expected=409)
        self.assertEqual(self.stored_rows(), before)

    def test_retry_requires_completed_assessed_task(self) -> None:
        self.api("/tasks")
        self.api(f"/tasks/{TASK_IDS[0]}/retry", "POST", expected=409)
        self.api(f"/tasks/{TASK_IDS[0]}/start", "POST")
        self.api(f"/tasks/{TASK_IDS[0]}/retry", "POST", expected=409)
        self.api(f"/tasks/{TASK_IDS[0]}/complete", "POST", {"elapsedSeconds": 28})
        self.api(f"/tasks/{TASK_IDS[0]}/retry", "POST", expected=404)
        assessment = self.api(f"/tasks/{TASK_IDS[0]}/assessment", "POST")["assessment"]
        self.review(assessment, "rejected")
        self.assertEqual(self.task()["status"], "待复训")
        retry = self.api(f"/tasks/{TASK_IDS[0]}/retry", "POST")["task"]
        self.assertEqual(retry["status"], "待训练")
        self.assertEqual(retry["traineeId"], self.task()["traineeId"])
        self.api(f"/tasks/{TASK_IDS[0]}/start", "POST", expected=409)
        self.assertEqual(self.api(f"/tasks/{retry['taskId']}/start", "POST")["task"]["status"], "训练中")

    def test_blank_review_and_exception_fields_are_rejected_without_writes(self) -> None:
        assessment = self.assessed()
        routes = [
            (f"/assessments/{assessment['assessmentId']}/review",
             {"decision": "confirmed", "reason": "样例复核", "reviewerId": "INSTRUCTOR-TEST"},
             ("reason", "reviewerId")),
            (f"/tasks/{TASK_IDS[0]}/exception",
             {"reason": "样例设备异常", "reportedBy": "INSTRUCTOR-TEST"},
             ("reason", "reportedBy")),
        ]
        for path, valid, fields in routes:
            for field in fields:
                for blank in ("", " \t\n", "\u3000"):
                    with self.subTest(path=path, field=field, blank=repr(blank)):
                        before = self.stored_rows()
                        self.api(path, "POST", {**valid, field: blank}, expected=422)
                        self.assertEqual(self.stored_rows(), before)

    def test_final_review_is_immutable_for_all_decisions(self) -> None:
        for task_id, decision in zip(TASK_IDS, ("confirmed", "revised", "rejected")):
            with self.subTest(decision=decision):
                assessment = self.assessed(task_id)
                reviewed = self.review(assessment, decision)
                before = self.stored_rows()
                self.assertEqual(self.review(assessment, decision), reviewed)
                self.assertEqual(
                    self.api(
                        f"/assessments/{assessment['assessmentId']}/review", "POST",
                        {"decision": decision, "reason": "不能覆盖原意见", "reviewerId": "OTHER-INSTRUCTOR"},
                    ),
                    reviewed,
                )
                for conflict in {"confirmed", "revised", "rejected"} - {decision}:
                    self.review(assessment, conflict, expected=409)
                self.assertEqual(self.stored_rows(), before)
                self.assertEqual(self.task(task_id)["status"], "待复训" if decision == "rejected" else "已归档")

    def test_three_officers_and_repeated_retests_have_distinct_records_and_scores(self) -> None:
        initial = self.api("/tasks")["items"]
        self.assertEqual(len({task["traineeId"] for task in initial}), 3)
        assessments, exceptions, archives, retraining_ids = [], [], [], set()
        for attempt in range(3):
            for initial_task in initial:
                root_id = initial_task["taskId"]
                task_id = root_id
                if attempt:
                    task_id = self.api(f"/tasks/{root_id}/retry", "POST")["task"]["taskId"]
                    self.assertTrue(task_id.endswith(f"-RETEST-{attempt:02d}"))
                threshold = initial_task["standard"]["thresholdSeconds"]
                elapsed = threshold + attempt * 5
                assessment = self.assessed(task_id, elapsed)
                self.assertEqual(assessment["score"]["completionTime"], 100 - attempt * 25)
                self.assertIn(f"elapsedSeconds:{elapsed}", assessment["evidence"])
                self.assertEqual(self.task(task_id)["traineeId"], initial_task["traineeId"])
                exception = self.api(
                    f"/tasks/{task_id}/exception", "POST",
                    {"reason": "样例设备异常", "reportedBy": "INSTRUCTOR-TEST"},
                )["task"]["exception"]
                reviewed = self.review(assessment)["assessment"]
                self.assertEqual(self.api(f"/tasks/{task_id}/assessment", "POST")["assessment"], reviewed)
                assessments.append(reviewed)
                exceptions.append({**exception, "taskId": task_id})
                archive = next(item for item in self.api("/archives")["items"] if item["taskId"] == task_id)
                self.assertEqual(archive["assessmentId"], reviewed["assessmentId"])
                self.assertEqual(archive["traineeId"], initial_task["traineeId"])
                archives.append(archive)
                retraining = self.api(f"/archives/{archive['recordId']}/retraining", "POST")["task"]
                self.assertEqual(retraining["traineeId"], initial_task["traineeId"])
                self.assertEqual(
                    self.api(f"/archives/{archive['recordId']}/retraining", "POST")["task"], retraining,
                )
                retraining_ids.add(retraining["taskId"])
        for rows, key in ((assessments, "assessmentId"), (assessments, "auditId"),
                          (exceptions, "exceptionId"), (exceptions, "auditId"),
                          (archives, "recordId"), (archives, "auditId")):
            self.assertEqual(len({row[key] for row in rows}), 9, key)
        self.assertEqual(len(retraining_ids), 9)
        self.assertEqual(len(self.api("/assessments")["items"]), 9)
        self.assertEqual(len(self.api("/archives")["items"]), 9)
        for assessment, exception, archive in zip(assessments, exceptions, archives):
            task_id = assessment["taskId"]
            self.assertEqual(assessment["assessmentId"], f"ASSESS-{task_id}")
            self.assertEqual(assessment["auditId"], f"AUDIT-READINESS-{task_id}")
            self.assertEqual(exception["exceptionId"], f"EXCEPTION-{task_id}")
            self.assertEqual(exception["auditId"], f"AUDIT-EXCEPTION-{task_id}")
            self.assertEqual(archive["recordId"], f"RECORD-{task_id}")
            self.assertIn(f"RETRAIN-{task_id}", retraining_ids)
            self.assertEqual(self.api(f"/tasks/{task_id}/assessment")["assessment"], assessment)

    def test_new_record_ids_include_the_full_task_id(self) -> None:
        assessment = self.assessed()
        self.assertEqual(assessment["assessmentId"], f"ASSESS-{TASK_IDS[0]}")
        self.assertEqual(assessment["auditId"], f"AUDIT-READINESS-{TASK_IDS[0]}")

    def test_archive_recommendation_is_explicitly_sample_not_training_policy(self) -> None:
        self.review(self.assessed())
        recommendation = self.api("/archives")["items"][0]["retrainingRecommendation"]
        self.assertIn("样例", recommendation)
        self.assertIn("非训练规范", recommendation)
        self.assertNotIn("7 日", recommendation)

    def test_legacy_start_from_reviewed_creates_a_running_retest(self) -> None:
        assessment = self.assessed()
        for reviewed in (False, True):
            if reviewed:
                self.review(assessment)
            before = self.task()
            retry = self.api(f"/tasks/{TASK_IDS[0]}/start", "POST")["task"]
            self.assertEqual(retry["status"], "训练中")
            self.assertNotEqual(retry["taskId"], TASK_IDS[0])
            self.assertEqual(self.task(), before)
            self.api(f"/tasks/{retry['taskId']}/complete", "POST", {"elapsedSeconds": 28})
            result = self.api(f"/tasks/{retry['taskId']}/assessment", "POST")["assessment"]
            self.review(result)

    def test_assessments_and_archives_persist_across_server_restart(self) -> None:
        assessment = self.assessed()
        reviewed = self.review(assessment)["assessment"]
        archives = self.api("/archives")
        rows = self.stored_rows()
        self.stop_server()
        self.start_server()
        self.assertEqual(self.api("/assessments")["items"], [reviewed])
        self.assertEqual(self.api(f"/tasks/{TASK_IDS[0]}/assessment")["assessment"], reviewed)
        self.assertEqual(self.api(f"/tasks/{TASK_IDS[0]}/assessment", "POST")["assessment"], reviewed)
        self.assertEqual(self.api("/archives"), archives)
        self.assertEqual(self.stored_rows(), rows)

    def test_legacy_records_are_reused_by_task_relationship(self) -> None:
        assessment = self.assessed()
        self.api(f"/tasks/{TASK_IDS[0]}/exception", "POST", {"reason": "样例异常", "reportedBy": "TEST"})
        self.review(assessment)
        archive = self.api("/archives")["items"][0]
        retraining = self.api(f"/archives/{archive['recordId']}/retraining", "POST")["task"]
        self.stop_server()
        with closing(sqlite3.connect(self.database_file)) as connection, connection:
            connection.execute(
                "UPDATE training_assessments SET assessmentId = 'ASSESS-001', auditId = 'AUDIT-READINESS-001'"
            )
            connection.execute(
                "UPDATE training_archives SET recordId = 'RECORD-001', assessmentId = 'ASSESS-001', "
                "auditId = 'ARCHIVE-AUDIT-READINESS-001'"
            )
            connection.execute(
                "UPDATE training_exceptions SET exceptionId = 'EXCEPTION-001', auditId = 'AUDIT-EXCEPTION-001'"
            )
            connection.execute(
                "UPDATE training_tasks SET taskId = 'RETRAIN-001', basis = ? WHERE taskId = ?",
                (json.dumps([*retraining["basis"][:-1], "来源档案 RECORD-001"]), retraining["taskId"]),
            )
        self.start_server()
        old = self.api(f"/tasks/{TASK_IDS[0]}/assessment")["assessment"]
        self.assertEqual(old["assessmentId"], "ASSESS-001")
        self.assertEqual(self.api(f"/tasks/{TASK_IDS[0]}/assessment", "POST")["assessment"], old)
        self.assertEqual(self.api("/assessments")["items"], [old])
        self.assertEqual(self.review(old)["assessment"], old)
        self.assertEqual(self.api("/archives")["items"][0]["recordId"], "RECORD-001")
        exception = self.api(
            f"/tasks/{TASK_IDS[0]}/exception", "POST", {"reason": "样例异常补充", "reportedBy": "TEST"},
        )["task"]["exception"]
        self.assertEqual(exception["exceptionId"], "EXCEPTION-001")
        self.assertEqual(
            self.api("/archives/RECORD-001/retraining", "POST")["task"]["taskId"], "RETRAIN-001",
        )
        retry = self.api(f"/tasks/{TASK_IDS[0]}/retry", "POST")["task"]
        self.review(self.assessed(retry["taskId"]))
        self.assertEqual(len(self.api("/archives")["items"]), 2)

    def test_parallel_assessment_review_and_retry_requests_do_not_duplicate_records(self) -> None:
        self.completed()
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(
                lambda _: self.request(f"/api/training/tasks/{TASK_IDS[0]}/assessment", "POST"), range(4),
            ))
        self.assertTrue(all(status == 200 for status, _ in results), results)
        assessment = results[0][1]["assessment"]
        self.assertTrue(all(result["assessment"] == assessment for _, result in results))
        with ThreadPoolExecutor(max_workers=2) as executor:
            reviews = list(executor.map(
                lambda decision: self.request(
                    f"/api/training/assessments/{assessment['assessmentId']}/review", "POST",
                    {"decision": decision, "reason": "样例并发复核", "reviewerId": "TEST"},
                ), ("confirmed", "rejected"),
            ))
        self.assertEqual(sorted(status for status, _ in reviews), [200, 409])
        with ThreadPoolExecutor(max_workers=4) as executor:
            retries = list(executor.map(
                lambda _: self.request(f"/api/training/tasks/{TASK_IDS[0]}/retry", "POST"), range(4),
            ))
        self.assertTrue(all(status == 200 for status, _ in retries), retries)
        self.assertEqual(len({result["task"]["taskId"] for _, result in retries}), 4)
        self.assertEqual(len(self.api("/assessments")["items"]), 1)

    def test_missing_objects_return_404_and_invalid_elapsed_is_422(self) -> None:
        for suffix, payload in (
            ("start", None), ("complete", {"elapsedSeconds": 28}),
            ("exception", {"reason": "sample", "reportedBy": "TEST"}),
            ("assessment", None), ("retry", None),
        ):
            with self.subTest(suffix=suffix):
                self.api(f"/tasks/missing/{suffix}", "POST", payload, expected=404)
        self.api("/assessments/missing/review", "POST",
                 {"decision": "confirmed", "reason": "sample", "reviewerId": "TEST"}, expected=404)
        self.api("/archives/missing/retraining", "POST", expected=404)
        for elapsed in (-1, 3601):
            self.api(f"/tasks/{TASK_IDS[0]}/complete", "POST", {"elapsedSeconds": elapsed}, expected=422)

    def test_duty_situation_contract_preserves_old_readiness(self) -> None:
        readiness = self.api("/readiness")
        self.assertEqual(readiness["dataMode"], "desensitized_sample")
        self.assertIn("脱敏样例", readiness["notice"])
        self.assertEqual([item["value"] for item in readiness["riskComposition"]], [42, 31, 27])
        self.assertEqual(len(readiness["heatZones"]), 2)
        self.assertEqual(len(readiness["timeTrend"]), 4)
        self.assertEqual(len(readiness["recommendations"]), 3)
        standards = ("30 秒内取用完毕", "10 秒内完成转换", "30 米警戒圈 60 秒内设定")
        for recommendation, task_id, threshold, label in zip(
            readiness["recommendations"], TASK_IDS, (30, 10, 60), standards,
        ):
            self.assertEqual(recommendation["taskId"], task_id)
            self.assertIsInstance(recommendation["basis"], list)
            self.assertTrue(all(isinstance(basis, str) for basis in recommendation["basis"]))
            self.assertIsInstance(recommendation["standard"], dict)
            self.assertEqual(recommendation["standard"]["thresholdSeconds"], threshold)
            self.assertEqual(recommendation["standard"]["label"], label)
        self.assertEqual(readiness["recommendations"][-1]["standard"]["targetMeters"], 30)
        self.assertIn("dutySituation", readiness)
        duty = readiness["dutySituation"]
        self.assertEqual(set(duty), {"title", "location", "period", "composition", "timeTrend", "zones", "recommendations"})
        self.assertEqual(duty["title"], "A1 勤务态势大屏")
        self.assertEqual(duty["location"], "绳金塔夜市")
        self.assertEqual(duty["period"], "今晚 18:00–01:00")
        self.assertEqual([(row["label"], row["value"]) for row in duty["composition"]],
                         [("滋事纠纷", 41), ("手机扒窃", 28), ("其他", 27), ("可疑物品", 4)])
        for item in duty["composition"]:
            self.assertEqual(set(item), {"label", "value", "color"})
        red = duty["composition"][-1]["color"].lstrip("#")
        self.assertEqual(len(red), 6)
        self.assertGreater(int(red[:2], 16), max(int(red[2:4], 16), int(red[4:], 16)))
        trend = duty["timeTrend"]
        for hour in trend:
            self.assertEqual(set(hour), {"time", "value"})
            self.assertIsInstance(hour["time"], str)
            self.assertIn(type(hour["value"]), (int, float))
            self.assertTrue(math.isfinite(hour["value"]))
            self.assertGreaterEqual(hour["value"], 0)
        self.assertEqual([row["time"] for row in trend], [f"{hour:02d}:00" for hour in (18, 19, 20, 21, 22, 23, 0, 1)])
        self.assertEqual([row["time"] for row in trend[2:6]], ["20:00", "21:00", "22:00", "23:00"])
        self.assertGreater(min(row["value"] for row in trend[2:6]), max(row["value"] for row in trend[:2] + trend[6:]))
        for zone in duty["zones"]:
            self.assertEqual(set(zone), {"id", "name", "level", "share", "x", "y", "description"})
            for key in ("id", "name", "level", "description"):
                self.assertIsInstance(zone[key], str)
            for key in ("share", "x", "y"):
                self.assertIn(type(zone[key]), (int, float))
            self.assertTrue(all(0 <= zone[key] <= 100 for key in ("x", "y", "share")))
            self.assertIn("样例", zone["description"])
        primary = max(duty["zones"], key=lambda row: row["share"])
        self.assertEqual(primary["id"], "B")
        self.assertEqual(primary["name"], "烧烤摊聚集区")
        self.assertEqual(primary["level"], "high")
        self.assertEqual([item["taskId"] for item in duty["recommendations"]], TASK_IDS)
        self.assertEqual([item["subject"] for item in duty["recommendations"]],
                         ["单警装备训练", "弱光执法战术训练", "防爆先期处置"])
        for recommendation, standard in zip(duty["recommendations"], standards):
            self.assertEqual(set(recommendation), {"taskId", "subject", "basis", "standard"})
            for key in ("taskId", "subject", "basis", "standard"):
                self.assertIsInstance(recommendation[key], str, f"{recommendation['taskId']}.{key}")
            self.assertIn("样例", recommendation["basis"])
            self.assertEqual(recommendation["standard"], standard)
        self.assertEqual(self.stored_rows()["training_tasks"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
