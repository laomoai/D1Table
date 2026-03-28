#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
D1Table Client - Cloudflare D1-based data table management
"""

import json
import os
import re
import requests
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

_ISO_DATETIME_RE = re.compile(
    r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
)


class D1TableError(Exception):
    """Raised when a D1Table API request fails."""


def parse_iso_datetime(iso_string: str) -> datetime:
    """Parse an ISO 8601 datetime string into local time."""
    if not iso_string:
        return None
    try:
        if iso_string.endswith('Z'):
            iso_string = iso_string[:-1] + '+00:00'
        dt = datetime.fromisoformat(iso_string)
        if dt.tzinfo:
            dt = dt.astimezone()
        return dt
    except (ValueError, TypeError, AttributeError):
        return None


class D1TableClient:
    """D1Table API client."""

    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None,
                 config_path: Optional[str] = None, timeout: Optional[int] = None):
        """Initialize the client.

        Priority (highest to lowest):
        1. Constructor arguments base_url / api_key / timeout
        2. Environment variables D1TABLE_URL / D1TABLE_KEY / D1TABLE_TIMEOUT
        3. config.json file (openclaw workspace or skill directory)
        """
        env_url = os.environ.get('D1TABLE_URL')
        env_key = os.environ.get('D1TABLE_KEY')
        env_timeout = os.environ.get('D1TABLE_TIMEOUT')

        file_url, file_key, file_timeout = None, None, None
        if not (base_url or env_url) or not (api_key or env_key):
            path = None
            if config_path:
                path = Path(config_path)
            else:
                openclaw_path = Path.home() / ".openclaw" / "workspace" / "config.json"
                skill_path = Path(__file__).parent.parent / "config.json"
                if openclaw_path.exists():
                    path = openclaw_path
                elif skill_path.exists():
                    path = skill_path

            if path and path.exists():
                with open(path, 'r', encoding='utf-8') as f:
                    cfg = json.load(f).get('d1table', {})
                file_url = cfg.get('baseUrl')
                file_key = cfg.get('apiKey')
                file_timeout = cfg.get('timeout')

        self.base_url = (base_url or env_url or file_url or '').rstrip('/')
        self.api_key = api_key or env_key or file_key or ''
        self.timeout = timeout or (int(env_timeout) if env_timeout else None) or file_timeout or 30

        if not self.base_url:
            raise ValueError(
                "D1Table URL is missing. Set the D1TABLE_URL environment variable or configure d1table.baseUrl in config.json"
            )
        if not self.api_key:
            raise ValueError(
                "API Key is missing. Set the D1TABLE_KEY environment variable or configure d1table.apiKey in config.json"
            )
        self.session = requests.Session()
        self.session.headers.update({
            'X-API-Key': self.api_key,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        })

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """Send an HTTP request. Raises D1TableError on failure."""
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.request(
                method, url, timeout=self.timeout, **kwargs
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            raise D1TableError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except requests.exceptions.RequestException as e:
            raise D1TableError(str(e)) from e

    def _upload(self, endpoint: str, files: Dict, data: Optional[Dict] = None) -> Dict:
        """Send a multipart upload request."""
        url = f"{self.base_url}{endpoint}"
        headers = {'X-API-Key': self.api_key, 'Cache-Control': 'no-cache'}
        try:
            response = requests.post(url, files=files, data=data, headers=headers, timeout=self.timeout)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            raise D1TableError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except requests.exceptions.RequestException as e:
            raise D1TableError(str(e)) from e

    # ── Health ────────────────────────────────────────────────────

    def health_check(self) -> bool:
        """Check service health."""
        try:
            self._request('GET', '/api/health')
            return True
        except D1TableError:
            return False

    # ── Tables ────────────────────────────────────────────────────

    def list_tables(self) -> List[Dict]:
        """List all tables."""
        result = self._request('GET', '/api/tables')
        return result.get('data', [])

    def get_schema(self, table_name: str) -> Dict:
        """Get table schema including field metadata and field mapping."""
        result = self._request('GET', f'/api/tables/{table_name}')
        schema = result.get('data', {})
        fields_result = self._request('GET', f'/api/tables/{table_name}/fields')
        schema['fields'] = fields_result.get('data', [])
        field_mapping = {}
        for field in schema.get('fields', []):
            col_name = field.get('column_name')
            title = field.get('title')
            if col_name and title:
                field_mapping[col_name] = title
        schema['field_mapping'] = field_mapping
        return schema

    def create_table(self, name: str, title: str, columns: List[Dict]) -> Dict:
        """Create a new table.

        Args:
            name: API table name (e.g. 'tbl_orders01')
            title: Display name (e.g. 'Order Management')
            columns: List of column definitions, each with:
                - name: Column name
                - title: Display name
                - type: SQLite type (TEXT, INTEGER, REAL, BLOB)
                - field_type: UI type (text, number, email, date, checkbox, select, link, etc.)
                - not_null: Optional, default False
        """
        result = self._request('POST', '/api/tables', json={
            'name': name, 'title': title, 'columns': columns
        })
        return result.get('data', {})

    def update_table(self, table_name: str, **kwargs) -> Dict:
        """Update table properties (title, icon, is_locked)."""
        result = self._request('PATCH', f'/api/tables/{table_name}', json=kwargs)
        return result.get('data', {})

    def delete_table(self, table_name: str) -> bool:
        """Delete a table (moves to trash)."""
        try:
            self._request('DELETE', f'/api/tables/{table_name}')
            return True
        except D1TableError:
            return False

    # ── Fields ────────────────────────────────────────────────────

    def get_fields(self, table_name: str) -> List[Dict]:
        """Get full field metadata for a table."""
        result = self._request('GET', f'/api/tables/{table_name}/fields')
        return result.get('data', [])

    def get_field_mapping(self, table_name: str) -> Dict[str, str]:
        """Get field mapping (column_name -> display title)."""
        fields = self.get_fields(table_name)
        return {f['column_name']: f['title'] for f in fields if f.get('column_name') and f.get('title')}

    def add_field(self, table_name: str, title: str, field_type: str = 'text',
                  column_name: Optional[str] = None, **kwargs) -> Dict:
        """Add a new field to a table.

        Args:
            title: Field display name
            field_type: One of: text, longtext, number, currency, percent, email, url,
                        date, datetime, checkbox, select, image, link, totp, password
            column_name: Optional; auto-generated from title if omitted
            **kwargs: Additional options (select_options, link_table, link_display_field)
        """
        body = {'title': title, 'field_type': field_type, **kwargs}
        if column_name:
            body['column_name'] = column_name
        result = self._request('POST', f'/api/tables/{table_name}/fields', json=body)
        return result.get('data', {})

    def update_field(self, table_name: str, column_name: str, **kwargs) -> Dict:
        """Update field metadata (title, field_type, width, is_hidden, order_index, select_options)."""
        result = self._request('PATCH', f'/api/tables/{table_name}/fields/{column_name}', json=kwargs)
        return result.get('data', {})

    def delete_field(self, table_name: str, column_name: str) -> bool:
        """Delete (hide) a field."""
        try:
            self._request('DELETE', f'/api/tables/{table_name}/fields/{column_name}')
            return True
        except D1TableError:
            return False

    # ── Records ───────────────────────────────────────────────────

    def query_records(self, table_name: str, limit: int = 20, cursor: Optional[str] = None,
                      sort: Optional[str] = None, fields: Optional[str] = None,
                      q: Optional[str] = None, **filters) -> Dict:
        """Query records with pagination, filtering, sorting, and search.

        Filter operators: field, field__gt, field__gte, field__lt, field__lte,
                          field__like, field__nlike, field__ne
        """
        params = {'page_size': limit}
        if cursor:
            params['cursor'] = cursor
        if sort:
            params['sort'] = sort
        if fields:
            params['fields'] = fields
        if q:
            params['q'] = q
        for key, value in filters.items():
            params[f'filter[{key}]'] = value

        result = self._request('GET', f'/api/tables/{table_name}/records', params=params)

        for record in result.get('data', []):
            new_fields = {}
            for key, value in record.items():
                if isinstance(value, str) and _ISO_DATETIME_RE.match(value):
                    dt = parse_iso_datetime(value)
                    if dt:
                        new_fields[f'{key}_local'] = dt.strftime('%Y-%m-%d %H:%M:%S')
            record.update(new_fields)

        return result

    def search_records(self, table_name: str, q: str, limit: int = 20) -> List[Dict]:
        """Search records for link field resolution. Returns [{id, title}]."""
        result = self._request('GET', f'/api/tables/{table_name}/records/search',
                               params={'q': q, 'limit': limit})
        return result.get('data', [])

    def get_record(self, table_name: str, record_id: str) -> Dict:
        """Get a single record."""
        result = self._request('GET', f'/api/tables/{table_name}/records/{record_id}')
        return result.get('data', {})

    def insert_record(self, table_name: str, data: Dict) -> Dict:
        """Insert a record."""
        result = self._request('POST', f'/api/tables/{table_name}/records', json=data)
        return result.get('data', {})

    def update_record(self, table_name: str, record_id: str, data: Dict) -> Dict:
        """Update a record."""
        result = self._request('PATCH', f'/api/tables/{table_name}/records/{record_id}', json=data)
        return result.get('data', {})

    def delete_record(self, table_name: str, record_id: str) -> bool:
        """Delete a record."""
        try:
            self._request('DELETE', f'/api/tables/{table_name}/records/{record_id}')
            return True
        except D1TableError:
            return False

    def batch_insert(self, table_name: str, records: List[Dict]) -> Dict:
        """Batch insert records."""
        return self._request('POST', f'/api/tables/{table_name}/records/batch', json={'records': records})

    def export_records(self, table_name: str, fmt: str = 'csv', sort: Optional[str] = None,
                       fields: Optional[str] = None, **filters) -> bytes:
        """Export table records as CSV or JSON. Returns raw bytes."""
        params = {'format': fmt}
        if sort:
            params['sort'] = sort
        if fields:
            params['fields'] = fields
        for key, value in filters.items():
            params[f'filter[{key}]'] = value
        url = f"{self.base_url}/api/tables/{table_name}/export"
        response = self.session.get(url, params=params, timeout=self.timeout)
        response.raise_for_status()
        return response.content

    # ── Groups ────────────────────────────────────────────────────

    def list_groups(self) -> List[Dict]:
        """List all groups with their tables."""
        result = self._request('GET', '/api/groups')
        return result.get('data', [])

    def create_group(self, name: str) -> Dict:
        """Create a group."""
        result = self._request('POST', '/api/groups', json={'name': name})
        return result.get('data', {})

    def update_group(self, group_id: int, **kwargs) -> Dict:
        """Update group (name, sort_order)."""
        result = self._request('PATCH', f'/api/groups/{group_id}', json=kwargs)
        return result.get('data', {})

    def delete_group(self, group_id: int) -> bool:
        """Delete a group."""
        try:
            self._request('DELETE', f'/api/groups/{group_id}')
            return True
        except D1TableError:
            return False

    def set_group_tables(self, group_id: int, tables: List[str]) -> Dict:
        """Set tables in a group (full replace)."""
        result = self._request('PUT', f'/api/groups/{group_id}/tables', json={'tables': tables})
        return result.get('data', {})

    def set_group_keys(self, group_id: int, key_ids: List[int]) -> Dict:
        """Set API keys for a group (full replace)."""
        result = self._request('PUT', f'/api/groups/{group_id}/keys', json={'key_ids': key_ids})
        return result.get('data', {})

    # ── Notes ─────────────────────────────────────────────────────

    def list_notes(self, parent_id: Optional[str] = None) -> List[Dict]:
        """List notes. Pass parent_id to get children, omit for root notes."""
        params = {}
        if parent_id:
            params['parent_id'] = parent_id
        result = self._request('GET', '/api/notes', params=params)
        return result.get('data', [])

    def get_notes_tree(self) -> List[Dict]:
        """Get all active (non-archived) notes as a flat tree list."""
        result = self._request('GET', '/api/notes/tree')
        return result.get('data', [])

    def get_note(self, note_id: str) -> Dict:
        """Get a single note with full content."""
        result = self._request('GET', f'/api/notes/{note_id}')
        return result.get('data', {})

    def create_note(self, title: str = 'Untitled', content: str = '',
                    parent_id: Optional[str] = None) -> Dict:
        """Create a new note. Returns {id, title}."""
        body: Dict[str, Any] = {'title': title, 'content': content}
        if parent_id:
            body['parent_id'] = parent_id
        result = self._request('POST', '/api/notes', json=body)
        return result.get('data', {})

    def update_note(self, note_id: str, **kwargs) -> Dict:
        """Update note properties (title, content, icon, parent_id, sort_order, is_locked, cover, description)."""
        result = self._request('PATCH', f'/api/notes/{note_id}', json=kwargs)
        return result.get('data', {})

    def delete_note(self, note_id: str) -> bool:
        """Soft-delete a note and all its descendants."""
        try:
            self._request('DELETE', f'/api/notes/{note_id}')
            return True
        except D1TableError:
            return False

    def restore_note(self, note_id: str) -> Dict:
        """Restore a soft-deleted note and its descendants."""
        result = self._request('POST', f'/api/notes/{note_id}/restore')
        return result.get('data', {})

    def permanent_delete_note(self, note_id: str) -> bool:
        """Permanently delete a soft-deleted note."""
        try:
            self._request('DELETE', f'/api/notes/{note_id}/permanent')
            return True
        except D1TableError:
            return False

    def archive_note(self, note_id: str) -> Dict:
        """Archive a note and all its descendants."""
        result = self._request('POST', f'/api/notes/{note_id}/archive')
        return result.get('data', {})

    def unarchive_note(self, note_id: str) -> Dict:
        """Unarchive a note and all its descendants."""
        result = self._request('POST', f'/api/notes/{note_id}/unarchive')
        return result.get('data', {})

    def batch_archive_notes(self, ids: List[str]) -> Dict:
        """Batch archive multiple notes (max 50)."""
        result = self._request('POST', '/api/notes/batch-archive', json={'ids': ids})
        return result.get('data', {})

    def get_archived_roots(self, q: Optional[str] = None) -> List[Dict]:
        """Get Knowledge Base - root notes that have archived children."""
        params = {}
        if q:
            params['q'] = q
        result = self._request('GET', '/api/notes/archived', params=params)
        return result.get('data', [])

    def get_archived_children(self, root_id: str) -> List[Dict]:
        """Get archived children of a root note (for Knowledge Base detail)."""
        result = self._request('GET', f'/api/notes/{root_id}/archived-children')
        return result.get('data', [])

    def get_notes_trash(self, page: int = 1, page_size: int = 20) -> Dict:
        """Get soft-deleted notes."""
        result = self._request('GET', '/api/notes/trash', params={'page': page, 'page_size': page_size})
        return result

    # ── Upload ────────────────────────────────────────────────────

    def upload_image(self, thumb_path: str, display_path: str, name: str = 'image') -> Dict:
        """Upload an image (thumb + display). Returns {thumb, display, name, size}."""
        with open(thumb_path, 'rb') as t, open(display_path, 'rb') as d:
            files = {
                'thumb': ('thumb.webp', t, 'image/webp'),
                'display': ('display.webp', d, 'image/webp'),
            }
            result = self._upload('/api/upload/image', files=files, data={'name': name})
        return result.get('data', {})

    def delete_image(self, thumb: str, display: str) -> bool:
        """Delete uploaded image files from R2 storage."""
        try:
            self._request('DELETE', '/api/upload/image', json={'thumb': thumb, 'display': display})
            return True
        except D1TableError:
            return False


def main():
    """Command-line entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='D1Table Client')
    subparsers = parser.add_subparsers(dest='action', required=True)

    # Health
    subparsers.add_parser('health', help='Check service health')

    # Tables
    subparsers.add_parser('list-tables', help='List all tables')

    p = subparsers.add_parser('schema', help='Get table schema')
    p.add_argument('--table', required=True)

    p = subparsers.add_parser('create-table', help='Create a table')
    p.add_argument('--name', required=True)
    p.add_argument('--title', required=True)
    p.add_argument('--columns', required=True, help='JSON array of column definitions')

    p = subparsers.add_parser('delete-table', help='Delete a table')
    p.add_argument('--table', required=True)

    # Records
    p = subparsers.add_parser('query', help='Query records')
    p.add_argument('--table', required=True)
    p.add_argument('--limit', type=int, default=20)
    p.add_argument('--sort')
    p.add_argument('--filter', help='e.g. name:Alice')

    p = subparsers.add_parser('get', help='Get a single record')
    p.add_argument('--table', required=True)
    p.add_argument('--id', required=True)

    p = subparsers.add_parser('insert', help='Insert a record')
    p.add_argument('--table', required=True)
    p.add_argument('--data', required=True, help='JSON object')

    p = subparsers.add_parser('update', help='Update a record')
    p.add_argument('--table', required=True)
    p.add_argument('--id', required=True)
    p.add_argument('--data', required=True, help='JSON object')

    p = subparsers.add_parser('delete', help='Delete a record')
    p.add_argument('--table', required=True)
    p.add_argument('--id', required=True)

    # Notes
    p = subparsers.add_parser('list-notes', help='List notes')
    p.add_argument('--parent-id')

    p = subparsers.add_parser('notes-tree', help='Get notes tree')

    p = subparsers.add_parser('get-note', help='Get a note')
    p.add_argument('--id', required=True)

    p = subparsers.add_parser('create-note', help='Create a note')
    p.add_argument('--title', default='Untitled')
    p.add_argument('--content', default='')
    p.add_argument('--parent-id')

    p = subparsers.add_parser('delete-note', help='Soft-delete a note')
    p.add_argument('--id', required=True)

    p = subparsers.add_parser('archive-note', help='Archive a note')
    p.add_argument('--id', required=True)

    p = subparsers.add_parser('unarchive-note', help='Unarchive a note')
    p.add_argument('--id', required=True)

    p = subparsers.add_parser('archived-roots', help='List Knowledge Base roots')

    # Groups
    subparsers.add_parser('list-groups', help='List groups')

    p = subparsers.add_parser('create-group', help='Create a group')
    p.add_argument('--name', required=True)

    p = subparsers.add_parser('delete-group', help='Delete a group')
    p.add_argument('--id', required=True, type=int)

    args = parser.parse_args()
    client = D1TableClient()
    out = json.dumps

    if args.action == 'health':
        print("OK" if client.health_check() else "FAIL")

    elif args.action == 'list-tables':
        for t in client.list_tables():
            print(f"  {t.get('name')}  {t.get('title', '')}  ({t.get('row_count', 0)} rows)")

    elif args.action == 'schema':
        print(out(client.get_schema(args.table), indent=2, ensure_ascii=False))

    elif args.action == 'create-table':
        cols = json.loads(args.columns)
        print(out(client.create_table(args.name, args.title, cols), indent=2, ensure_ascii=False))

    elif args.action == 'delete-table':
        print("OK" if client.delete_table(args.table) else "FAIL")

    elif args.action == 'query':
        filters = {}
        if args.filter:
            k, v = args.filter.split(':', 1)
            filters[k] = v
        print(out(client.query_records(args.table, limit=args.limit, sort=args.sort, **filters), indent=2, ensure_ascii=False))

    elif args.action == 'get':
        print(out(client.get_record(args.table, args.id), indent=2, ensure_ascii=False))

    elif args.action == 'insert':
        print(out(client.insert_record(args.table, json.loads(args.data)), indent=2, ensure_ascii=False))

    elif args.action == 'update':
        print(out(client.update_record(args.table, args.id, json.loads(args.data)), indent=2, ensure_ascii=False))

    elif args.action == 'delete':
        print("OK" if client.delete_record(args.table, args.id) else "FAIL")

    elif args.action == 'list-notes':
        print(out(client.list_notes(args.parent_id), indent=2, ensure_ascii=False))

    elif args.action == 'notes-tree':
        print(out(client.get_notes_tree(), indent=2, ensure_ascii=False))

    elif args.action == 'get-note':
        print(out(client.get_note(args.id), indent=2, ensure_ascii=False))

    elif args.action == 'create-note':
        print(out(client.create_note(args.title, args.content, getattr(args, 'parent_id', None)), indent=2, ensure_ascii=False))

    elif args.action == 'delete-note':
        print("OK" if client.delete_note(args.id) else "FAIL")

    elif args.action == 'archive-note':
        print(out(client.archive_note(args.id), indent=2, ensure_ascii=False))

    elif args.action == 'unarchive-note':
        print(out(client.unarchive_note(args.id), indent=2, ensure_ascii=False))

    elif args.action == 'archived-roots':
        print(out(client.get_archived_roots(), indent=2, ensure_ascii=False))

    elif args.action == 'list-groups':
        print(out(client.list_groups(), indent=2, ensure_ascii=False))

    elif args.action == 'create-group':
        print(out(client.create_group(args.name), indent=2, ensure_ascii=False))

    elif args.action == 'delete-group':
        print("OK" if client.delete_group(args.id) else "FAIL")


if __name__ == '__main__':
    main()
