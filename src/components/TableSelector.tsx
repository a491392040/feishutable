import React, { useState, useMemo, useEffect } from 'react';
import { Card, Checkbox, Radio, Tag, Empty, Typography, Input, Space } from 'antd';
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
  /** 是否显示关键字匹配模式（仅多选模式） */
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
  /** 选择模式：manual=手动选择，keyword=关键字匹配 */
  const [selectMode, setSelectMode] = useState<'manual' | 'keyword'>('manual');
  /** 关键字输入 */
  const [keyword, setKeyword] = useState('');

  /** 根据关键字匹配的表（以关键字开头） */
  const matchedTables = useMemo(() => {
    if (!keyword.trim()) return [];
    const kw = keyword.trim();
    return tables.filter((t) => t.name.startsWith(kw));
  }, [tables, keyword]);

  /** 关键字模式下，自动更新选中项 */
  useEffect(() => {
    if (selectMode === 'keyword' && mode === 'multiple') {
      onChange(matchedTables.map((t) => t.id));
    }
  }, [selectMode, keyword, matchedTables, mode, onChange]);

  /** 切换模式时清空选择 */
  const handleModeChange = (newMode: 'manual' | 'keyword') => {
    setSelectMode(newMode);
    setKeyword('');
    if (newMode === 'manual') {
      onChange([]);
    }
  };

  /** 多选变更 */
  const handleCheckboxChange = (checkedValues: string[]) => {
    onChange(checkedValues);
  };

  /** 单选变更 */
  const handleRadioChange = (e: any) => {
    onChange([e.target.value]);
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

      {/* 模式切换（仅多选模式显示） */}
      {showKeywordSearch && mode === 'multiple' && (
        <div style={{ marginBottom: 12 }}>
          <Radio.Group
            value={selectMode}
            onChange={(e) => handleModeChange(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="manual">手动选择</Radio.Button>
            <Radio.Button value="keyword">关键字匹配</Radio.Button>
          </Radio.Group>
        </div>
      )}

      {/* 关键字匹配模式 */}
      {showKeywordSearch && mode === 'multiple' && selectMode === 'keyword' && (
        <div style={{ marginBottom: 12 }}>
          <Input
            placeholder="输入关键字，自动选择所有以该关键字开头的表"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            size="large"
          />
          {keyword.trim() && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                匹配到 {matchedTables.length} / {tables.length} 个数据表
                {matchedTables.length > 0 && (
                  <span>：{matchedTables.map((t) => t.name).join('、')}</span>
                )}
              </Text>
            </div>
          )}
          {/* 显示匹配的表（只读列表，不可勾选） */}
          <div style={{ marginTop: 12 }}>
            {matchedTables.length > 0 ? (
              matchedTables.map((table) => (
                <Card
                  key={table.id}
                  className="table-card table-card-selected"
                  size="small"
                  style={{ marginBottom: 8 }}
                >
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
                </Card>
              ))
            ) : keyword.trim() ? (
              <Text type="secondary">没有匹配的数据表</Text>
            ) : (
              <Text type="secondary">请输入关键字开始匹配</Text>
            )}
          </div>
        </div>
      )}

      {/* 手动选择模式 */}
      {mode === 'multiple' && (selectMode === 'manual' || !showKeywordSearch) && (
        <Checkbox.Group
          value={selectedIds}
          onChange={handleCheckboxChange}
          className="table-checkbox-group"
        >
          {tables.map((table) => (
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
      )}

      {/* 单选模式 */}
      {mode === 'single' && (
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
    </div>
  );
};

export default TableSelector;
