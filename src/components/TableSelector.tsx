import React from 'react';
import { Card, Checkbox, Radio, Tag, Empty, Typography } from 'antd';
import { TableOutlined, UnorderedListOutlined } from '@ant-design/icons';
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
}

const TableSelector: React.FC<ITableSelectorProps> = ({
  tables,
  selectedIds,
  mode,
  title,
  description,
  onChange,
}) => {
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

      {mode === 'multiple' ? (
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
    </div>
  );
};

export default TableSelector;
