from __future__ import annotations

import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import system_control


class LocalAdminTokenTests(unittest.TestCase):
    def token_environment(self, token="1234", environment="local", enabled="true"):
        return patch.dict(os.environ, {
            "APP_ENV": environment,
            "CICSIC_ADMIN_TOKEN": token,
            "CICSIC_ALLOW_SHORT_LOCAL_ADMIN_TOKEN": enabled,
            "CICSIC_ALLOW_SHORT_ADMIN_TOKEN": "false",
        })

    def test_explicit_local_override_accepts_four_character_token(self):
        with self.token_environment():
            self.assertEqual(system_control._environment_admin_token(), "1234")
            self.assertTrue(system_control.admin_token_configured({}))

    def test_local_override_does_not_authorize_wrong_or_missing_token(self):
        with self.token_environment(), \
                patch.object(system_control, "get_platform_settings", return_value={"adminAuthEnabled": True}), \
                patch.object(system_control, "_raw_platform_settings", return_value={}):
            self.assertTrue(system_control.verify_admin_token("1234"))
            for token in (None, "", "4321", "12345"):
                with self.subTest(token=token):
                    self.assertFalse(system_control.verify_admin_token(token))

    def test_local_environment_requires_explicit_override(self):
        for enabled in ("", "false", "0"):
            with self.subTest(enabled=enabled), self.token_environment(enabled=enabled):
                self.assertIsNone(system_control._environment_admin_token())

    def test_other_environments_reject_short_token_even_with_override(self):
        for environment in ("production", "staging", "development", "test", ""):
            with self.subTest(environment=environment), self.token_environment(environment=environment):
                self.assertIsNone(system_control._environment_admin_token())
                self.assertFalse(system_control.admin_token_configured({}))

    def test_missing_environment_defaults_to_production(self):
        with self.token_environment():
            os.environ.pop("APP_ENV", None)
            self.assertIsNone(system_control._environment_admin_token())

    def test_local_length_boundaries(self):
        for length in (0, 3, 4, 15, 16, 256, 257):
            token = "x" * length
            with self.subTest(length=length), self.token_environment(token=token):
                expected = token if 4 <= length <= 256 else None
                self.assertEqual(system_control._environment_admin_token(), expected)

    def test_production_length_boundaries_are_unchanged(self):
        for length in (0, 4, 15, 16, 256, 257):
            token = "x" * length
            with self.subTest(length=length), self.token_environment(token=token, environment="production"):
                expected = token if 16 <= length <= 256 else None
                self.assertEqual(system_control._environment_admin_token(), expected)

    def test_explicit_deployment_override_accepts_requested_token(self):
        with self.token_environment(environment="production"), \
                patch.dict(os.environ, {"CICSIC_ALLOW_SHORT_ADMIN_TOKEN": "true"}):
            self.assertEqual(system_control._environment_admin_token(), "1234")
            self.assertTrue(system_control.admin_token_configured({}))

    def test_deployment_override_keeps_authentication_required(self):
        with self.token_environment(environment="production"), \
                patch.dict(os.environ, {
                    "CICSIC_ALLOW_SHORT_ADMIN_TOKEN": "true",
                    "CICSIC_ADMIN_AUTH_ENABLED": "false",
                }), \
                patch.object(system_control, "_raw_platform_settings", return_value={}), \
                patch.object(system_control, "get_platform_settings", return_value={"adminAuthEnabled": True}):
            self.assertTrue(system_control._admin_auth_enabled({"adminAuthEnabled": False}))
            self.assertTrue(system_control.verify_admin_token("1234"))
            for token in (None, "", "4321", "12345"):
                with self.subTest(token=token):
                    self.assertFalse(system_control.verify_admin_token(token))

    def test_deployment_override_length_boundaries(self):
        for length in (0, 3, 4, 15, 16, 256, 257):
            token = "x" * length
            with self.subTest(length=length), \
                    self.token_environment(token=token, environment="production"), \
                    patch.dict(os.environ, {"CICSIC_ALLOW_SHORT_ADMIN_TOKEN": "true"}):
                expected = token if 4 <= length <= 256 else None
                self.assertEqual(system_control._environment_admin_token(), expected)


if __name__ == "__main__":
    unittest.main()
