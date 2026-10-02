import json
import base64
import hashlib
import hmac
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlencode, urlsplit
from urllib.request import Request, urlopen

_SIGNED_TOKEN_CACHE = {}


def _blob_auth():
    token = os.getenv('VERCEL_OIDC_TOKEN') or os.getenv('BLOB_READ_WRITE_TOKEN')
    store_id = os.getenv('BLOB_STORE_ID', '').removeprefix('store_').lower()
    if not token or not store_id:
        raise RuntimeError(
            'Connect a Vercel Blob store and configure its authentication before using file storage.'
        )
    return token, store_id


def save_upload(relative_path: str, content: bytes, content_type: str, upload_root: str) -> str:
    if os.getenv('VERCEL'):
        token, store_id = _blob_auth()
        api_url = 'https://blob.vercel-storage.com/?' + urlencode({'pathname': relative_path})
        request = Request(
            api_url,
            data=content,
            method='PUT',
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/octet-stream',
                'x-api-version': '12',
                'x-api-blob-request-id': f'{store_id}:{os.urandom(8).hex()}',
                'x-api-blob-request-attempt': '0',
                'x-vercel-blob-store-id': store_id,
                'x-vercel-blob-access': 'private',
                'x-content-type': content_type or 'application/octet-stream',
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                result = json.loads(response.read())
        except HTTPError as exc:
            raise RuntimeError(f'Vercel Blob upload failed with HTTP {exc.code}.') from exc
        except (URLError, TimeoutError) as exc:
            raise RuntimeError('Vercel Blob could not be reached.') from exc

        url = result.get('url')
        if not isinstance(url, str) or not url.startswith('https://'):
            raise RuntimeError('Vercel Blob returned an invalid upload URL.')
        return url

    destination = os.path.realpath(os.path.join(upload_root, relative_path))
    root = os.path.realpath(upload_root)
    if os.path.commonpath((root, destination)) != root:
        raise ValueError('Upload path escapes the configured storage directory.')
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    with open(destination, 'wb') as upload_file:
        upload_file.write(content)
    return '/uploads/' + relative_path.replace(os.path.sep, '/')


def signed_private_blob_url(blob_url: str) -> str:
    parsed = urlsplit(blob_url)
    if parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith(
        '.private.blob.vercel-storage.com'
    ):
        raise ValueError('Expected a private Vercel Blob URL.')

    token, store_id = _blob_auth()
    blob_store_id = parsed.hostname.removesuffix('.private.blob.vercel-storage.com').lower()
    if blob_store_id != store_id:
        raise ValueError('The stored file belongs to a different Vercel Blob store.')

    pathname = unquote(parsed.path.lstrip('/'))
    if not pathname or any(part in {'.', '..'} for part in pathname.split('/')):
        raise ValueError('The stored Vercel Blob path is invalid.')

    now = int(time.time() * 1000)
    cached = _SIGNED_TOKEN_CACHE.get(pathname)
    if cached and cached['valid_until'] > now + 15_000:
        signed_token = cached
    else:
        valid_until = now + 60 * 60 * 1000
        request = Request(
            'https://blob.vercel-storage.com/signed-token',
            data=json.dumps({
                'pathname': pathname,
                'operations': ['get'],
                'validUntil': valid_until,
            }).encode(),
            method='POST',
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
                'x-api-version': '12',
                'x-api-blob-request-id': f'{store_id}:{os.urandom(8).hex()}',
                'x-api-blob-request-attempt': '0',
                'x-vercel-blob-store-id': store_id,
            },
        )
        try:
            with urlopen(request, timeout=15) as response:
                signed_token = json.loads(response.read())
        except HTTPError as exc:
            raise RuntimeError(f'Vercel Blob could not sign the file URL (HTTP {exc.code}).') from exc
        except (URLError, TimeoutError) as exc:
            raise RuntimeError('Vercel Blob could not be reached to sign the file URL.') from exc

        if not all(signed_token.get(key) for key in ('delegationToken', 'clientSigningToken')):
            raise RuntimeError('Vercel Blob returned incomplete signed URL credentials.')
        signed_token['valid_until'] = int(signed_token.get('validUntil', valid_until))
        _SIGNED_TOKEN_CACHE[pathname] = signed_token

    delegation = signed_token['delegationToken']
    token_payload = delegation.split('.', 1)[0]
    try:
        token_payload += '=' * (-len(token_payload) % 4)
        delegated_store_id = json.loads(
            base64.urlsafe_b64decode(token_payload).decode()
        )['storeId'].removeprefix('store_').lower()
    except (ValueError, KeyError, TypeError) as exc:
        raise RuntimeError('Vercel Blob returned an invalid delegation token.') from exc
    if delegated_store_id != store_id:
        raise RuntimeError('Vercel Blob signed a file for an unexpected store.')

    canonical = f'operation=get\npathname={pathname}'
    signature = base64.urlsafe_b64encode(
        hmac.new(
            signed_token['clientSigningToken'].encode(),
            canonical.encode(),
            hashlib.sha256,
        ).digest()
    ).decode().rstrip('=')
    signed_url = (
        f'https://{store_id}.private.blob.vercel-storage.com/{quote(pathname, safe="/")}'
        f'?{urlencode({"vercel-blob-delegation": delegation, "vercel-blob-signature": signature})}'
    )
    return signed_url
