"""Check production CORS options without importing the database-backed app."""
import ast
from pathlib import Path
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.cors import CORSMiddleware


class NativeCorsTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse((Path(__file__).parents[1] / 'app/main.py').read_text(encoding='utf-8'))
        call = next(node for node in ast.walk(tree)
                    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr == 'add_middleware' and node.args
                    and isinstance(node.args[0], ast.Name) and node.args[0].id == 'CORSMiddleware')
        options = {kw.arg: ast.literal_eval(kw.value) for kw in call.keywords}
        app = FastAPI()
        app.add_middleware(CORSMiddleware, **options)

        @app.get('/auth')
        def auth():
            return {'authorized': False}

        self.client = TestClient(app)

    def test_native_dashboard_initial_credentialed_request(self):
        origin = 'http://127.0.0.1:8080'
        response = self.client.get('/auth', headers={'Origin': origin})
        self.assertEqual(response.headers.get('access-control-allow-origin'), origin)
        self.assertEqual(response.headers.get('access-control-allow-credentials'), 'true')

    def test_untrusted_origin_not_allowed(self):
        response = self.client.get('/auth', headers={'Origin': 'https://untrusted.example'})
        self.assertNotIn('access-control-allow-origin', response.headers)

    def test_admin_header_preflight(self):
        response = self.client.options('/auth', headers={
            'Origin': 'http://127.0.0.1:8080',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'X-Admin-Token,Content-Type',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://127.0.0.1:8080')


if __name__ == '__main__':
    unittest.main()
