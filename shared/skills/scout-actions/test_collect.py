"""Offline safety and transport contract tests; never call provider APIs."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('collect', Path(__file__).with_name('collect.py'))
collect = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collect)


class CollectorTests(unittest.TestCase):
    def env(self, mode='instagram', **overrides):
        return dict(SCOUT_MODE=mode, SCOUT_REPORT_ID='S-202611-GEN-01',
                    SCOUT_AUTHORIZATION='COLLECT S-202611-GEN-01',
                    SCOUT_HANDLES='example', SCOUT_LIMIT='5',
                    YOUTUBE_API_KEY='test-youtube-secret', APIFY_TOKEN='test-apify-secret',
                    **overrides)

    def run_collector(self, env):
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()) as logs:
            code = collect.main(env, folder)
            raw = (Path(folder) / 'snapshot.json').read_text()
            for key in ('YOUTUBE_API_KEY', 'APIFY_TOKEN', 'APIFY_API_KEY'):
                if env.get(key):
                    self.assertNotIn(env[key], raw + logs.getvalue())
            return code, json.loads(raw)

    def test_check_never_calls_network(self):
        with patch.object(collect, 'request_json', side_effect=AssertionError('network')) as net:
            code, data = self.run_collector({'SCOUT_MODE': 'check'})
        self.assertEqual(code, 0)
        self.assertEqual(data['provider_api_requests'], 0)
        self.assertFalse(data['secrets_present']['YOUTUBE_API_KEY'])
        net.assert_not_called()

    def test_authorization_and_limits_before_network(self):
        cases = [{'SCOUT_AUTHORIZATION': ''}, {'SCOUT_REPORT_ID': '../../bad'},
                 {'SCOUT_LIMIT': '51'}, {'SCOUT_LIMIT': '0'},
                 {'SCOUT_LIMIT': 'NaN'},
                 {'SCOUT_HANDLES': 'a,b,c,d,e', 'SCOUT_LIMIT': '12'},
                 {'SCOUT_HANDLES': 'https://evil.example/x'}, {'YOUTUBE_API_KEY': ''}]
        for changes in cases:
            env = self.env('youtube')
            env.update(changes)
            with self.subTest(changes=changes), patch.object(collect, 'request_json') as net:
                code, result = self.run_collector(env)
                self.assertEqual(code, 1)
                self.assertEqual(result['status'], 'failed')
                net.assert_not_called()

    def test_manual_instagram_disabled_even_for_own_profile(self):
        env = self.env()
        env['SCOUT_HANDLES'] = 'mosarmclub'
        with patch.object(collect, 'request_json') as net:
            code, result = self.run_collector(env)
        self.assertEqual(code, 1)
        self.assertIn('@mosarmclub', result['error'])
        net.assert_not_called()

    def test_youtube_three_calls_per_channel_no_search(self):
        responses = [{'items': [{'id': 'UC1', 'statistics': {'subscriberCount': '42'},
                                 'contentDetails': {'relatedPlaylists': {'uploads': 'UU1'}}}]},
                     {'items': [{'contentDetails': {'videoId': 'video1'}}]},
                     {'items': [{'id': 'video1', 'statistics': {'viewCount': '7'}}]}]
        with patch.object(collect, 'request_json', side_effect=responses) as net:
            code, result = self.run_collector(self.env('youtube'))
        self.assertEqual(code, 0)
        self.assertEqual(net.call_count, 3)
        for call in net.call_args_list:
            self.assertNotIn('/search', call.args[0])
            self.assertNotIn('test-youtube-secret', call.args[0])
        self.assertEqual(result['data']['channels'][0]['videos'][0]['source_url'],
                         'https://www.youtube.com/watch?v=video1')

    def test_http_error_sanitized_and_not_retried(self):
        opener = unittest.mock.Mock()
        opener.open.side_effect = urllib.error.HTTPError(
            'https://x?secret=private', 403, 'private', {}, None)
        with patch.object(collect.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(collect.ScoutError, '^Provider HTTP 403; not retried$'):
                collect.request_json('https://example.com')
        opener.open.assert_called_once()

    def test_escaped_secret_redaction(self):
        secret = 'secret"\\\nvalue'
        self.assertEqual(json.loads(collect.redact({'x': secret}, {'APIFY_TOKEN': secret}))['x'], '[REDACTED]')


if __name__ == '__main__':
    unittest.main()
