"""Download the pinned originals; never replace a mismatching local file."""
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]


def fetch():
    policy = ROOT / 'unity/Game/Assets/Shell/Resources/PropPolicyBatch6.json'
    for item in json.loads(policy.read_text(encoding='utf8'))['props']:
        recipe = item['replacement']
        if not recipe['source'].startswith('https://'):
            continue
        path = ROOT / recipe['blend']
        if path.exists():
            content = path.read_bytes()
        else:
            with urlopen(Request(recipe['source'], headers={'User-Agent':'Mozilla/5.0'}), timeout=120) as response:
                content = response.read()
        if hashlib.sha256(content).hexdigest() != recipe['blendSha']:
            raise ValueError(f'{item["id"]}: source SHA-256 mismatch')
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('xb') as dest: dest.write(content)
        print(item['id'], recipe['blendSha'])


if __name__ == '__main__':
    fetch()
