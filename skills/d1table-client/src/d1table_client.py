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
        # Handle UTC time ending with Z
        if iso_string.endswith('Z'):
            iso_string = iso_string[:-1] + '+00:00'
        dt = datetime.fromisoformat(iso_string)
        # Convert to local time
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
        # 1. Environment variables
        env_url = os.environ.get('D1TABLE_URL')
        env_key = os.environ.get('D1TABLE_KEY')
        env_timeout = os.environ.get('D1TABLE_TIMEOUT')

        # 2. config.json (only read when both arguments and env vars are missing)
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

    def health_check(self) -> bool:
        """Check service health."""
        try:
            self._request('GET', '/api/health')
            return True
        except D1TableError:
            return False

    def list_tables(self) -> List[Dict]:
        """List all tables."""
        result = self._request('GET', '/api/tables')
        return result.get('data', [])

    def get_schema(self, table_name: str) -> Dict:
        """Get table schema (v2.0.0 - includes field metadata)."""
        # Fetch basic table info
        result = self._request('GET', f'/api/tables/{table_name}')
        schema = result.get('data', {})

        # Fetch field metadata (includes title, field_type, etc.)
        fields_result = self._request('GET', f'/api/tables/{table_name}/fields')
        schema['fields'] = fields_result.get('data', [])

        # v2.0.0: Build field mapping (column_name -> title)
        field_mapping = {}
        for field in schema.get('fields', []):
            col_name = field.get('column_name')
            title = field.get('title')
            if col_name and title:
                field_mapping[col_name] = title
        schema['field_mapping'] = field_mapping

        return schema

    def get_field_mapping(self, table_name: str) -> Dict[str, str]:
        """Get field mapping (v2.0.0 - column_name -> title)."""
        result = self._request('GET', f'/api/tables/{table_name}/fields')
        fields = result.get('data', [])

        mapping = {}
        for field in fields:
            col_name = field.get('column_name')
            title = field.get('title')
            if col_name and title:
                mapping[col_name] = title

        return mapping

    def query_records(
        self,
        table_name: str,
        limit: int = 20,
        cursor: Optional[str] = None,
        sort: Optional[str] = None,
        fields: Optional[str] = None,
        **filters
    ) -> Dict:
        """Query records (v2.0.0 - supports ISO 8601 datetime and field mapping)."""
        params = {'page_size': limit}
        if cursor:
            params['cursor'] = cursor
        if sort:
            params['sort'] = sort
        if fields:
            params['fields'] = fields

        # Apply filter conditions
        for key, value in filters.items():
            params[f'filter[{key}]'] = value

        result = self._request(
            'GET',
            f'/api/tables/{table_name}/records',
            params=params
        )

        # v2.0.0: Process ISO 8601 datetime fields
        for record in result.get('data', []):
            new_fields = {}
            for key, value in record.items():
                if isinstance(value, str) and _ISO_DATETIME_RE.match(value):
                    dt = parse_iso_datetime(value)
                    if dt:
                        new_fields[f'{key}_local'] = dt.strftime('%Y-%m-%d %H:%M:%S')
            record.update(new_fields)

        return result

    def get_record(self, table_name: str, record_id: str) -> Dict:
        """Get a single record."""
        result = self._request(
            'GET',
            f'/api/tables/{table_name}/records/{record_id}'
        )
        return result.get('data', {})

    def insert_record(self, table_name: str, data: Dict) -> Dict:
        """Insert a record."""
        result = self._request(
            'POST',
            f'/api/tables/{table_name}/records',
            json=data
        )
        return result.get('data', {})

    def update_record(self, table_name: str, record_id: str, data: Dict) -> Dict:
        """Update a record."""
        result = self._request(
            'PATCH',
            f'/api/tables/{table_name}/records/{record_id}',
            json=data
        )
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
        result = self._request(
            'POST',
            f'/api/tables/{table_name}/records/batch',
            json={'records': records}
        )
        return result


def main():
    """Command-line entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='D1Table Client')
    parser.add_argument('action', choices=[
        'health', 'list-tables', 'schema', 'query',
        'get', 'insert', 'update', 'delete'
    ])
    parser.add_argument('--table', help='Table name')
    parser.add_argument('--id', help='Record ID')
    parser.add_argument('--data', help='JSON data')
    parser.add_argument('--limit', type=int, default=20, help='Number of records to return')
    parser.add_argument('--filter', help='Filter condition, e.g.: name:Alice')

    args = parser.parse_args()

    client = D1TableClient()

    if args.action == 'health':
        if client.health_check():
            print("✅ D1Table is healthy")
        else:
            print("❌ D1Table is unhealthy")

    elif args.action == 'list-tables':
        tables = client.list_tables()
        print(f"Found {len(tables)} table(s):")
        for table in tables:
            print(f"  - {table.get('name')} ({table.get('row_count', 0)} row(s))")

    elif args.action == 'schema':
        if not args.table:
            print("❌ Please specify --table")
            return
        schema = client.get_schema(args.table)
        print(json.dumps(schema, indent=2, ensure_ascii=False))

    elif args.action == 'query':
        if not args.table:
            print("❌ Please specify --table")
            return
        filters = {}
        if args.filter:
            key, value = args.filter.split(':', 1)
            filters[key] = value
        result = client.query_records(args.table, limit=args.limit, **filters)
        print(json.dumps(result, indent=2, ensure_ascii=False))

    elif args.action == 'get':
        if not args.table or not args.id:
            print("❌ Please specify --table and --id")
            return
        record = client.get_record(args.table, args.id)
        print(json.dumps(record, indent=2, ensure_ascii=False))

    elif args.action == 'insert':
        if not args.table or not args.data:
            print("❌ Please specify --table and --data")
            return
        data = json.loads(args.data)
        record = client.insert_record(args.table, data)
        print(json.dumps(record, indent=2, ensure_ascii=False))

    elif args.action == 'update':
        if not args.table or not args.id or not args.data:
            print("❌ Please specify --table, --id, and --data")
            return
        data = json.loads(args.data)
        record = client.update_record(args.table, args.id, data)
        print(json.dumps(record, indent=2, ensure_ascii=False))

    elif args.action == 'delete':
        if not args.table or not args.id:
            print("❌ Please specify --table and --id")
            return
        if client.delete_record(args.table, args.id):
            print("✅ Deleted successfully")
        else:
            print("❌ Delete failed")


if __name__ == '__main__':
    main()
