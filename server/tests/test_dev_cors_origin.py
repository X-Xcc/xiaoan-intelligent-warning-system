"""Verify the local Vite dashboard origin is included in the API CORS policy."""
import ast
from pathlib import Path
import unittest


class DevCorsOriginTests(unittest.TestCase):
    def test_vite_dashboard_origin_is_allowed(self):
        tree = ast.parse((Path(__file__).parents[1] / 'app/main.py').read_text(encoding='utf-8'))
        call = next(node for node in ast.walk(tree)
                    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr == 'add_middleware' and node.args
                    and isinstance(node.args[0], ast.Name) and node.args[0].id == 'CORSMiddleware')
        options = {kw.arg: ast.literal_eval(kw.value) for kw in call.keywords}
        self.assertIn('http://127.0.0.1:5177', options['allow_origins'])


if __name__ == '__main__':
    unittest.main()
