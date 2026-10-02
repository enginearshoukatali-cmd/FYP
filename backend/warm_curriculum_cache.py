import argparse
import json
import os
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REQUEST_TIMEOUT_SECONDS = 600
REQUEST_ATTEMPTS = 3


def get_json(api_base_url, path):
    request = Request(
        f'{api_base_url}{path}',
        headers={'User-Agent': 'BalochistanAcadmyCurriculumCache/1.0'},
    )
    last_error = None
    for attempt in range(REQUEST_ATTEMPTS):
        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                return json.load(response)
        except HTTPError as exc:
            detail = exc.read(2000).decode('utf-8', errors='replace')
            last_error = f'HTTP {exc.code}: {detail}'
            if exc.code < 500 and exc.code not in {408, 425, 429}:
                break
        except (URLError, TimeoutError, OSError) as exc:
            last_error = str(exc)

        if attempt + 1 < REQUEST_ATTEMPTS:
            time.sleep(2 ** attempt)
    raise RuntimeError(last_error or 'Unknown API error')


def main():
    parser = argparse.ArgumentParser(
        description='Download official BTBB e-books into the backend persistent cache.'
    )
    parser.add_argument(
        '--base-url',
        default=os.getenv(
            'CURRICULUM_API_BASE_URL',
            f'http://127.0.0.1:{os.getenv("PORT", "8000")}',
        ),
        help='Backend URL (defaults to this service on its PORT).',
    )
    parser.add_argument(
        '--grade',
        action='append',
        help='Only prepare this grade; may be supplied more than once.',
    )
    parser.add_argument(
        '--book-id',
        action='append',
        type=int,
        help='Only prepare this book ID; may be supplied more than once.',
    )
    parser.add_argument(
        '--include-other-levels',
        action='store_true',
        help='Include Primer and General titles when preparing the full catalogue.',
    )
    args = parser.parse_args()
    api_base_url = args.base_url.rstrip('/')

    try:
        books = get_json(api_base_url, '/api/curriculum/books')
    except (RuntimeError, ValueError, TypeError) as exc:
        print(f'Could not load the textbook catalogue: {exc}', file=sys.stderr)
        return 1

    digital_books = [book for book in books if book.get('ebook_available')]
    if args.grade:
        selected_grades = {grade.strip().lower() for grade in args.grade}
        digital_books = [
            book for book in digital_books
            if str(book.get('grade', '')).lower() in selected_grades
        ]
    elif not args.include_other_levels:
        digital_books = [
            book for book in digital_books
            if str(book.get('grade', '')).isdigit()
            and 1 <= int(book['grade']) <= 12
        ]
    if args.book_id:
        selected_ids = set(args.book_id)
        digital_books = [book for book in digital_books if book.get('id') in selected_ids]
    print(f'Preparing {len(digital_books)} official digital textbooks at {api_base_url}')
    failures = []
    total_bytes = 0

    for index, book in enumerate(digital_books, start=1):
        book_id = book.get('id')
        title = book.get('title') or f'Book {book_id}'
        try:
            result = get_json(api_base_url, f'/api/curriculum/books/{book_id}/prepare')
            size_bytes = int(result.get('size_bytes', 0))
            total_bytes += size_bytes
            print(
                f'[{index}/{len(digital_books)}] READY '
                f'{title} ({size_bytes / (1024 * 1024):.1f} MiB)'
            )
        except (RuntimeError, ValueError, TypeError) as exc:
            failures.append((book_id, title, str(exc)))
            print(f'[{index}/{len(digital_books)}] FAILED {title}: {exc}')

    print(
        f'Finished: {len(digital_books) - len(failures)}/{len(digital_books)} ready; '
        f'{total_bytes / (1024 * 1024):.1f} MiB cached.'
    )
    if failures:
        print('Some titles could not be cached. Run this command again to retry them:')
        for book_id, title, error in failures:
            print(f'  id={book_id} {title}: {error}')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
