import React from 'react';
import { Card, Select, Switch, Input, Typography, Tag, Space, Tooltip } from 'antd';
import { ScissorOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { IFieldMeta, ISplitConfig } from '@/types';

const { Text } = Typography;

interface ISplitFieldConfigProps {
  /** 可选字段列表（所有源表的字段） */
  fields: IFieldMeta[];
  /** 当前拆分配置 */
  config: ISplitConfig;
  /** 配置变更回调 */
  onConfigChange: (config: ISplitConfig) => void;
}

const SplitFieldConfig: React.FC<ISplitFieldConfigProps> = ({
  fields,
  config,
  onConfigChange,
}) => {
  /** 更新配置 */
  const update = (partial: Partial<ISplitConfig>) => {
    onConfigChange({ ...config, ...partial });
  };

  /** 切换启用 */
  const handleEnabledChange = (enabled: boolean) => {
    if (!enabled) {
      update({ enabled: false, primaryFieldId: '', primaryFieldName: '', syncFieldIds: [], syncFieldNames: [], separator: '' });
    } else {
      update({ enabled: true });
    }
  };

  /** 主字段选项（排除已选为同步字段的） */
  const primaryFieldOptions = fields.map((f) => ({
    value: f.id,
    label: f.name,
  }));

  /** 同步字段选项（排除主字段） */
  const syncFieldOptions = fields
    .filter((f) => f.id !== config.primaryFieldId)
    .map((f) => ({
      value: f.id,
      label: f.name,
    }));

  return (
    <Card
      title={
        <Space>
          <ScissorOutlined />
          <span>字段拆分</span>
        </Space>
      }
      size="small"
      className="split-field-card"
    >
      <div className="mapping-description">
        <Text type="secondary">
          启用后，合并时将按分隔符把一条记录拆分为多条记录写入目标表
        </Text>
      </div>

      {/* 启用开关 */}
      <div style={{ marginBottom: 12 }}>
        <Space>
          <Switch
            checked={config.enabled}
            onChange={handleEnabledChange}
            size="small"
          />
          <Text>启用字段拆分</Text>
        </Space>
      </div>

      {config.enabled && (
        <div className="split-config-content">
          {/* 主字段 */}
          <div style={{ marginBottom: 12 }}>
            <Space align="center">
              <Text strong>主字段</Text>
              <Tooltip title="该字段的值按分隔符拆分，决定拆分成几条记录">
                <QuestionCircleOutlined style={{ color: '#bfbfbf', fontSize: 12 }} />
              </Tooltip>
            </Space>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择主字段"
              size="small"
              value={config.primaryFieldId || undefined}
              onChange={(val) => {
                const field = fields.find((f) => f.id === val);
                update({
                  primaryFieldId: val,
                  primaryFieldName: field?.name || '',
                });
              }}
              options={primaryFieldOptions}
            />
          </div>

          {/* 分隔符 */}
          <div style={{ marginBottom: 12 }}>
            <Text strong>分隔符</Text>
            <Input
              style={{ marginTop: 4 }}
              placeholder="如：, 或 / 或 |"
              size="small"
              value={config.separator}
              onChange={(e) => update({ separator: e.target.value })}
            />
          </div>

          {/* 同步拆分字段 */}
          <div>
            <Space align="center">
              <Text strong>同步拆分字段</Text>
              <Tooltip title="这些字段与主字段一一对应拆分，需使用相同分隔符">
                <QuestionCircleOutlined style={{ color: '#bfbfbf', fontSize: 12 }} />
              </Tooltip>
            </Space>
            <Select
              mode="multiple"
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择同步拆分字段（可选）"
              size="small"
              value={config.syncFieldIds}
              onChange={(vals) => {
                const names = vals.map((id) => fields.find((f) => f.id === id)?.name || '');
                update({ syncFieldIds: vals, syncFieldNames: names });
              }}
              options={syncFieldOptions}
            />
            {config.syncFieldIds.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  已选 {config.syncFieldIds.length} 个同步字段
                </Text>
              </div>
            )}
          </div>

          {/* 示例说明 */}
          {config.primaryFieldId && config.separator && (
            <div style={{
              marginTop: 12,
              padding: '8px 12px',
              background: 'var(--bg-secondary, #f5f5f5)',
              borderRadius: 6,
              fontSize: 12,
            }}>
              <Text type="secondary">
                示例：主字段值为 {"A" + config.separator + "B" + config.separator + "C"}，将拆分为 3 条记录
                {config.syncFieldNames.length > 0 && (
                  <span>，同步字段 {config.syncFieldNames.join('、')} 也会对应拆分</span>
                )}
              </Text>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default SplitFieldConfig;
