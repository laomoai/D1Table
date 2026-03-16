#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
D1Table Client - 基于 Cloudflare D1 的数据表管理
"""

import json
import os
import requests
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any


def parse_iso_datetime(iso_string: str) -> datetime:
    """解析 ISO 8601 时间字符串为本地时间"""
    if not iso_string:
        return None
    try:
        # 处理带 Z 的 UTC 时间
        if iso_string.endswith('Z'):
            iso_string = iso_string[:-1] + '+00:00'
        dt = datetime.fromisoformat(iso_string)
        # 转换为本地时间
        if dt.tzinfo:
            dt = dt.astimezone()
        return dt
    except:
        return None


class D1TableClient:
    """D1Table API 客户端"""
    
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None,
                 config_path: Optional[str] = None):
        """初始化客户端

        优先级（从高到低）：
        1. 构造函数参数 base_url / api_key
        2. 环境变量 D1TABLE_URL / D1TABLE_KEY
        3. config.json 文件（openclaw workspace 或技能目录）
        """
        # 1. 环境变量
        env_url = os.environ.get('D1TABLE_URL')
        env_key = os.environ.get('D1TABLE_KEY')

        # 2. config.json（仅在参数和环境变量都缺失时读取）
        file_url, file_key, file_timeout = None, None, 30
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
                file_timeout = cfg.get('timeout', 30)

        self.base_url = (base_url or env_url or file_url or '').rstrip('/')
        self.api_key = api_key or env_key or file_key or ''
        self.timeout = file_timeout

        if not self.base_url:
            raise ValueError(
                "缺少 D1Table 地址，请设置环境变量 D1TABLE_URL 或在 config.json 中配置 d1table.baseUrl"
            )
        if not self.api_key:
            raise ValueError(
                "缺少 API Key，请设置环境变量 D1TABLE_KEY 或在 config.json 中配置 d1table.apiKey"
            )
        self.session = requests.Session()
        self.session.headers.update({
            'X-API-Key': self.api_key,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        })
    
    def _request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """发送 HTTP 请求"""
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.request(
                method, url, timeout=self.timeout, **kwargs
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": str(e)}
    
    def health_check(self) -> bool:
        """健康检查"""
        result = self._request('GET', '/api/health')
        return 'error' not in result
    
    def list_tables(self) -> List[Dict]:
        """获取所有表列表"""
        result = self._request('GET', '/api/tables')
        return result.get('data', [])
    
    def get_schema(self, table_name: str) -> Dict:
        """获取表结构（v2.0.0 - 包含字段元数据）"""
        # 获取表基本信息
        result = self._request('GET', f'/api/tables/{table_name}')
        schema = result.get('data', {})
        
        # 获取字段元数据（包含 title、field_type 等）
        fields_result = self._request('GET', f'/api/tables/{table_name}/fields')
        schema['fields'] = fields_result.get('data', [])
        
        # v2.0.0: 构建字段映射（column_name -> title）
        field_mapping = {}
        for field in schema.get('fields', []):
            col_name = field.get('column_name')
            title = field.get('title')
            if col_name and title:
                field_mapping[col_name] = title
        schema['field_mapping'] = field_mapping
        
        return schema
    
    def get_field_mapping(self, table_name: str) -> Dict[str, str]:
        """获取字段映射（v2.0.0 - column_name -> title）"""
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
        """查询记录（v2.0.0 - 支持 ISO 8601 时间和字段映射）"""
        params = {'page_size': limit}
        if cursor:
            params['cursor'] = cursor
        if sort:
            params['sort'] = sort
        if fields:
            params['fields'] = fields
        
        # 添加筛选条件
        for key, value in filters.items():
            params[f'filter[{key}]'] = value
        
        result = self._request(
            'GET',
            f'/api/tables/{table_name}/records',
            params=params
        )
        
        # v2.0.0: 处理 ISO 8601 时间格式
        for record in result.get('data', []):
            new_fields = {}
            for key, value in record.items():
                if isinstance(value, str) and 'T' in value:
                    # 可能是 ISO 8601 时间
                    dt = parse_iso_datetime(value)
                    if dt:
                        # 添加格式化后的本地时间字段
                        new_fields[f'{key}_local'] = dt.strftime('%Y-%m-%d %H:%M:%S')
            record.update(new_fields)
        
        return result
    
    def get_record(self, table_name: str, record_id: str) -> Dict:
        """获取单条记录"""
        result = self._request(
            'GET',
            f'/api/tables/{table_name}/records/{record_id}'
        )
        return result.get('data', {})
    
    def insert_record(self, table_name: str, data: Dict) -> Dict:
        """新增记录"""
        result = self._request(
            'POST',
            f'/api/tables/{table_name}/records',
            json=data
        )
        return result.get('data', {})
    
    def update_record(self, table_name: str, record_id: str, data: Dict) -> Dict:
        """更新记录"""
        result = self._request(
            'PATCH',
            f'/api/tables/{table_name}/records/{record_id}',
            json=data
        )
        return result.get('data', {})
    
    def delete_record(self, table_name: str, record_id: str) -> bool:
        """删除记录"""
        result = self._request(
            'DELETE',
            f'/api/tables/{table_name}/records/{record_id}'
        )
        return 'error' not in result
    
    def batch_insert(self, table_name: str, records: List[Dict]) -> Dict:
        """批量插入记录"""
        result = self._request(
            'POST',
            f'/api/tables/{table_name}/records/batch',
            json={'records': records}
        )
        return result


def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description='D1Table Client')
    parser.add_argument('action', choices=[
        'health', 'list-tables', 'schema', 'query',
        'get', 'insert', 'update', 'delete'
    ])
    parser.add_argument('--table', help='表名')
    parser.add_argument('--id', help='记录ID')
    parser.add_argument('--data', help='JSON 数据')
    parser.add_argument('--limit', type=int, default=20, help='返回数量')
    parser.add_argument('--filter', help='筛选条件，如: name:张三')
    
    args = parser.parse_args()
    
    client = D1TableClient()
    
    if args.action == 'health':
        if client.health_check():
            print("✅ D1Table 服务正常")
        else:
            print("❌ D1Table 服务异常")
    
    elif args.action == 'list-tables':
        tables = client.list_tables()
        print(f"共 {len(tables)} 个表:")
        for table in tables:
            print(f"  - {table.get('name')} ({table.get('row_count', 0)} 条)")
    
    elif args.action == 'schema':
        if not args.table:
            print("❌ 请指定 --table")
            return
        schema = client.get_schema(args.table)
        print(json.dumps(schema, indent=2, ensure_ascii=False))
    
    elif args.action == 'query':
        if not args.table:
            print("❌ 请指定 --table")
            return
        filters = {}
        if args.filter:
            key, value = args.filter.split(':', 1)
            filters[key] = value
        result = client.query_records(args.table, limit=args.limit, **filters)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    
    elif args.action == 'get':
        if not args.table or not args.id:
            print("❌ 请指定 --table 和 --id")
            return
        record = client.get_record(args.table, args.id)
        print(json.dumps(record, indent=2, ensure_ascii=False))
    
    elif args.action == 'insert':
        if not args.table or not args.data:
            print("❌ 请指定 --table 和 --data")
            return
        data = json.loads(args.data)
        record = client.insert_record(args.table, data)
        print(json.dumps(record, indent=2, ensure_ascii=False))
    
    elif args.action == 'update':
        if not args.table or not args.id or not args.data:
            print("❌ 请指定 --table、--id 和 --data")
            return
        data = json.loads(args.data)
        record = client.update_record(args.table, args.id, data)
        print(json.dumps(record, indent=2, ensure_ascii=False))
    
    elif args.action == 'delete':
        if not args.table or not args.id:
            print("❌ 请指定 --table 和 --id")
            return
        if client.delete_record(args.table, args.id):
            print("✅ 删除成功")
        else:
            print("❌ 删除失败")


if __name__ == '__main__':
    main()
