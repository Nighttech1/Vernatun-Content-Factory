"""Manual Scout collector. No third-party dependencies, retries or publishing."""
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


class ScoutError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(url, *, headers=None, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=210) as response:
            body = response.read(10_000_001)
        if len(body) > 10_000_000:
            raise ScoutError('Provider response exceeds 10 MB; not retried')
        return json.loads(body)
    except urllib.error.HTTPError as exc:
        raise ScoutError(f'Provider HTTP {exc.code}; not retried') from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        raise ScoutError('Provider connection or JSON error; not retried') from None


def validate(env):
    mode = env.get('SCOUT_MODE', 'check')
    if mode == 'instagram':
        raise ScoutError('Instagram collection runs only in the Wednesday/Saturday @mosarmclub briefing')
    if mode not in ('check', 'youtube'):
        raise ScoutError('Unsupported mode')
    if mode == 'check':
        return {'mode': mode}
    report = env.get('SCOUT_REPORT_ID', '')
    if not re.fullmatch(r'S-20\d{2}(0[1-9]|1[0-2])-(GEN|CAR|REL|ART|YTB)-\d{2}', report):
        raise ScoutError('Invalid report ID')
    if env.get('SCOUT_AUTHORIZATION') != f'COLLECT {report}':
        raise ScoutError('Explicit collection authorization is required')
    handles = list(dict.fromkeys(h.strip().lstrip('@') for h in
                               env.get('SCOUT_HANDLES', 'mosarmclub').split(',') if h.strip()))
    if not handles or len(handles) > 5 or any(
            not re.fullmatch(r'[\w.-]{1,100}', h) for h in handles):
        raise ScoutError('Expected 1–5 public handles, not URLs')
    try:
        limit = int(env.get('SCOUT_LIMIT', '5'))
    except ValueError:
        raise ScoutError('Invalid limit') from None
    if not 1 <= limit <= 12 or len(handles) * limit > 50:
        raise ScoutError('Limit must be 1–12 per handle and at most 50 total')
    secret = env.get('YOUTUBE_API_KEY')
    if not secret:
        raise ScoutError('Required repository secret is missing')
    return dict(mode=mode, report_id=report, handles=handles, limit=limit,
                secret=secret)


def youtube(config):
    def api(resource, **params):
        result = request_json('https://www.googleapis.com/youtube/v3/' + resource + '?' +
                              urllib.parse.urlencode(params),
                              headers={'X-Goog-Api-Key': config['secret']})
        if not isinstance(result, dict) or 'error' in result or not isinstance(result.get('items'), list):
            raise ScoutError('Unexpected YouTube response')
        return result['items']

    channels = []
    for handle in config['handles']:
        items = api('channels', part='snippet,statistics,contentDetails', forHandle=handle)
        if len(items) != 1:
            raise ScoutError('YouTube channel not found; no fabricated fallback')
        channel = items[0]
        uploads = channel['contentDetails']['relatedPlaylists']['uploads']
        videos = api('playlistItems', part='contentDetails', playlistId=uploads,
                     maxResults=config['limit'])
        ids = ','.join(v['contentDetails']['videoId'] for v in videos)
        stats = api('videos', part='snippet,statistics', id=ids) if ids else []
        channels.append({'handle': handle, 'group': 'ours' if handle.lower() == 'mosarmclub' else 'competitors',
                         'source_url': 'https://www.youtube.com/channel/' + channel['id'],
                         'channel': channel, 'videos': [dict(v, source_url=
                            'https://www.youtube.com/watch?v=' + v['id']) for v in stats]})
    return {'channels': channels}


def redact(value, env):
    encoded = json.dumps(value, ensure_ascii=False, indent=2)
    for name in ('YOUTUBE_API_KEY', 'APIFY_TOKEN', 'APIFY_API_KEY'):
        secret = env.get(name)
        if secret:
            # Replace JSON-escaped secret, too; provider text is untrusted.
            encoded = encoded.replace(json.dumps(secret, ensure_ascii=False)[1:-1], '[REDACTED]')
    return encoded


def main(env=None, output=None):
    env = os.environ if env is None else env
    target = Path(output or 'work/scout-actions-result')
    target.mkdir(parents=True, exist_ok=True)
    result = {'collected_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
              'repository': env.get('GITHUB_REPOSITORY'), 'commit': env.get('GITHUB_SHA'),
              'run_id': env.get('GITHUB_RUN_ID'), 'run_attempt': env.get('GITHUB_RUN_ATTEMPT'),
              'status': 'failed'}
    code = 1
    try:
        config = validate(env)
        result['mode'] = config['mode']
        if config['mode'] == 'check':
            result.update(status='presence_checked_not_authenticated',
                          secrets_present={'YOUTUBE_API_KEY': bool(env.get('YOUTUBE_API_KEY')),
                              'APIFY_TOKEN_OR_API_KEY': bool(env.get('APIFY_TOKEN') or env.get('APIFY_API_KEY'))},
                          provider_api_requests=0)
        else:
            result.update(report_id=config['report_id'], handles=config['handles'],
                          limit_per_handle=config['limit'])
            result['data'] = youtube(config)
            result['status'] = 'collected'
        code = 0
    except ScoutError as exc:
        result['error'] = str(exc)
    except Exception:
        # Never expose exceptions containing request URLs, headers or credentials.
        result['error'] = 'Unexpected collector/response error; not retried'
    (target / 'snapshot.json').write_text(redact(result, env) + '\n', encoding='utf-8')
    print('Scout: ' + result['status'] + '; see snapshot.json')
    return code


if __name__ == '__main__':
    sys.exit(main())
