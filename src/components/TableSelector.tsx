import React, { useState, useMemo } from 'react';
import { Card, Checkbox, Radio, Tag, Empty, Typography, Input, Button, Space } from 'antd';
import { TableOutlined, UnorderedListOutlined, SearchOutlined } from '@ant-design/icons';
import type { ITableMeta } from '@/types';

const { Text } = Typography;

interface ITableSelectorProps {
  /** 可选表格列表 */
  tables: ITableMeta[];
  /** 已选中的表格 ID */
  selectedIds: string[];
  /** 选择模式 */
  mode: 'multiple' | 'single';
  /** 标题 */
  title: string;
  /** 描述文字 */
  description: string;
  /** 选择变更回调 */
  onChange: (ids: string[]) => void;
  /** 是否显示关键字搜索（仅多选模式） */
  showKeywordSearch?: boolean;
}

const TableSelector: React.FC<ITableSelectorProps> = ({
  tables,
  selectedIds,
  mode,
  title,
  description,
  onChange,
  showKeywordSearch = false,
}) => {
  const [keyword, setKeyword] = useState('');

  /** 根据关键字过滤的表 */
  const filteredTables = useMemo(() => {
    if (!keyword.trim()) return tables;
    const kw = keyword.trim().toLowerCase();
    return tables.filter((t) => t.name.toLowerCase().includes(kw));
  }, [tables, keyword]);

  /** 匹配的表 ID 集合 */
  const filteredIds = useMemo(() => new Set(filteredTables.map((t) => t.id)), [filteredTables]);

  /** 多选变更 */
  const handleCheckboxChange = (checkedValues: string[]) => {
    onChange(checkedValues);
  };

  /** 单选变更 */
  const handleRadioChange = (e: any) => {
    onChange([e.target.value]);
  };

  /** 全选匹配项 */
  const handleSelectAllMatched = () => {
    const matchedIds = filteredTables.map((t) => t.id);
    // 合并：保留已选中的 + 新匹配的
    const merged = Array.from(new Set([...selectedIds, ...matchedIds]));
    onChange(merged);
  };

  /** 清除匹配项 */
  const handleClearMatched = () => {
    const remaining = selectedIds.filter((id) => !filteredIds.has(id));
    onChange(remaining);
  };

  /** 清空所有选择 */
  const handleClearAll = () => {
    onChange([]);
  };

  if (tables.length === 0) {
    return (
      <div className="table-selector">
        <div className="section-header">
          <h3>{title}</h3>
          <Text type="secondary">{description}</Text>
        </div>
        <Empty
          description="暂无可用数据表"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  return (
    <div className="table-selector">
      <div className="section-header">
        <h3>{title}</h3>
        <Text type="secondary">{description}</Text>
      </div>

      {/* 关键字搜索区域 */}
      {showKeywordSearch && mode === 'multiple' && (
        <div style={{ marginBottom: 12 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="输入关键字匹配表名（如：销售、Q1）"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
            />
            <Button
              type="primary"
              onClick={handleSelectAllMatched}
              disabled={filteredTables.length === 0}
            >
              全选匹配 ({filteredTables.length})
            </Button>
            <Button
              onClick={handleClearMatched}
              disabled={filteredTables.length === 0 || selectedIds.length === 0}
            >
              移除匹配
            </Button>
            <Button
              onClick={handleClearAll}
              disabled={selectedIds.length === 0}
            >
              清空
            </Button>
          </Space.Compact>
          {keyword.trim() && (
            <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
              匹配到 {filteredTables.length} / {tables.length} 个数据表
              {filteredTables.length > 0 && (
                <span>：{filteredTables.map((t) => t.name).join('、')}</span>
              )}
            </Text>
          )}
        </div>
      )}

      {/* 显示的表列表：有搜索关键字时只显示匹配的，否则显示全部 */}
      {mode === 'multiple' ? (
        <Checkbox.Group
          value={selectedIds}
          onChange={handleCheckboxChange}
          className="table-checkbox-group"
        >
          {(keyword.trim() ? filteredTables : tables).map((table) => (
            <Card
              key={table.id}
              className={`table-card ${selectedIds.includes(table.id) ? 'table-card-selected' : ''}`}
              size="small"
            >
              <Checkbox value={table.id}>
                <div className="table-card-content">
                  <div className="table-card-name">
                    <TableOutlined />
                    <span>{table.name}</span>
                  </div>
                  <div className="table-card-meta">
                    <Tag color="blue" icon={<UnorderedListOutlined />}>
                      {table.fields.length} 个字段
                    </Tag>
                    <Tag color="green">
                      {table.recordCount ?? 0} 条记录
                    </Tag>
                  </div>
                </div>
              </Checkbox>
            </Card>
          ))}
        </Checkbox.Group>
      ) : (
        <Radio.Group
          value={selectedIds[0] || ''}
          onChange={handleRadioChange}
          className="table-radio-group"
        >
          {tables.map((table) => (
            <Card
              key={table.id}
              className={`table-card ${selectedIds.includes(table.id) ? 'table-card-selected' : ''}`}
              size="small"
            >
              <Radio value={table.id}>
                <div className="table-card-content">
                  <div className="table-card-name">
                    <TableOutlined />
                    <span>{table.name}</span>
                  </div>
                  <div className="table-card-meta">
                    <Tag color="blue" icon={<UnorderedListOutlined />}>
                      {table.fields.length} 个字段
                    </Tag>
                    <Tag color="green">
                      {table.recordCount ?? 0} 条记录
                    </Tag>
                  </div>
                </div>
              </Radio>
            </Card>
          ))}
        </Radio.Group>
      )}

      {/* 有搜索关键字时，底部显示未匹配但已选中的表 */}
      {keyword.trim() && mode === 'multiple' && selectedIds.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {selectedIds
            .filter((id) => !filteredIds.has(id))
            .map((id) => {
              const table = tables.find((t) => t.id === id);
              if (!table) return null;
              return (
                <Tag
                  key={id}
                  closable
                  onClose={() => onChange(selectedIds.filter((sid) => sid !== id))}
                  color="orange"
                  style={{ marginBottom: 4 }}
                >
                  {table.name}（未匹配）
                </Tag>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default TableSelector;
