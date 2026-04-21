import React from 'react';
import { Card, Switch, Radio, Select, Typography, Space, Alert } from 'antd';
import { FilterOutlined, StopOutlined, EditOutlined } from '@ant-design/icons';
import type { ITableMeta, IDedupConfig } from '@/types';

const { Text } = Typography;

interface IDedupConfigProps {
  /** 去重配置 */
  config: IDedupConfig;
  /** 目标表 */
  targetTable: ITableMeta | null;
  /** 配置变更回调 */
  onChange: (config: IDedupConfig) => void;
}

const DedupConfig: React.FC<IDedupConfigProps> = ({
  config,
  targetTable,
  onChange,
}) => {
  /** 切换启用/禁用 */
  const handleToggle = (checked: boolean) => {
    onChange({ ...config, enabled: checked });
  };

  /** 修改去重模式 */
  const handleModeChange = (e: any) => {
    onChange({ ...config, mode: e.target.value, dedupFields: [] });
  };

  /** 修改去重字段 */
  const handleDedupFieldsChange = (values: string[]) => {
    onChange({ ...config, dedupFields: values });
  };

  /** 修改去重策略 */
  const handleStrategyChange = (e: any) => {
    onChange({ ...config, strategy: e.target.value });
  };

  return (
    <Card
      title={
        <Space>
          <FilterOutlined />
          <span>去重配置</span>
        </Space>
      }
      size="small"
      className="dedup-config-card"
    >
      {/* 启用开关 */}
      <div className="dedup-toggle">
        <Text>启用去重</Text>
        <Switch checked={config.enabled} onChange={handleToggle} size="small" />
      </div>

      {config.enabled && (
        <div className="dedup-options">
          {/* 去重模式 */}
          <div className="dedup-section">
            <Text className="dedup-label">去重依据</Text>
            <Radio.Group
              value={config.mode}
              onChange={handleModeChange}
              size="small"
            >
              <Radio value="all_fields">全字段匹配</Radio>
              <Radio value="specified_fields">指定字段匹配</Radio>
            </Radio.Group>
          </div>

          {/* 指定去重字段 */}
          {config.mode === 'specified_fields' && targetTable && (
            <div className="dedup-section">
              <Text className="dedup-label">选择去重字段</Text>
              <Select
                mode="multiple"
                value={config.dedupFields}
                onChange={handleDedupFieldsChange}
                placeholder="请选择用于判断重复的字段"
                size="small"
                className="dedup-field-select"
                options={targetTable.fields.map((f) => ({
                  value: f.id,
                  label: f.name,
                }))}
              />
            </div>
          )}

          {/* 去重策略 */}
          <div className="dedup-section">
            <Text className="dedup-label">重复处理策略</Text>
            <Radio.Group
              value={config.strategy}
              onChange={handleStrategyChange}
              size="small"
            >
              <Radio value="skip">
                <Space>
                  <StopOutlined />
                  <span>跳过重复</span>
                </Space>
              </Radio>
              <Radio value="overwrite">
                <Space>
                  <EditOutlined />
                  <span>覆盖重复</span>
                </Space>
              </Radio>
            </Radio.Group>
          </div>

          {/* 策略说明 */}
          <Alert
            type="info"
            showIcon
            className="dedup-alert"
            message={
              config.strategy === 'skip'
                ? '跳过策略：遇到与目标表中已有数据重复的记录时，将跳过该条记录不写入。'
                : '覆盖策略：遇到与目标表中已有数据重复的记录时，将用源表数据覆盖目标表中的对应记录。'
            }
          />
        </div>
      )}
    </Card>
  );
};

export default DedupConfig;
